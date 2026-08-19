const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export const hasApiKey = Boolean(API_KEY);

export function posterUrl(path, size = "w500") {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function backdropUrl(path, size = "w1280") {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

async function tmdbFetch(path, params = {}) {
  if (!API_KEY) {
    throw new Error("Chýba VITE_TMDB_API_KEY — skopíruj .env.example do .env a doplň API kľúč.");
  }
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.status_message || `TMDB chyba ${res.status}`);
  }
  return res.json();
}

export function getGenres(mediaType, language = "sk-SK") {
  return tmdbFetch(`/genre/${mediaType}/list`, { language }).then((d) => d.genres || []);
}

export function discover(mediaType, { genreIds, year, sortBy, language = "sk-SK", page = 1 } = {}) {
  const params = {
    language,
    page,
    sort_by: sortBy || "popularity.desc",
    include_adult: false,
  };
  // Čiarka v `with_genres` je pre TMDB AND (film musí mať všetky žánre naraz),
  // "|" by bolo OR — AND je zámerné, nech "Romantický" + "Komédia" vráti rom-comy.
  if (genreIds && genreIds.length > 0) params.with_genres = genreIds.join(",");
  if (year && year !== "all") {
    params[mediaType === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
  }
  if ((sortBy || "").startsWith("vote_average")) params["vote_count.gte"] = 200;

  return tmdbFetch(`/discover/${mediaType}`, params);
}

export function searchMulti(query, { language = "sk-SK", page = 1 } = {}) {
  return tmdbFetch("/search/multi", { query, language, page, include_adult: false });
}

export function getPopular(mediaType, { language = "sk-SK", page = 1 } = {}) {
  return tmdbFetch(`/${mediaType}/popular`, { language, page });
}

export function getDetails(mediaType, id, language = "sk-SK") {
  return tmdbFetch(`/${mediaType}/${id}`, { language });
}

// Zoznam epizód konkrétnej série seriálu (TMDB tv detail vracia number_of_seasons,
// jednotlivé sezóny sa dotiahnu až na požiadanie, keď ich používateľ otvorí).
export function getSeasonDetails(tvId, seasonNumber, language = "sk-SK") {
  return tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`, { language });
}
