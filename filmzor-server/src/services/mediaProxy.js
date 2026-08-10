import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { callWebshare } from "./webshareClient.js";

// Webshare odkazy majú obmedzenú platnosť — krátka cache nech pri seeku
// (viacero requestov za sebou) nevoláme Webshare/ffprobe zakaždým znova.
const CACHE_TTL_MS = 4 * 60 * 1000;
const sourceCache = new Map();

function fetchContentLength(url) {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, { method: "HEAD" }, (res) => {
      resolve(Number(res.headers["content-length"]) || 0);
      res.resume();
    });
    req.on("error", () => resolve(0));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

function probeDuration(url) {
  return new Promise((resolve) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      url,
    ];
    const proc = spawn(ffprobeStatic.path, args);
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

async function getSourceInfo(ident, wst) {
  const cached = sourceCache.get(ident);
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

  const [size, duration] = await Promise.all([
    fetchContentLength(linkResponse.link),
    probeDuration(linkResponse.link),
  ]);

  const info = { url: linkResponse.link, size, duration, expiresAt: Date.now() + CACHE_TTL_MS };
  sourceCache.set(ident, info);
  return info;
}

/**
 * Živý remux streamu: video sa kopíruje bez prekódovania (rýchle, bez straty
 * kvality), zvuk sa prekóduje na AAC (prehliadače natívne nevedia AC3/DTS,
 * bežné pri CZ/SK dabingu), výstup je fragmentovaný MP4 v kontajneri, ktorý
 * HTML5 <video> vie prehrať priamo. Webshare `.mkv` súbor tak funguje
 * spoľahlivo bez ohľadu na pôvodný kontajner/zvukový kodek.
 *
 * Range hlavička (seek v prehrávači) sa rieši reštartom ffmpeg s `-ss` na
 * odhadnutý čas (rangeStart/totalSize * duration) — presné bajtové
 * pokračovanie nie je pri živom prekódovaní možné, ale pre plynulé
 * pretáčanie je tento odhad v praxi dostatočný.
 */
export async function streamMovie({ ident, wst, rangeHeader, res }) {
  const info = await getSourceInfo(ident, wst);

  let seekSeconds = 0;

  if (rangeHeader && info.size > 0) {
    const match = /bytes=(\d+)-/.exec(rangeHeader);
    if (match) {
      const rangeStart = Number(match[1]);
      if (rangeStart > 0) {
        const ratio = Math.min(rangeStart / info.size, 0.98);
        seekSeconds = info.duration ? ratio * info.duration : 0;
      }
    }
  }

  const args = [
    "-loglevel", "error",
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

  const ffmpeg = spawn(ffmpegPath, args);

  // Content-Length sa TU nedá nastaviť — `info.size` je veľkosť PÔVODNÉHO
  // súboru na Webshare, ale posiela sa prekódovaný výstup (iný zvukový
  // kodek, iný kontajner) s úplne inou veľkosťou. Nesprávny Content-Length
  // spôsobí, že klient/proxy čaká na bajty, ktoré nikdy nedorazia (alebo
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

  ffmpeg.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `ffmpeg sa nepodarilo spustiť: ${err.message}` });
    } else {
      res.destroy();
    }
  });

  ffmpeg.on("close", (code) => {
    if (code && code !== 0 && !res.writableEnded && stderrTail) {
      // Klient prerušil prehrávanie skôr, než ffmpeg dokončil — bežný jav pri seeku/zavretí, netreba logovať ako chybu.
      console.error("[mediaProxy] ffmpeg skončilo s chybou:", stderrTail);
    }
  });

  res.on("close", () => {
    if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
  });

  ffmpeg.stdout.pipe(res);
}
