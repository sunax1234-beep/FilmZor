const BASE_URL = import.meta.env.VITE_WEBSHARE_API_URL || "http://localhost:4000";

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

export function loginWebshare(username, password) {
  return postJson("/api/webshare/login", { username, password, keepLoggedIn: true });
}

export function logoutWebshare() {
  return postJson("/api/webshare/logout");
}

// Film: { title, originalTitle?, year? }
// Epizóda seriálu: { title, originalTitle?, season, episode }
// Backend z toho odvodí a postupne vyskúša viac vyhľadávacích fráz (viď filmzor-server).
export function searchWebshare({ title, originalTitle, year, season, episode } = {}) {
  return postJson("/api/webshare/search", { title, originalTitle, year, season, episode });
}

// Predvolene žiadame streamovací odkaz (nie sťahovanie na disk) — používa sa
// len ako kontrola prihlásenia (401 => treba login), samotné prehrávanie ide
// cez getWebshareStreamUrl (viď nižšie).
export function getWebshareLink(ident, downloadType = "video_stream") {
  return postJson("/api/webshare/get-link", { ident, downloadType });
}

// URL nášho remux/streaming proxy endpointu — priamo ako <video src>.
// Video sa kopíruje bez prekódovania, zvuk (často AC3/DTS pri CZ/SK dabingu,
// ktoré prehliadač nevie prehrať) sa prekóduje na AAC, výstup je fragmentovaný
// MP4. Vyžaduje session cookie, preto <video> potrebuje crossOrigin="use-credentials".
export function getWebshareStreamUrl(ident) {
  return `${BASE_URL}/api/webshare/stream/${encodeURIComponent(ident)}`;
}
