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
function stripNoiseWords(normalizedText) {
  return normalizedText
    .split(" ")
    .filter((tok) => tok && !NOISE_WORDS.has(tok) && !/^(19|20)\d{2}$/.test(tok))
    .join(" ");
}

// Fuzzy Search: substring matching namiesto exaktnej zhody — súbor musí
// obsahovať VŠETKY kľúčové slová zo zadania (v ľubovoľnom poradí, s
// čímkoľvek medzi nimi), nič viac sa nevyžaduje.
export function matchesAllKeywords(normalizedFileName, keywords) {
  return keywords.length > 0 && keywords.every((kw) => normalizedFileName.includes(kw));
}

// Skúsi zhodu voči KTORÉMUKOĽVEK zo zdrojov názvu (SK/CZ lokalizovaný,
// originálny, český alternatívny) — stačí, že súbor sedí na jeden z nich.
function matchesAnyTitleSource(file, keywordSets) {
  const cleanName = stripNoiseWords(normalizeSearchText(file.name));
  return keywordSets.some((keywords) => matchesAllKeywords(cleanName, keywords));
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
  /\bseason\s*(\d{1,3})\D{0,15}?episode\s*(\d{1,3})\b/i, // Season 1 Episode 5
  /\bseria\s*(\d{1,3})\D{0,15}?epizoda\s*(\d{1,3})\b/i, // Séria 1 Epizóda 5
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
// 4. Filtrovanie, rok, dedup, zoradenie
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(["mkv", "avi", "mp4", "mov", "wmv", "m4v", "ts", "webm", "flv", "mpg", "mpeg"]);
const BLOCKED_WORDS_RE = /\b(trailer|sample|soundtrack|ost)\b/i;

function isBlocked(file) {
  if (BLOCKED_WORDS_RE.test(file.name)) return true;
  if (!VIDEO_EXTENSIONS.has((file.type || "").toLowerCase())) return true;
  return false;
}

function extractYearsFromName(name) {
  const matches = name.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  return matches.map(Number);
}

// Ak súbor uvádza INÝ explicitný rok než hľadaný, zahoď ho. Súbory bez
// akéhokoľvek roku v názve netrestáme (nevieme posúdiť).
function passesYearCheck(file, year) {
  if (!year) return true;
  const yearsInName = extractYearsFromName(file.name);
  if (yearsInName.length === 0) return true;
  return yearsInName.includes(Number(year));
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
 * Hlavná funkcia: príjme surové Webshare file objekty (z `/search/`
 * odpovede) a vráti vyfiltrované, namapované dáta.
 *
 * @param {any[]} rawFiles - surové objekty z Webshare `/search/` (ident, name, size, type, ...)
 * @param {{mode?: "movie"|"series", title?: string, originalTitle?: string, alternateTitle?: string, year?: number|string|null}} opts
 * @returns {Movie[]|Series[]}
 */
export function parseWebshareResults(rawFiles, { mode = "movie", title, originalTitle, alternateTitle, year } = {}) {
  const nameSources = [title, originalTitle, alternateTitle].filter(Boolean);
  const keywordSets = nameSources.map(extractKeywords);
  const primaryTitle = nameSources[0] || "";

  const matched = toArray(rawFiles)
    .map(normalizeFile)
    .filter((file) => !isBlocked(file))
    .filter((file) => matchesAnyTitleSource(file, keywordSets))
    .filter((file) => passesYearCheck(file, year));

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

// Vyšší limit než predtým (bývalých 50 na jednu z až 6 paralelných fráz) —
// kompenzuje, že teraz ide len JEDNA holá fráza na dopyt namiesto viacerých
// cielenejších variantov (viď fetchRawFiles nižšie).
const WEBSHARE_FETCH_LIMIT = 100;

// Pošle na Webshare `/search/` IBA holý názov (žiadny rok, SxxExx kód ani
// kvalita v dopyte) — všetko filtrovanie/priraďovanie k sériám/zahadzovanie
// nesprávnych výsledkov beží lokálne v parseWebshareResults nad výsledným poľom.
async function fetchRawFiles(queryTitle, { category, sort, offset, wst }) {
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

// Skúsi zdroje názvu (lokalizovaný, originálny, český alternatívny) jeden po
// druhom, vždy jednu holú frázu naraz — na ďalší siahne len vtedy, keď
// predchádzajúci nič nevrátil (rieši prípad, keď je Webshare komunita
// prevažne česká a lokalizovaný SK/EN názov nič nenájde).
async function fetchRawFilesWithFallback(nameSources, queryOpts) {
  for (const candidate of nameSources) {
    const raw = await fetchRawFiles(candidate, queryOpts);
    if (raw.length > 0) return { rawFiles: raw, queriedTitle: candidate };
  }
  return { rawFiles: [], queriedTitle: nameSources[0] || null };
}

function requireNameSources({ title, originalTitle, alternateTitle }) {
  const nameSources = [title, originalTitle, alternateTitle].filter(Boolean);
  if (nameSources.length === 0) {
    const err = new Error("Chýba názov na vyhľadávanie (title alebo originalTitle).");
    err.status = 400;
    throw err;
  }
  return nameSources;
}

export async function searchMovieOnWebshare({
  title,
  originalTitle,
  alternateTitle,
  year,
  category = "video",
  sort = "largest",
  limit = 20,
  offset = 0,
  wst,
} = {}) {
  const nameSources = requireNameSources({ title, originalTitle, alternateTitle });

  const { rawFiles, queriedTitle } = await fetchRawFilesWithFallback(nameSources, { category, sort, offset, wst });
  const movies = parseWebshareResults(rawFiles, { mode: "movie", title, originalTitle, alternateTitle, year });
  const files = movies.slice(0, Number(limit) || 20);

  const hasConfirmedYear = Boolean(year) && files.some((f) => extractYearsFromName(f.name).includes(Number(year)));

  return {
    files,
    queriedPhrases: [queriedTitle],
    isLooselyMatched: !year || !hasConfirmedYear,
    noResults: files.length === 0,
  };
}

export async function searchEpisodeOnWebshare({
  title,
  originalTitle,
  alternateTitle,
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
  const nameSources = requireNameSources({ title, originalTitle, alternateTitle });

  const { rawFiles, queriedTitle } = await fetchRawFilesWithFallback(nameSources, { category, sort, offset, wst });
  const [series] = parseWebshareResults(rawFiles, { mode: "series", title, originalTitle, alternateTitle });

  const seasonNum = Number(season);
  const episodeNum = Number(episode);
  const seasonEntry = series.seasons.find((s) => s.seasonNumber === seasonNum);
  const files = (seasonEntry?.episodes || [])
    .filter((ep) => ep.episodeNumber === episodeNum)
    .slice(0, Number(limit) || 20);

  return {
    files,
    queriedPhrases: [queriedTitle],
    // Bez multi-frázového query aggregatora už nie je "voľnejšia" zhoda čo
    // by vrátiť — buď sa v lokálne zoskupenom strome nájde presná
    // sezóna+epizóda, alebo noResults.
    isLooselyMatched: false,
    noResults: files.length === 0,
  };
}
