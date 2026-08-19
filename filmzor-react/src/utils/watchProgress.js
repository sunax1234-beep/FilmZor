const STORAGE_KEY = "filmzor:watch-progress";
const UPDATED_EVENT = "filmzor:watch-progress-updated";

// Titul sa považuje za "dopozeraný" (a teda mizne z Pokračovať v pozeraní) od tejto hranice.
export const COMPLETE_THRESHOLD = 0.9;

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // localStorage môže byť plný alebo nedostupný (napr. súkromné okno) — progres jednoducho nezapíšeme.
  }
}

// Pri seriáloch je kľúč per-epizóda (season/episode), aby si rozpozeranie
// jednej epizódy neprepisovalo rozpozeranie inej v tom istom seriáli.
function keyFor(mediaType, id, season, episode) {
  if (mediaType === "tv" && season != null && episode != null) {
    return `tv-${id}-s${season}e${episode}`;
  }
  return `${mediaType}-${id}`;
}

export function getProgressRatio(entry) {
  if (!entry?.duration) return 0;
  return entry.currentTime / entry.duration;
}

export function isInProgress(entry) {
  const ratio = getProgressRatio(entry);
  return ratio > 0 && ratio < COMPLETE_THRESHOLD;
}

export function getWatchProgress(mediaType, id, season, episode) {
  const store = readStore();
  return store[keyFor(mediaType, id, season, episode)] || null;
}

export function getAllWatchProgress() {
  return Object.values(readStore());
}

// Všetky uložené rozpozerania epizód daného seriálu (naprieč sériami).
export function getEpisodeProgressForShow(id) {
  return Object.values(readStore()).filter((entry) => entry.mediaType === "tv" && entry.id === id);
}

// entry: { id, mediaType, title, originalTitle?, year?, posterPath, season?, episode?,
//          episodeName?, currentTime, duration, webshareIdent?, webshareName? }
export function saveWatchProgress(entry) {
  if (!entry?.id || !entry?.mediaType || !entry.duration) return;
  const store = readStore();
  const key = keyFor(entry.mediaType, entry.id, entry.season, entry.episode);
  store[key] = {
    ...store[key],
    ...entry,
    updatedAt: Date.now(),
  };
  writeStore(store);
}

export function removeWatchProgress(mediaType, id, season, episode) {
  const store = readStore();
  delete store[keyFor(mediaType, id, season, episode)];
  writeStore(store);
}

export function subscribeToWatchProgress(callback) {
  // UPDATED_EVENT je custom event na `window` — funguje len v tej istej
  // karte, ktorá zápis urobila. Natívny "storage" event oproti tomu fireuje
  // len v OSTATNÝCH kartách rovnakého originu — spolu pokrývajú oba smery,
  // takže "Pokračovať v pozeraní" sa aktualizuje naživo aj naprieč kartami
  // (napr. appka otvorená na TV aj na telefóne súčasne).
  function onStorage(e) {
    if (e.key === null || e.key === STORAGE_KEY) callback();
  }
  window.addEventListener(UPDATED_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(UPDATED_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
