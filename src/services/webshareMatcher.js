import { callWebshare, toArray } from "./webshareClient.js";

// Koľko top-priority fráz sa naraz posiela na Webshare (Promise.all) a zlučuje.
const TOP_N = 4;
// Koľko surových výsledkov sa natiahne z Webshare za KAŽDÚ frázu (pred filtrovaním).
const WEBSHARE_FETCH_LIMIT = 50;

// ---------------------------------------------------------------------------
// 1. Sanitizácia a generovanie alternatívnych názvov
// ---------------------------------------------------------------------------

// Odstráni diakritiku (NFD normalizácia + zmazanie combining marks) a väčšinu
// interpunkcie nahradí medzerou — ":", "!", "?", "." atď. Pomlčka sa tiež mení
// na medzeru tu ("Spider-Man" -> "Spider Man").
export function sanitizeSearchText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rovnaké ako vyššie, ale pomlčka sa úplne ODSTRÁNI (bez medzery) —
// "Spider-Man" -> "SpiderMan". Uploaderi na Webshare oba tvary miešajú.
function sanitizeJoined(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDigit(text) {
  return /\d/.test(text || "");
}

// Bežné krátke spojky/členy, ktoré samy osebe NIE SÚ dostatočným dôkazom zhody
// názvu — "the" sa inak ako substring náhodne trafí do "TheMummy", "Wuthering"
// atď. a spôsobí falošné zhody.
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for", "by", "is", "with", "from",
  "aj", "na", "do", "za", "po", "od", "je", "sa", "si", "to", "pri", "pre", "so", "zo", "vo", "ku", "ako", "ale",
]);

// Významové slová názvu (na porovnávanie so súbormi) — bez stopwords, min. 3 znaky.
// Pre veľmi krátke jednoslovné názvy (napr. "It", "Up") sa použije celý názov.
function extractSignificantWords(text) {
  const words = sanitizeSearchText(text)
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length > 0) return words;

  const whole = sanitizeSearchText(text).toLowerCase().replace(/\s+/g, "");
  return whole ? [whole] : [];
}

// Celý názov súboru zlepený do jedného reťazca bez medzier/diakritiky/interpunkcie —
// vďaka tomu "spider man" AJ "spiderman" nájdu ten istý "spiderman2002...".
function compactAll(text) {
  return sanitizeSearchText(text).toLowerCase().replace(/\s+/g, "");
}

function addCandidate(list, seen, phrase, meta) {
  if (!phrase) return;
  const key = phrase.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ phrase, ...meta });
}

// Film — generuje prioritne zoradené kandidátske frázy:
//  [názov+rok] -> [originál+rok] -> [spojený originál+rok] -> [spojený názov+rok]
//  -> [názov+"1"+rok] -> [originál+"1"+rok] -> ... -> varianty bez roku.
// "+1" varianty rieši prípad, keď uploaderi prvý diel série označia napr. "Spiderman 1".
export function buildMovieQueryCandidates({ title, originalTitle, year }) {
  const titleSpaced = sanitizeSearchText(title);
  const titleJoined = sanitizeJoined(title);
  const origSpaced = sanitizeSearchText(originalTitle);
  const origJoined = sanitizeJoined(originalTitle);

  const allowFirstInstallment = !hasDigit(titleSpaced) && !hasDigit(origSpaced);

  const candidates = [];
  const seen = new Set();

  if (titleSpaced && year) addCandidate(candidates, seen, `${titleSpaced} ${year}`, { hasYear: true });
  if (origSpaced && year) addCandidate(candidates, seen, `${origSpaced} ${year}`, { hasYear: true });
  if (origJoined && year) addCandidate(candidates, seen, `${origJoined} ${year}`, { hasYear: true });
  if (titleJoined && year) addCandidate(candidates, seen, `${titleJoined} ${year}`, { hasYear: true });

  if (allowFirstInstallment && year) {
    if (titleSpaced) addCandidate(candidates, seen, `${titleSpaced} 1 ${year}`, { hasYear: true });
    if (origSpaced) addCandidate(candidates, seen, `${origSpaced} 1 ${year}`, { hasYear: true });
    if (origJoined) addCandidate(candidates, seen, `${origJoined} 1 ${year}`, { hasYear: true });
    if (titleJoined) addCandidate(candidates, seen, `${titleJoined} 1 ${year}`, { hasYear: true });
  }

  if (allowFirstInstallment) {
    if (titleSpaced) addCandidate(candidates, seen, `${titleSpaced} 1`, { hasYear: false });
    if (origSpaced) addCandidate(candidates, seen, `${origSpaced} 1`, { hasYear: false });
  }

  if (titleSpaced) addCandidate(candidates, seen, titleSpaced, { hasYear: false });
  if (origSpaced) addCandidate(candidates, seen, origSpaced, { hasYear: false });

  return { candidates };
}

// Epizóda seriálu — analogicky, prioritne s presným kódom SxxExx, na konci
// fallback na celú sériu (Sxx), keby sa konkrétna epizóda nenašla.
export function buildEpisodeQueryCandidates({ title, originalTitle, season, episode }) {
  const titleSpaced = sanitizeSearchText(title);
  const origSpaced = sanitizeSearchText(originalTitle);

  const seasonNum = Number(season);
  const episodeNum = Number(episode);
  const s2 = String(seasonNum).padStart(2, "0");
  const e2 = String(episodeNum).padStart(2, "0");

  const codeCompact = `S${s2}E${e2}`;
  const codeSpaced = `S${s2} E${e2}`;
  const codeX = `${seasonNum}x${e2}`;
  const seasonOnly = `S${s2}`;

  const candidates = [];
  const seen = new Set();

  if (titleSpaced) addCandidate(candidates, seen, `${titleSpaced} ${codeCompact}`, { hasCode: true });
  if (origSpaced) addCandidate(candidates, seen, `${origSpaced} ${codeCompact}`, { hasCode: true });
  if (titleSpaced) addCandidate(candidates, seen, `${titleSpaced} ${codeX}`, { hasCode: true });
  if (titleSpaced) addCandidate(candidates, seen, `${titleSpaced} ${codeSpaced}`, { hasCode: true });
  if (origSpaced) addCandidate(candidates, seen, `${origSpaced} ${codeX}`, { hasCode: true });

  const seasonBase = titleSpaced || origSpaced;
  if (seasonBase) addCandidate(candidates, seen, `${seasonBase} ${seasonOnly}`, { hasCode: false });

  return { candidates, codeCompact, seasonOnly };
}

// ---------------------------------------------------------------------------
// 2. Analýza názvu súboru — jazyk, titulky, kvalita, CAM/TELESYNC
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
    isPasswordProtected: f.password === "1",
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
// 3. Prísna validácia názvu (hard filter) + de-duplikácia
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(["mkv", "avi", "mp4", "mov", "wmv", "m4v", "ts", "webm", "flv", "mpg", "mpeg"]);
const BLOCKED_WORDS_RE = /\b(trailer|sample|soundtrack|ost)\b/i;

function isBlocked(file) {
  if (BLOCKED_WORDS_RE.test(file.name)) return true;
  if (!VIDEO_EXTENSIONS.has((file.type || "").toLowerCase())) return true;
  return false;
}

// Súbor musí obsahovať VŠETKY významové slová aspoň JEDNÉHO z názvov (SK/CZ
// alebo originál) — nestačí len jedno spoločné slovo ako "the"/"man". Presne
// toto predtým prepúšťalo napr. "The Mummy" pri hľadaní "The Odyssey" (obe
// obsahujú "the") alebo "Iron Man" pri hľadaní "Spider Man" (obe "man").
function matchesAllWords(compactName, words) {
  return words.length > 0 && words.every((w) => compactName.includes(w));
}

function fileMatchesTitle(file, { titleWords, originalWords }) {
  const compactName = compactAll(file.name);
  return matchesAllWords(compactName, titleWords) || matchesAllWords(compactName, originalWords);
}

// Pri epizódach navyše vyžadujeme, aby súbor obsahoval buď presný kód SxxExx,
// alebo aspoň kód celej série Sxx — inak nemá zmysel (nie je označený pre
// hľadanú sériu vôbec).
//
// Pozor: "S01" je vždy substring "S01E09", takže samotné hľadanie "obsahuje
// Sxx" by pri fallbacku bez presného kódu prepustilo AJ úplne iné epizódy tej
// istej série (napr. E09 pri hľadaní E01). Fallback na celú sériu je preto
// platný len vtedy, keď súbor neobsahuje kód ŽIADNEJ inej konkrétnej epizódy.
function fileMatchesEpisode(file, { titleWords, originalWords, codeCompact, seasonOnly, seasonNum }) {
  if (!fileMatchesTitle(file, { titleWords, originalWords })) return false;

  const compactName = compactAll(file.name);
  const compactCode = compactAll(codeCompact);
  if (compactCode && compactName.includes(compactCode)) return true;

  const otherEpisodeRe = new RegExp(`s0*${seasonNum}e\\d+`, "i");
  if (otherEpisodeRe.test(compactName)) return false;

  const compactSeason = compactAll(seasonOnly);
  return Boolean(compactSeason && compactName.includes(compactSeason));
}

// ---------------------------------------------------------------------------
// 3b. Anti-False-Positive Engine — rok + zvyšné (balastom neočistené) slová
// ---------------------------------------------------------------------------
//
// Rieši prípad, keď súbor OBSAHUJE hľadané slovo, ale ide o úplne iný titul
// (napr. "2001: A Space Odyssey" (1968) alebo "Druhá vesmírna odysea" (1984)
// pri hľadaní "Odysea" (2026)) — samotná prítomnosť kľúčového slova nestačí.

// Bežné zápisy zvukových kanálov (5.1, 7.1, 2.1 — aj s pomlčkou namiesto bodky),
// aby sa pri tokenizácii nesprávne nepovažovali za "navyše" slová.
const AUDIO_CHANNEL_RE = /\b[0-9]\s?[.\-]\s?[0-9]\b/g;

function extractYearsFromName(name) {
  const matches = name.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  return matches.map(Number);
}

// 1. Validácia roku: ak súbor uvádza INÝ explicitný rok než hľadaný, zahoď ho.
// Súbory bez akéhokoľvek roku v názve netrestáme (nevieme posúdiť).
function passesYearCheck(file, year) {
  if (!year) return true;
  const yearsInName = extractYearsFromName(file.name);
  if (yearsInName.length === 0) return true;
  return yearsInName.includes(Number(year));
}

// Technické/kvalitatívne/jazykové "balastné" slová, ktoré NIE SÚ súčasťou
// názvu filmu — pri porovnávaní "navyše slov" sa ignorujú (sú to vlastnosti
// súboru, nie časť titulu).
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

// Rovnaká tokenizácia (diakritika/interpunkcia preč, lowercase), ale BEZ
// odstránenia stopslov ("a"/"the" sa tu počítajú ako plnohodnotné slová —
// práve to odlíši "A Writer's Odyssey" od "The Odyssey").
function tokenizeRaw(text) {
  return sanitizeSearchText(text).toLowerCase().split(" ").filter(Boolean);
}

// Slová súboru očistené o technický balast, rok a zvukové kanály.
function tokenizeFileResidual(name) {
  const withoutAudioChannels = name.replace(AUDIO_CHANNEL_RE, " ");
  return tokenizeRaw(withoutAudioChannels).filter((tok) => !NOISE_WORDS.has(tok) && !/^(19|20)\d{2}$/.test(tok));
}

function getExtraWords(fileTokens, titleTokens) {
  const titleSet = new Set(titleTokens);
  return fileTokens.filter((tok) => !titleSet.has(tok));
}

// Osamotená číslica INÁ než "1" medzi "navyše" slovami takmer vždy znamená iný
// diel série (napr. "Spider-Man 3") a nesmie prejsť ani v rámci tolerancie —
// "1" je výnimka, lebo tak uploaderi bežne označujú práve PRVÝ diel.
function hasDisqualifyingSequelNumber(extraWords, titleTokens) {
  const titleSet = new Set(titleTokens);
  return extraWords.some((tok) => /^[2-9]\d?$/.test(tok) && !titleSet.has(tok));
}

const MAX_EXTRA_WORDS = 1;

// 3. Matematická podobnosť: po očistení od balastu nesmie mať súbor viac než
// MAX_EXTRA_WORDS slov navyše oproti SK/CZ alebo originálnemu názvu z TMDB
// (a medzi nimi nesmie byť číslica iného dielu série).
// "The Odyssey 2026 CZ" -> navyše len rok+jazyk (očistené) -> 0 navyše -> OK.
// "A Writer's Odyssey"  -> navyše "a" aj "writers" -> 2 navyše -> zamietnuté.
// "Spider-Man 3"        -> navyše "3" (iný diel) -> zamietnuté aj pri count=1.
function passesResidualCheck(file, { titleTokens, originalTokens }) {
  const fileTokens = tokenizeFileResidual(file.name);

  return [titleTokens, originalTokens].some((refTokens) => {
    if (refTokens.length === 0) return false;
    const extra = getExtraWords(fileTokens, refTokens);
    return extra.length <= MAX_EXTRA_WORDS && !hasDisqualifyingSequelNumber(extra, refTokens);
  });
}

// Kód série/epizódy (S01E02, 1x02, S01...) je "vlastnosť" súboru, nie súčasť
// názvu — pri počítaní "navyše slov" pre epizódy ho preto vopred odstránime.
const EPISODE_CODE_RE = /\bs\d{1,3}e\d{1,3}\b|\b\d{1,2}x\d{1,3}\b|\bs\d{1,3}\b/gi;

function withoutEpisodeCode(file) {
  return { ...file, name: file.name.replace(EPISODE_CODE_RE, " ") };
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

// 1. Plná kvalita (BluRay/WEB-DL/HD) podľa veľkosti zostupne, CZ/SK zvuk
//    uprednostnený pri porovnateľnej veľkosti.
// 2. CAM/TELESYNC súbory úplne na koniec zoznamu (aj tak zoradené podľa veľkosti).
function sortFiles(files) {
  return [...files].sort((a, b) => {
    if (a.isCam !== b.isCam) return a.isCam ? 1 : -1;
    const aPreferred = a.languages.includes("CZ") || a.languages.includes("SK");
    const bPreferred = b.languages.includes("CZ") || b.languages.includes("SK");
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    return b.sizeBytes - a.sizeBytes;
  });
}

// ---------------------------------------------------------------------------
// 4. Multi-Query Aggregator — top-N fráz paralelne, zlúčenie + deduplikácia
// ---------------------------------------------------------------------------

async function runQuery(phrase, { category, sort, offset, wst }) {
  const params = { what: phrase, category, sort, limit: WEBSHARE_FETCH_LIMIT, offset };
  if (wst) params.wst = wst;
  const response = await callWebshare("/search/", params);
  return toArray(response.file).map(normalizeFile);
}

async function aggregateQueries(candidates, queryOpts) {
  const top = candidates.slice(0, TOP_N);
  const resultsPerPhrase = await Promise.all(top.map((c) => runQuery(c.phrase, queryOpts)));

  const merged = new Map();
  resultsPerPhrase.forEach((files) => {
    for (const file of files) {
      if (!merged.has(file.ident)) merged.set(file.ident, file);
    }
  });

  return {
    files: Array.from(merged.values()),
    queriedPhrases: top.map((c) => c.phrase),
    yearPhraseHasResults: top.some((c, i) => c.hasYear && resultsPerPhrase[i].length > 0),
    codePhraseHasResults: top.some((c, i) => c.hasCode && resultsPerPhrase[i].length > 0),
  };
}

export async function searchMovieOnWebshare({
  title,
  originalTitle,
  year,
  category = "video",
  sort = "largest",
  limit = 20,
  offset = 0,
  wst,
} = {}) {
  const { candidates } = buildMovieQueryCandidates({ title, originalTitle, year });
  if (candidates.length === 0) {
    const err = new Error("Chýba názov na vyhľadávanie (title alebo originalTitle).");
    err.status = 400;
    throw err;
  }

  const { files: rawFiles, queriedPhrases, yearPhraseHasResults } = await aggregateQueries(candidates, {
    category,
    sort,
    offset,
    wst,
  });

  const titleWords = extractSignificantWords(title);
  const originalWords = extractSignificantWords(originalTitle);
  const titleTokens = tokenizeRaw(title);
  const originalTokens = tokenizeRaw(originalTitle);

  const validated = rawFiles.filter(
    (file) =>
      !isBlocked(file) &&
      fileMatchesTitle(file, { titleWords, originalWords }) &&
      passesYearCheck(file, year) &&
      passesResidualCheck(file, { titleTokens, originalTokens })
  );
  const deduped = dedupeByNameAndSize(validated);
  const files = sortFiles(deduped).slice(0, Number(limit) || 20);

  return {
    files,
    queriedPhrases,
    isLooselyMatched: !year || !yearPhraseHasResults,
    noResults: files.length === 0,
  };
}

export async function searchEpisodeOnWebshare({
  title,
  originalTitle,
  season,
  episode,
  category = "video",
  sort = "largest",
  limit = 20,
  offset = 0,
  wst,
} = {}) {
  if (season === undefined || season === null || episode === undefined || episode === null) {
    const err = new Error("Chýba číslo série (season) alebo epizódy (episode).");
    err.status = 400;
    throw err;
  }

  const { candidates, codeCompact, seasonOnly } = buildEpisodeQueryCandidates({
    title,
    originalTitle,
    season,
    episode,
  });
  if (candidates.length === 0) {
    const err = new Error("Chýba názov na vyhľadávanie (title alebo originalTitle).");
    err.status = 400;
    throw err;
  }

  const { files: rawFiles, queriedPhrases, codePhraseHasResults } = await aggregateQueries(candidates, {
    category,
    sort,
    offset,
    wst,
  });

  const titleWords = extractSignificantWords(title);
  const originalWords = extractSignificantWords(originalTitle);
  const titleTokens = tokenizeRaw(title);
  const originalTokens = tokenizeRaw(originalTitle);

  const validated = rawFiles.filter(
    (file) =>
      !isBlocked(file) &&
      fileMatchesEpisode(file, { titleWords, originalWords, codeCompact, seasonOnly, seasonNum: Number(season) }) &&
      passesResidualCheck(withoutEpisodeCode(file), { titleTokens, originalTokens })
  );
  const deduped = dedupeByNameAndSize(validated);
  const files = sortFiles(deduped).slice(0, Number(limit) || 20);

  return {
    files,
    queriedPhrases,
    isLooselyMatched: !codePhraseHasResults,
    noResults: files.length === 0,
  };
}
