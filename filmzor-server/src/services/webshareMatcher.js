import { callWebshare, toArray } from "./webshareClient.js";

// ---------------------------------------------------------------------------
// Typy (JSDoc — projekt beží ako plain JS/ESM bez TS build kroku, toto dáva
// editorom typovú kontrolu bez pridávania toolchainu).
//
// Movie/Series/SeriesSeason/SeriesEpisode sú navyše ROZŠÍRENÉ o metadáta
// konkrétneho súboru (name, sizeFormatted, audioTags, isCam, qualityWarning,
// quality, languages, hasSubtitles, ident) nad rámec zadania — frontend
// (MovieModal/TvDetailView, services/webshare.js) tieto polia už používa na
// zobrazenie zoznamu zdrojov a spustenie prehrávania, takže objekty sú
// stavané ako superset požadovaného rozhrania, nie jeho výmena.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Movie
 * @property {string} id
 * @property {"movie"} type
 * @property {string} title
 * @property {string} fileId
 * @property {number} size
 * @property {boolean} yearConfirmed - či názov súboru obsahuje hľadaný rok (+/-1); `false` neznamená zlú zhodu, len nižšiu prioritu (viď sortFiles)
 */

/**
 * @typedef {Object} SeriesEpisode
 * @property {number} episodeNumber
 * @property {string} fileId
 * @property {string} title
 * @property {number} size
 */

/**
 * @typedef {Object} SeriesSeason
 * @property {number} seasonNumber
 * @property {SeriesEpisode[]} episodes
 */

/**
 * @typedef {Object} Series
 * @property {string} id
 * @property {"series"} type
 * @property {string} title
 * @property {SeriesSeason[]} seasons
 */

// ---------------------------------------------------------------------------
// 1. Normalizácia a fuzzy keyword matching
// ---------------------------------------------------------------------------

// Diakritiku preč (NFD + zmazanie combining marks), lowercase, "." "_" "-" na
// medzeru, zvyšná interpunkcia tiež na medzeru, viacnásobné medzery zbalené.
// "The.Last_of-Us" aj "The Last of Us" aj "THE LAST OF US" -> "the last of us".
export function normalizeSearchText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Bežné krátke spojky/členy — samy osebe nie sú dostatočným dôkazom zhody
// názvu (inak by "the"/"a" naviazali takmer čokoľvek).
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for", "by", "is", "with", "from",
  "aj", "na", "do", "za", "po", "od", "je", "sa", "si", "to", "pri", "pre", "so", "zo", "vo", "ku", "ako", "ale",
]);

// Release tagy a kvalita/jazyk, ktoré sa pri porovnávaní NÁZVU ignorujú — sú
// to vlastnosti súboru, nie súčasť titulu filmu/seriálu.
const NOISE_WORDS = new Set([
  "480p", "576p", "720p", "1080p", "1440p", "2160p", "4320p", "4k", "8k", "uhd", "fullhd", "fhd", "qhd", "hd", "sd", "hq",
  "bluray", "blu", "ray", "brrip", "bdrip", "bdremux", "remux", "webrip", "webdl", "web", "dl", "hdtv", "dvdrip", "dvd",
  "hdrip", "rip", "cam", "camrip", "hdcam", "telesync", "hdts", "ts", "screener", "scr",
  "x264", "x265", "h264", "h265", "hevc", "avc", "xvid", "divx", "av1", "10bit", "8bit", "hdr", "hdr10", "dv", "sdr",
  "mkv", "mp4", "avi", "mov", "wmv", "m4v", "webm", "mpg", "mpeg", "flv",
  "aac", "ac3", "dts", "dtshd", "ddp", "dd", "atmos", "truehd", "dual", "multi", "5ch", "6ch", "7ch", "2ch",
  "cz", "cze", "sk", "svk", "en", "eng", "english", "dabing", "dab", "dabingu", "titulky", "tit", "sub", "subs",
  "subbed", "dublado", "legendado", "hcsub", "hc", "czsub", "sksub",
  "extended", "unrated", "theatrical", "directors", "cut", "proper", "repack", "internal", "limited",
  "complete", "imax", "open", "matte", "remastered",
]);

// Významové slová názvu na porovnávanie (bez stopwords, min. 2 znaky). Pre
// veľmi krátke názvy zložené len zo stopwords (napr. jednoslovné tituly) sa
// vráti nefiltrovaný rozklad, nech vyhľadávanie nezostane bez kľúčových slov.
export function extractKeywords(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const words = normalized.split(" ").filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return words.length > 0 ? words : normalized.split(" ").filter(Boolean);
}

// Odstráni release/kvalita/jazyk tokeny a osamotené 4-ciferné roky z už
// normalizovaného textu — použité pri porovnávaní názvu súboru, nech
// "1080p"/"cz"/"x264" a pod. neovplyvňujú zhodu.
//
// `keywords` (hľadané slová AKTUÁLNEHO zdroja názvu) sa NIKDY neodfiltrujú,
// aj keby vyzerali ako rok — bez tejto výnimky by film s číselným názvom
// (napr. "1917", "2012", "1984") vrátil VŽDY nula výsledkov: token "1917"
// je zároveň jediné kľúčové slovo aj to, čo rok-regex odstráni z každého
// kandidátneho súboru, takže matchesAllKeywords by ho nikdy nenašla.
function stripNoiseWords(normalizedText, keywords = []) {
  const keywordSet = new Set(keywords);
  return normalizedText
    .split(" ")
    .filter((tok) => {
      if (!tok) return false;
      if (keywordSet.has(tok)) return true;
      if (NOISE_WORDS.has(tok)) return false;
      return !/^(19|20)\d{2}$/.test(tok);
    })
    .join(" ");
}

// Fuzzy Search: substring matching namiesto exaktnej zhody — súbor musí
// obsahovať VŠETKY kľúčové slová zo zadania (v ľubovoľnom poradí, s
// čímkoľvek medzi nimi), nič viac sa nevyžaduje.
export function matchesAllKeywords(normalizedFileName, keywords) {
  return keywords.length > 0 && keywords.every((kw) => normalizedFileName.includes(kw));
}

// Alias zredukovaný na jediné kľúčové slovo (bežné pri krátkych názvoch ako
// "Odysea", "It", "Up") má oveľa vyššie riziko, že "sedí" aj na úplne iný
// titul, ktorý to isté slovo náhodou obsahuje (napr. "Odysea" ->
// "Baraka - Odysea Zeme", "Čínská odysea") — substring matching s jediným
// slovom to nevie samo osebe odlíšiť.
function isWeakAlias(keywords) {
  return keywords.length <= 1;
}

// Skúsi zhodu voči KTORÉMUKOĽVEK zo zdrojov názvu (SK/CZ lokalizovaný,
// originálny, český alternatívny) — stačí, že súbor sedí na jeden z nich.
// Pre "slabý" (1-slovný) alias navyše vyžaduje potvrdený rok (ak ho poznáme)
// — nestačí, že súbor rok neuvádza, musí ho priamo potvrdzovať. Bez tejto
// prídavnej podmienky by jediné generické slovo prepustilo takmer čokoľvek.
function matchesAnyTitleSource(file, keywordSets, yearInfo, yearKnown) {
  const normalizedName = normalizeSearchText(file.name);
  return keywordSets.some((keywords) => {
    // Šum sa odstraňuje per-keywordSet (nie raz vopred) — rôzne zdroje
    // názvu (SK/CZ/originál/alternatívny) môžu mať iné kľúčové slová, ktoré
    // treba pred odstránením roku/šumu chrániť inak pre každý z nich.
    const cleanName = stripNoiseWords(normalizedName, keywords);
    if (!matchesAllKeywords(cleanName, keywords)) return false;
    if (isWeakAlias(keywords) && yearKnown) return yearInfo.confirmed;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 2. Séria/epizóda — regex parser pre S01E05 / 1x05 / "Season 1 Episode 5" /
//    "Séria 1 Epizóda 5" (a drobné varianty: medzery/bodky medzi časťami,
//    chýbajúce nuly — "S1E5").
// ---------------------------------------------------------------------------

// Poradie zámerné: najprv najpresnejší/najbežnejší tvar (SxxExx), až potom
// voľnejšie tvary. Vzory bežia na už normalizovanom (diakritika/bodky/
// podčiarniky preč, lowercase) texte, preto "Séria"/"Epizóda" nižšie stačí
// zapísať bez diakritiky.
const EPISODE_CODE_PATTERNS = [
  /\bs\s*(\d{1,3})\s*e\s*(\d{1,3})\b/i, // S01E05, s1e5, S01 E05
  /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i, // 1x05, 01x05
  // Medzera medzi "season <n>" a "episode <n>" pôvodne smela obsahovať len
  // ne-číslice (\D) — bežný číselný tag kvality medzi nimi (napr.
  // "Season 1 2160p Episode 5") tak vzor nikdy nenašiel. "." (ľubovoľný
  // znak, lenivo) to rieši; kotva na "episode"/"epizoda" hneď za medzerou
  // drží zhodu úzku aj tak.
  /\bseason\s*(\d{1,3}).{0,15}?episode\s*(\d{1,3})\b/i, // Season 1 Episode 5
  /\bseria\s*(\d{1,3}).{0,15}?epizoda\s*(\d{1,3})\b/i, // Séria 1 Epizóda 5
];

// Rozumné hranice pre sanity-check — bez toho by napr. "1x05" vzor teoreticky
// (aj keď v praxi zriedka, viď poznámka nižšie) mohol zachytiť časť inak
// znejúceho tokenu. Žiadny reálny seriál nemá 500+ sérií ani 999+ epizód v sezóne.
const MAX_SEASON = 60;
const MAX_EPISODE = 999;

// Vráti { season, episode } alebo null, ak názov súboru neobsahuje
// rozpoznateľný kód série/epizódy v žiadnom z podporovaných formátov.
export function parseEpisodeCode(filename) {
  const normalized = normalizeSearchText(filename);
  for (const pattern of EPISODE_CODE_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (season >= 1 && season <= MAX_SEASON && episode >= 1 && episode <= MAX_EPISODE) {
      return { season, episode };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Analýza názvu súboru — jazyk, titulky, kvalita, CAM/TELESYNC, veľkosť
// ---------------------------------------------------------------------------

const LANGUAGE_PATTERNS = {
  SK: /\b(SK|SVK|Slovensk[ýy])\b/i,
  CZ: /\b(CZ|CZE|Česk[ýy]|Cesky|Dabing)\b/i,
  EN: /\b(EN|ENG|English)\b/i,
};

const SUBTITLE_PATTERN = /\b(TIT|SUB|SUBBED|Titulky)\b/i;

const RESOLUTION_PATTERNS = [
  { label: "2160p", re: /\b(4K|2160p)\b/i },
  { label: "1080p", re: /\b1080p\b/i },
  { label: "720p", re: /\b720p\b/i },
];

// CAM sa kontroluje ako prvá — ide o kvalitatívne najhorší "zdroj" a chceme ho
// vedieť odlíšiť od BluRay/WEB-DL/HDTV jednoznačne (súbor nemôže byť oboje naraz).
const SOURCE_PATTERNS = [
  { label: "CAM", re: /\b(CAMRip|HDCAM|TELESYNC|CAM|TS)\b/i, isCam: true },
  { label: "BluRay", re: /\bblu[- ]?ray\b/i },
  { label: "WEB-DL", re: /\bweb[- ]?dl\b/i },
  { label: "HDTV", re: /\bhdtv\b/i },
];

export function detectLanguages(filename = "") {
  return Object.keys(LANGUAGE_PATTERNS).filter((code) => LANGUAGE_PATTERNS[code].test(filename));
}

export function hasSubtitles(filename = "") {
  return SUBTITLE_PATTERN.test(filename);
}

export function detectQuality(filename = "") {
  const resolution = RESOLUTION_PATTERNS.find((p) => p.re.test(filename))?.label || null;
  const sourceMatch = SOURCE_PATTERNS.find((p) => p.re.test(filename));
  return {
    resolution,
    source: sourceMatch?.label || null,
    isCam: Boolean(sourceMatch?.isCam),
  };
}

// Prehľadné audio tagy pre zobrazenie ("CZ dabing", "SK dabing", "EN", "Titulky").
function buildAudioTags(filename) {
  const dubbed = /\bdab(ing)?\b/i.test(filename);
  const tags = detectLanguages(filename).map((code) =>
    (code === "CZ" || code === "SK") && dubbed ? `${code} dabing` : code
  );
  if (hasSubtitles(filename)) tags.push("Titulky");
  return tags;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

// Surový Webshare file objekt (ident/name/size/type/...) -> obohatený,
// appkou používaný tvar. Toto je jediné miesto, kde sa "surové" dáta z
// Webshare API menia na niečo, čo appka číta.
function normalizeFile(f) {
  const sizeBytes = Number(f.size) || 0;
  const quality = detectQuality(f.name);
  return {
    ident: f.ident,
    name: f.name,
    type: f.type,
    sizeBytes,
    sizeFormatted: formatBytes(sizeBytes),
    img: f.img || null,
    // fast-xml-parser (parseTagValue:true, viď webshareClient.js) parsuje
    // <password>1</password> na JS ČÍSLO 1, nie reťazec "1" — porovnanie
    // s "1" by tak bolo vždy false a appka by heslom chránené súbory nikdy
    // neoznačila ako chránené.
    isPasswordProtected: String(f.password) === "1",
    positiveVotes: Number(f.positive_votes) || 0,
    negativeVotes: Number(f.negative_votes) || 0,
    languages: detectLanguages(f.name),
    hasSubtitles: hasSubtitles(f.name),
    audioTags: buildAudioTags(f.name),
    quality,
    isCam: quality.isCam,
    qualityWarning: quality.isCam ? "KINO KVALITA / CAM" : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Filtrovanie, rok, dedup, zoradenie
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(["mkv", "avi", "mp4", "mov", "wmv", "m4v", "ts", "webm", "flv", "mpg", "mpeg"]);
// "Making of"/bonus obsah zdieľa titul aj rok s hlavným filmom (rovnaký
// alias, rovnaký potvrdený rok), takže ho vyššie uvedená kontrola roku
// neodfiltruje — treba ho vylúčiť explicitne podľa mena.
const BLOCKED_WORDS_RE = /\b(trailer|sample|soundtrack|ost|featurette)\b|making\W{0,3}of|behind\W{0,3}the\W{0,3}scenes/i;

function isBlocked(file) {
  if (BLOCKED_WORDS_RE.test(file.name)) return true;
  if (!VIDEO_EXTENSIONS.has((file.type || "").toLowerCase())) return true;
  return false;
}

function extractYearsFromName(name) {
  const matches = name.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  return matches.map(Number);
}

// Rok +/-1 tolerancia (release dátumy sa medzi trhmi/edíciami mierne líšia).
// Súbor s rokom MIMO tolerancie sa zahodí (`passes: false`) — inak by sa
// napr. pri hľadaní "Spider-Man" (2002) natiahli aj jeho pokračovania z
// iných rokov. Súbor BEZ akéhokoľvek roku v názve sa nezahadzuje (nevieme
// posúdiť), len dostane `confirmed: false` a teda nižšiu prioritu v sortFiles.
//
// `seriesMode`: pri seriáloch je `year` first_air_date CELÉHO seriálu, no
// súbor konkrétnej neskoršej sezóny bežne v názve nesie SVOJ VLASTNÝ
// (neskorší) rok — vyžadovanie zhody +/-1 s prvým uvedením by tak
// systematicky vyraďovalo platné súbory neskorších sezón. Namiesto toho sa
// vyžaduje len, aby rok v názve nebol PRED prvým uvedením mínus tolerancia
// — jednosmerná podmienka, ktorá nikdy nesprávne nevyradí neskoršiu sezónu,
// ale stále odfiltruje zjavne iné/staršie dielo s tým istým slovom v názve.
function evaluateYear(file, year, seriesMode = false) {
  if (!year) return { passes: true, confirmed: false };
  const yearsInName = extractYearsFromName(file.name);
  if (yearsInName.length === 0) return { passes: true, confirmed: false };
  const target = Number(year);
  const matches = seriesMode
    ? yearsInName.some((y) => y >= target - 1)
    : yearsInName.some((y) => Math.abs(y - target) <= 1);
  return { passes: matches, confirmed: matches };
}

// Odstráni súbory s rovnakým názvom AJ rovnakou veľkosťou (rôzne re-uploady/
// zrkadlá toho istého súboru na Webshare majú rôzny `ident`, ale identický
// obsah) — dedup len podľa `ident` toto nezachytí.
function dedupeByNameAndSize(files) {
  const seen = new Set();
  const result = [];
  for (const file of files) {
    const key = `${file.name.trim().toLowerCase()}::${file.sizeBytes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

// Skutočný CZ/SK DABING (zvuková stopa), nie len prítomnosť CZ/SK jazykového
// tagu — ten istý "CZ" tag sa na Webshare bežne píše aj pri súboroch, ktoré
// majú cudzí zvuk a len CZ/SK TITULKY (napr. "EN.CZtit", "CZ titulky").
// Ak je súbor označený ako titulky (`hasSubtitles`) a názov neobsahuje
// explicitné slovo "dab"/"dabing", ide skôr o titulky k cudziemu zvuku než
// o dabing, aj keď CZ/SK jazykový tag sedí.
function hasCzSkDub(file) {
  const hasCzOrSk = file.languages.includes("CZ") || file.languages.includes("SK");
  if (!hasCzOrSk) return false;
  if (file.hasSubtitles && !/\bdab(ing)?\b/i.test(file.name)) return false;
  return true;
}

// 1. CAM/TELESYNC súbory úplne na koniec zoznamu bez ohľadu na čokoľvek iné.
// 2. CZ/SK DABING pred cudzím dabingom/titulkami — toto je hlavné triedenie,
//    ktoré chce používateľ vidieť ako dva bloky výsledkov.
// 3. Súbory s potvrdeným rokom v názve (yearConfirmed) pred tými, kde rok
//    chýba a teda ho nevieme overiť — "nižšia priorita, nie zahodenie".
// 4. Väčšia veľkosť súboru napokon (v rámci bloku/roku = lepšia kvalita).
function sortFiles(files) {
  return [...files].sort((a, b) => {
    if (a.isCam !== b.isCam) return a.isCam ? 1 : -1;
    if (a._czSkDub !== b._czSkDub) return a._czSkDub ? -1 : 1;
    if (a.yearConfirmed !== b.yearConfirmed) return a.yearConfirmed ? -1 : 1;
    return b.sizeBytes - a.sizeBytes;
  });
}

// Veľkostné pásma (GB), zhora nadol — použité na to, aby výsledný zoznam
// obsahoval aj menšie súbory, nielen samé niekoľko desiatok GB veľké remuxy.
const SIZE_TIER_BOUNDARIES_GB = [15, 8, 4, 2, 0];

function sizeTierIndex(sizeBytes) {
  const gb = sizeBytes / 1024 ** 3;
  return SIZE_TIER_BOUNDARIES_GB.findIndex((bound) => gb >= bound);
}

// Namiesto čistého "prvých N podľa veľkosti" (čo by pri dostatku veľkých
// súborov vrátilo len samé desiatky GB ťažké remuxy) sa vyberá striedavo po
// jednom z každého veľkostného pásma — najprv najväčší z každého pásma,
// potom druhý najväčší z každého atď., kým sa nenaplní `limit`. Poradie
// súborov v rámci pásma (CAM/dabing/rok/veľkosť z `sortFiles`) ostáva
// zachované, diverzita sa pridáva navyše, nie namiesto.
function selectSizeDiverse(files, limit) {
  if (files.length <= limit) return files;

  const tiers = new Map();
  for (const file of files) {
    const tier = sizeTierIndex(file.sizeBytes);
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier).push(file);
  }
  const tierOrder = Array.from(tiers.keys()).sort((a, b) => a - b);

  const selected = [];
  for (let round = 0; selected.length < limit; round++) {
    let addedThisRound = false;
    for (const tier of tierOrder) {
      if (selected.length >= limit) break;
      const bucket = tiers.get(tier);
      if (round < bucket.length) {
        selected.push(bucket[round]);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
  }
  return selected;
}

// Finálny výber do `limit` výsledkov: CZ/SK dabing blok (veľkostne
// diverzifikovaný) PRED cudzím dabingom/titulkami blokom (tiež
// diverzifikovaným) — cudzí blok doplní len toľko miest, koľko po CZ/SK
// bloku ostane voľných.
export function selectDiverseTop(sortedFiles, limit) {
  const czSk = sortedFiles.filter((f) => f._czSkDub && !f.isCam);
  const foreign = sortedFiles.filter((f) => !f._czSkDub && !f.isCam);
  const cam = sortedFiles.filter((f) => f.isCam);

  const czSkPicked = selectSizeDiverse(czSk, limit);
  const foreignPicked = selectSizeDiverse(foreign, Math.max(0, limit - czSkPicked.length));
  const rest = [...czSkPicked, ...foreignPicked];
  const camPicked = selectSizeDiverse(cam, Math.max(0, limit - rest.length));

  return [...rest, ...camPicked];
}

// ---------------------------------------------------------------------------
// 5. Movie/Series mapovanie
// ---------------------------------------------------------------------------

/** @returns {Movie} */
function toMovie(file, title) {
  return {
    ...file,
    id: file.ident,
    type: "movie",
    title,
    fileId: file.ident,
    size: file.sizeBytes,
  };
}

/** @returns {Series} */
export function groupFilesIntoSeries(files, seriesTitle) {
  const seasonsMap = new Map();

  for (const file of files) {
    const code = parseEpisodeCode(file.name);
    if (!code) continue; // súbor bez rozpoznateľného SxxExx kódu sa do stromu sérií nezaradí
    if (!seasonsMap.has(code.season)) seasonsMap.set(code.season, []);
    seasonsMap.get(code.season).push({
      ...file,
      episodeNumber: code.episode,
      fileId: file.ident,
      title: file.name,
      size: file.sizeBytes,
    });
  }

  const seasons = Array.from(seasonsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, episodes]) => ({
      seasonNumber,
      // Viac súborov pre tú istú epizódu (rôzna kvalita) ostáva ako viac
      // záznamov s rovnakým episodeNumber — zoradené tak, že najlepšia
      // kvalita/veľkosť je prvá.
      episodes: episodes.sort((a, b) => a.episodeNumber - b.episodeNumber || b.size - a.size),
    }));

  return {
    id: normalizeSearchText(seriesTitle).replace(/\s+/g, "-") || "series",
    type: "series",
    title: seriesTitle,
    seasons,
  };
}

/**
 * Hlavná funkcia: príjme surové (už zlúčené naprieč aliasmi) Webshare file
 * objekty a vráti vyfiltrované, namapované dáta. Súbor prejde, ak sedí
 * ASPOŇ NA JEDEN z `titles` (originálny/CZ/SK alias) — nemusí sedieť na
 * všetky naraz.
 *
 * @param {any[]} rawFiles - surové objekty z Webshare `/search/` (ident, name, size, type, ...)
 * @param {{mode?: "movie"|"series", titles: string[], year?: number|string|null}} opts
 * @returns {Movie[]|Series[]}
 */
export function parseWebshareResults(rawFiles, { mode = "movie", titles = [], year } = {}) {
  const nameSources = titles.filter(Boolean);
  const keywordSets = nameSources.map(extractKeywords);
  const primaryTitle = nameSources[0] || "";

  const yearKnown = Boolean(year);
  const seriesMode = mode === "series";
  const matched = toArray(rawFiles)
    .map(normalizeFile)
    .filter((file) => !isBlocked(file))
    .map((file) => ({ file, yearInfo: evaluateYear(file, year, seriesMode) }))
    .filter(({ yearInfo }) => yearInfo.passes)
    .filter(({ file, yearInfo }) => matchesAnyTitleSource(file, keywordSets, yearInfo, yearKnown))
    .map(({ file, yearInfo }) => ({ ...file, yearConfirmed: yearInfo.confirmed, _czSkDub: hasCzSkDub(file) }));

  const files = sortFiles(dedupeByNameAndSize(matched));

  if (mode === "series") {
    return [groupFilesIntoSeries(files, primaryTitle)];
  }

  // Film: vylúč všetko, čo regex z bodu 2 rozpozná ako seriálovú epizódu.
  return files.filter((file) => !parseEpisodeCode(file.name)).map((file) => toMovie(file, primaryTitle));
}

// ---------------------------------------------------------------------------
// 6. Webshare API — vyhľadávanie a verejné vstupné body pre routes/webshare.js
// ---------------------------------------------------------------------------

// Webshare dopyt ide so `sort: "largest"` (viď fetchRawFilesForTitle nižšie)
// — pri populárnych tituloch s množstvom veľkých re-uploadov/remuxov tak
// prvých pár desiatok výsledkov vie byť takmer výhradne 15GB+ 4K súborov a
// menšie (napr. bežné 1080p ~2-4GB) verzie sa do stiahnutého poolu vôbec
// nedostanú — selectSizeDiverse nižšie ich potom nemá odkiaľ vybrať, aj keď
// v skutočnosti na Webshare existujú. 100 -> 250 dáva menším veľkostným
// pásmam reálnu šancu byť medzi stiahnutými kandidátmi.
const WEBSHARE_FETCH_LIMIT = 250;

// Koľko aliasov z `titles` sa naraz posiela na Webshare (Promise.all).
// Viac než 3 väčšinou len naťahuje čas odpovede bez reálneho prínosu —
// ďalšie aliasy (napr. 4. a 5. v poli) sa v praxi zvyčajne prekrývajú
// s prvými tromi (originál/CZ/SK).
const DEFAULT_MAX_PARALLEL_TITLES = 3;

// Pošle na Webshare `/search/` IBA holý názov (žiadny rok, SxxExx kód ani
// kvalita v dopyte) — všetko filtrovanie/priraďovanie k sériám/zahadzovanie
// nesprávnych výsledkov beží lokálne v parseWebshareResults nad výsledným poľom.
async function fetchRawFilesForTitle(queryTitle, { category, sort, offset, wst }) {
  if (!queryTitle) return [];
  const response = await callWebshare("/search/", {
    what: queryTitle,
    category: category || "video",
    sort: sort || "largest",
    limit: WEBSHARE_FETCH_LIMIT,
    offset,
    wst,
  });
  return toArray(response.file);
}

// Multi-Title/Alias Search: concurrent fetch (Promise.all) cez prvých
// `maxParallelTitles` aliasov naraz — originálny aj CZ/SK názov sa hľadajú
// súčasne namiesto sekvenčného "skús jeden, potom druhý", pretože uploaderi
// na Webshare nie sú konzistentní v tom, pod akým regionálnym názvom súbor
// pomenujú. Výsledky sa zlúčia a odduplikujú podľa Webshare `ident`
// (ten istý súbor sa môže vrátiť pri viacerých aliasoch naraz).
async function fetchAndMergeRawFiles(titles, { category, sort, offset, wst, maxParallelTitles = DEFAULT_MAX_PARALLEL_TITLES } = {}) {
  const queriedTitles = titles.filter(Boolean).slice(0, maxParallelTitles);
  const resultsPerTitle = await Promise.all(
    queriedTitles.map((t) => fetchRawFilesForTitle(t, { category, sort, offset, wst }))
  );

  const merged = new Map();
  resultsPerTitle.forEach((files) => {
    for (const file of files) {
      const key = file.ident ?? file.id;
      if (key == null || merged.has(key)) continue;
      merged.set(key, file);
    }
  });

  return { rawFiles: Array.from(merged.values()), queriedTitles };
}

function requireTitles(titles) {
  const cleaned = (titles || []).filter(Boolean);
  if (cleaned.length === 0) {
    const err = new Error("Chýba aspoň jeden názov na vyhľadávanie (titles).");
    err.status = 400;
    throw err;
  }
  return cleaned;
}

/**
 * Priamy vstupný bod pre Multi-Title/Alias Search: concurrent fetch cez
 * pole regionálnych aliasov, zlúčenie+dedup, lokálny fuzzy filter voči
 * VŠETKÝM aliasom naraz a rok +/-1 tolerancia.
 *
 * @param {string[]} titles - napr. ["Odysea", "Oddysea", "The Odyssey"], v poradí dôležitosti
 * @param {{ year?: number|null, mode?: "movie"|"series", category?: string, sort?: string, limit?: number, offset?: number, wst?: string, maxParallelTitles?: number }} opts
 * @returns {Promise<Movie[]|Series[]>}
 */
export async function searchTitlesOnWebshare(titles, {
  year = null,
  mode = "movie",
  category = "video",
  sort = "largest",
  limit = 10,
  offset = 0,
  wst,
  maxParallelTitles = DEFAULT_MAX_PARALLEL_TITLES,
} = {}) {
  const cleanTitles = requireTitles(titles);
  const { rawFiles } = await fetchAndMergeRawFiles(cleanTitles, { category, sort, offset, wst, maxParallelTitles });
  const results = parseWebshareResults(rawFiles, { mode, titles: cleanTitles, year });
  return mode === "series" ? results : selectDiverseTop(results, Number(limit) || 10);
}

// ---------------------------------------------------------------------------
// 7. routes/webshare.js kontrakt — nezmenený vstup/výstup (title/
//    originalTitle/alternateTitle, { files, queriedPhrases, isLooselyMatched,
//    noResults }), postavený nad searchTitlesOnWebshare vyššie.
// ---------------------------------------------------------------------------

export async function searchMovieOnWebshare({
  title,
  originalTitle,
  alternateTitle,
  year,
  category = "video",
  sort = "largest",
  limit = 10,
  offset = 0,
  wst,
} = {}) {
  const titles = requireTitles([title, originalTitle, alternateTitle]);

  const { rawFiles, queriedTitles } = await fetchAndMergeRawFiles(titles, { category, sort, offset, wst });
  const movies = parseWebshareResults(rawFiles, { mode: "movie", titles, year });
  const files = selectDiverseTop(movies, Number(limit) || 10);

  return {
    files,
    queriedPhrases: queriedTitles,
    isLooselyMatched: !year || !files.some((f) => f.yearConfirmed),
    noResults: files.length === 0,
  };
}

export async function searchEpisodeOnWebshare({
  title,
  originalTitle,
  alternateTitle,
  season,
  episode,
  year,
  category = "video",
  sort = "largest",
  limit = 10,
  offset = 0,
  wst,
} = {}) {
  if (season === undefined || season === null || episode === undefined || episode === null) {
    const err = new Error("Chýba číslo série (season) alebo epizódy (episode).");
    err.status = 400;
    throw err;
  }
  const titles = requireTitles([title, originalTitle, alternateTitle]);

  const { rawFiles, queriedTitles } = await fetchAndMergeRawFiles(titles, { category, sort, offset, wst });
  const [series] = parseWebshareResults(rawFiles, { mode: "series", titles, year });

  const seasonNum = Number(season);
  const episodeNum = Number(episode);
  const seasonEntry = series.seasons.find((s) => s.seasonNumber === seasonNum);
  const episodeCandidates = sortFiles((seasonEntry?.episodes || []).filter((ep) => ep.episodeNumber === episodeNum));
  const files = selectDiverseTop(episodeCandidates, Number(limit) || 10);

  return {
    files,
    queriedPhrases: queriedTitles,
    // Bez sekvenčného fallbacku už nie je "voľnejšia" zhoda čo by vrátiť —
    // buď sa v lokálne zoskupenom strome nájde presná sezóna+epizóda, alebo noResults.
    isLooselyMatched: false,
    noResults: files.length === 0,
  };
}
