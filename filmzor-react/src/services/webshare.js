// Prázdny reťazec je platná (zámerná) hodnota — znamená "rovnaká doména ako
// appka" (viď functions/api/[[path]].js, ktorý to proxuje na Fly backend),
// preto "??", nie "||" (ten by "" nahradil fallbackom).
const BASE_URL = import.meta.env.VITE_WEBSHARE_API_URL ?? "http://localhost:4000";

async function handleResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Chyba servera (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

function postJson(path, body) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }).then(handleResponse);
}

function getJson(path) {
  return fetch(`${BASE_URL}${path}`, { credentials: "include" }).then(handleResponse);
}

export function getWebshareSession() {
  return getJson("/api/webshare/session");
}

export function loginWebshare(username, password, rememberMe = false) {
  return postJson("/api/webshare/login", { username, password, keepLoggedIn: rememberMe });
}

export function logoutWebshare() {
  return postJson("/api/webshare/logout");
}

// Film: { title, originalTitle?, alternateTitle?, year? }
// Epizóda seriálu: { title, originalTitle?, alternateTitle?, season, episode }
// alternateTitle = český TMDB názov (cs-CZ) — Webshare je prevažne česká komunita,
// takže filmy s odlišným oficiálnym CZ marketingovým názvom (napr. "Zootopia" ->
// "Město zvířat") sa bez neho často vôbec nenájdu.
// Backend z toho odvodí a postupne vyskúša viac vyhľadávacích fráz (viď filmzor-server).
export function searchWebshare({ title, originalTitle, alternateTitle, year, season, episode } = {}) {
  return postJson("/api/webshare/search", { title, originalTitle, alternateTitle, year, season, episode });
}

// Predvolene žiadame streamovací odkaz (nie sťahovanie na disk) — používa sa
// len ako kontrola prihlásenia (401 => treba login). Zachované pre prípadné
// iné použitie, ale prehrávanie samotné dnes namiesto tohto volá
// getWebshareStreamMeta (auth-check + trvanie v jednom).
export function getWebshareLink(ident, downloadType = "video_stream") {
  return postJson("/api/webshare/get-link", { ident, downloadType });
}

// Trvanie súboru (pre vlastnú seek lištu — natívne <video> trvanie u živého
// remuxu nepozná) + zároveň kontrola prihlásenia pred spustením prehrávania.
export function getWebshareStreamMeta(ident) {
  return getJson(`/api/webshare/stream-meta/${encodeURIComponent(ident)}`);
}

// URL nášho remux/streaming proxy endpointu — priamo ako <video src>.
// Video sa kopíruje bez prekódovania, zvuk (často AC3/DTS pri CZ/SK dabingu,
// ktoré prehliadač nevie prehrať) sa prekóduje na AAC, výstup je fragmentovaný
// MP4. Vyžaduje session cookie — ide cez /api/* Worker proxy na rovnakej
// doméne (viď worker/index.js), takže je to same-origin request.
// startSeconds > 0 => pretočenie na danú pozíciu (nový <video src>, ffmpeg sa
// reštartuje s -ss na danom mieste — viď mediaProxy.js, prečo nejde o
// štandardné HTTP Range seekovanie).
export function getWebshareStreamUrl(ident, startSeconds = 0) {
  const base = `${BASE_URL}/api/webshare/stream/${encodeURIComponent(ident)}`;
  const t = Math.max(0, Number(startSeconds) || 0);
  return t > 0 ? `${base}?t=${t.toFixed(2)}` : base;
}
