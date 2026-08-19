import { spawn } from "node:child_process";
import { callWebshare } from "./webshareClient.js";

// Systémové ffmpeg/ffprobe (nainštalované cez apt v Dockerfile), NIE balíky
// ffmpeg-static/ffprobe-static — ich zabalená statická binárka spoľahlivo
// padala so SIGSEGV pri akomkoľvek HTTP vstupe v tomto kontajneri (Fly.io
// Firecracker VM), nezávisle od konkrétneho súboru. Systémová binárka
// zlinkovaná pre presne toto prostredie tento problém nemá.
const ffmpegPath = "ffmpeg";
const ffprobePath = "ffprobe";

// Webshare odkazy majú obmedzenú platnosť — krátka cache nech pri seeku
// (viacero requestov za sebou) nevoláme Webshare/ffprobe zakaždým znova.
const CACHE_TTL_MS = 4 * 60 * 1000;
const sourceCache = new Map();

// Kľúč MUSÍ obsahovať wst, nielen ident — inak by cache vrátila odkaz
// vygenerovaný z Webshare účtu prvého používateľa aj druhému používateľovi,
// ktorý si v rámci CACHE_TTL_MS pozrie ten istý film z INÉHO účtu (cudzia
// kvóta/limit by sa tak nevedomky spotrebovala z účtu toho prvého).
function getCacheKey(ident, wst) {
  return `${ident}:${wst}`;
}

// Záznam sa inak uvoľní len "lenivo" (keď na ten istý ident+wst príde ďalší
// request) — ident, ktorý sa prehral raz a nikdy znova, by inak v pamäti
// zostal navždy. Na dlhobežnom stroji (Fly.io min_machines_running=1) by to
// časom neohraničene rástlo. .unref() nech tento interval nedrží proces
// bežať sám o sebe.
const CACHE_SWEEP_INTERVAL_MS = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sourceCache) {
    if (value.expiresAt <= now) sourceCache.delete(key);
  }
}, CACHE_SWEEP_INTERVAL_MS).unref();

function probeDuration(url) {
  return new Promise((resolve) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      url,
    ];
    const proc = spawn(ffprobePath, args);
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.on("close", () => {
      const value = parseFloat(out.trim());
      resolve(Number.isFinite(value) ? value : 0);
    });
    proc.on("error", () => resolve(0));
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // proces už mohol skončiť
      }
      resolve(0);
    }, 10000);
    proc.on("close", () => clearTimeout(timer));
  });
}

export async function getSourceInfo(ident, wst) {
  const cacheKey = getCacheKey(ident, wst);
  const cached = sourceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const linkResponse = await callWebshare("/file_link/", {
    ident,
    wst,
    download_type: "video_stream",
  });

  if (!linkResponse.link) {
    const err = new Error("Webshare nevrátilo odkaz na stiahnutie.");
    err.status = 502;
    throw err;
  }

  const duration = await probeDuration(linkResponse.link);

  const info = { url: linkResponse.link, duration, expiresAt: Date.now() + CACHE_TTL_MS };
  sourceCache.set(cacheKey, info);
  return info;
}

// Bezpečnostná rezerva pred koncom súboru — seek presne na/za koniec by ffmpeg
// nechal skončiť bez jediného snímku (nerozlíšiteľné od skutočne mŕtveho zdroja).
const END_SAFETY_MARGIN_SECONDS = 3;

/**
 * Živý remux streamu: video sa kopíruje bez prekódovania (rýchle, bez straty
 * kvality), zvuk sa prekóduje na AAC (prehliadače natívne nevedia AC3/DTS,
 * bežné pri CZ/SK dabingu), výstup je fragmentovaný MP4 v kontajneri, ktorý
 * HTML5 <video> vie prehrať priamo. Webshare `.mkv` súbor tak funguje
 * spoľahlivo bez ohľadu na pôvodný kontajner/zvukový kodek.
 *
 * Pretáčanie: keďže výstup nemá known duration/seek index (empty_moov, živé
 * prekódovanie), natívne Range-based seekovanie v prehliadači nefunguje —
 * frontend namiesto toho posiela presný `startSeconds` (viď GET
 * /stream/:ident?t=), ktorý sa mapuje priamo na ffmpeg `-ss`.
 */
export async function streamMovie({ ident, wst, startSeconds, res }) {
  const info = await getSourceInfo(ident, wst);

  const rawStart = Math.max(0, Number(startSeconds) || 0);
  const seekSeconds = info.duration > 0
    ? Math.min(rawStart, Math.max(0, info.duration - END_SAFETY_MARGIN_SECONDS))
    : rawStart;

  const args = [
    "-loglevel", "error",
    // Bez tohto ffmpeg pri výpadku/zaseknutí zdrojového Webshare spojenia
    // (napr. po ~30 min, pravdepodobne nejaký limit na strane Webshare CDN)
    // len ticho čaká na ďalšie bajty donekonečna — proces nikdy neskončí,
    // odpoveď sa nikdy neuzavrie a video vyzerá "zaseknuté" bez akejkoľvek
    // chyby. -rw_timeout (mikrosekundy) prinúti ffmpeg po výpadku vstupu
    // zlyhať rýchlo, čo cez ffmpeg.on("close") korektne ukončí response —
    // frontend to potom (viď useTitlePlayer.js) potichu automaticky obnoví.
    "-rw_timeout", "15000000",
    ...(seekSeconds > 0 ? ["-ss", seekSeconds.toFixed(2)] : []),
    "-i", info.url,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-f", "mp4",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-avoid_negative_ts", "make_zero",
    "pipe:1",
  ];

  const spawnedAt = Date.now();
  const ffmpeg = spawn(ffmpegPath, args);

  // Content-Length sa tu vopred nedá nastaviť — pôvodný súbor na Webshare
  // sa prekóduje na úplne iný výstup (iný zvukový kodek, iný kontajner) s
  // inou veľkosťou, ktorú vopred nepoznáme. Nesprávny Content-Length by
  // spôsobil, že klient/proxy čaká na bajty, ktoré nikdy nedorazia (alebo
  // spojenie spadne, keď sa deklarovaný počet prekročí) — appka sa navonok
  // tvári, že "chvíľu načítava a potom nič". Namiesto 206 s (nutne
  // nepresným) Content-Range vraciame vždy 200 s chunked prenosom; seek
  // funguje aj tak vďaka `-ss` reštartu ffmpeg vyššie, len nie je striktne
  // spec-presný partial-content response.
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.status(200);

  let stderrTail = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  let bytesWritten = 0;
  ffmpeg.stdout.on("data", (chunk) => {
    bytesWritten += chunk.length;
  });

  ffmpeg.on("error", (err) => {
    console.error("[mediaProxy] ffmpeg sa nepodarilo spustiť:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `ffmpeg sa nepodarilo spustiť: ${err.message}` });
    } else {
      res.destroy();
    }
  });

  ffmpeg.on("close", (code, signal) => {
    const elapsedMs = Date.now() - spawnedAt;
    // res.writableEnded tu nie je spoľahlivý indikátor "klient sa odpojil" —
    // .pipe() zavolá res.end() automaticky aj keď ffmpeg skončí bez toho, že
    // by čokoľvek zapísal, takže by to skutočné zlyhanie potichu zamaskovalo.
    // Namiesto toho porovnávame, či reálne odišli nejaké dáta.
    if (bytesWritten === 0 && seekSeconds === 0) {
      // Webshare občas priradí dočasne nedostupný CDN edge — zahoď cache,
      // nech ďalší pokus (klik na "Prehrať" znova) dostane čerstvý odkaz
      // namiesto opakovaného čakania na ten istý nefunkčný, až kým
      // nevyprší CACHE_TTL_MS. Len pri studenom štarte (seekSeconds===0) —
      // pri seeku blízko konca súboru je krátky/prázdny výstup legitímny
      // a nesúvisí s dostupnosťou CDN.
      const cacheKey = getCacheKey(ident, wst);
      if (sourceCache.get(cacheKey) === info) sourceCache.delete(cacheKey);
      console.error(
        `[mediaProxy] ffmpeg skončil po ${elapsedMs}ms (kód ${code}, signal ${signal}) bez odoslania čo i len jedného bajtu, zdroj=${info.url}, stderr:`,
        stderrTail || "(prázdne)"
      );
    } else if (bytesWritten === 0) {
      console.warn(
        `[mediaProxy] ffmpeg skončil po ${elapsedMs}ms bez dát pri seeku na ${seekSeconds}s (pravdepodobne blízko konca súboru)`
      );
    } else if (code && code !== 0 && stderrTail) {
      console.error(`[mediaProxy] ffmpeg skončil s chybou (kód ${code}) po ${bytesWritten} bajtoch:`, stderrTail);
    }
  });

  res.on("close", () => {
    if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
  });

  ffmpeg.stdout.pipe(res);
}
