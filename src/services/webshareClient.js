import { XMLParser } from "fast-xml-parser";

const BASE_URL = "https://webshare.cz/api";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
});

export class WebshareApiError extends Error {
  constructor(message, code = "UNKNOWN_ERROR", status = 502) {
    super(message);
    this.name = "WebshareApiError";
    this.code = code;
    this.status = status;
  }
}

// Volanie ľubovoľnej Webshare XML funkcie: POST https://webshare.cz/api/<endpoint>/
export async function callWebshare(endpoint, params = {}) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  });

  let res;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "text/xml; charset=UTF-8",
      },
      body,
    });
  } catch (networkError) {
    throw new WebshareApiError(
      `Nepodarilo sa spojiť s Webshare API: ${networkError.message}`,
      "NETWORK_ERROR",
      503
    );
  }

  if (!res.ok) {
    throw new WebshareApiError(`Webshare API vrátilo HTTP ${res.status}`, "HTTP_ERROR", 502);
  }

  const xmlText = await res.text();

  let parsed;
  try {
    parsed = parser.parse(xmlText);
  } catch {
    throw new WebshareApiError("Odpoveď z Webshare API sa nepodarilo spracovať (neplatné XML).", "PARSE_ERROR");
  }

  const response = parsed?.response;
  if (!response) {
    throw new WebshareApiError("Odpoveď z Webshare API má neočakávaný formát.", "INVALID_RESPONSE");
  }

  if (response.status === "FATAL" || response.status === "ERROR") {
    throw new WebshareApiError(
      response.message || "Webshare API vrátilo chybu.",
      response.code || "WEBSHARE_ERROR",
      response.status === "FATAL" ? 502 : 400
    );
  }

  return response;
}

// fast-xml-parser vráti pole len ak je viac než 1 opakovaný tag — zjednotíme na pole vždy.
export function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
