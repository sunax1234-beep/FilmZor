import { useCallback, useEffect, useRef, useState } from "react";
import { discover, searchMulti } from "../services/tmdb";
import { normalizeItem, genreNames } from "../utils/normalize";
import { useDebounce } from "./useDebounce";
import { useTmdbGenres } from "./useTmdbGenres";
import { getAllWatchProgress, getProgressRatio, isInProgress, subscribeToWatchProgress } from "../utils/watchProgress";

const SORT_MAP = {
  movie: {
    "Najnovšie": "primary_release_date.desc",
    "Najlepšie hodnotené": "vote_average.desc",
    "Najobľúbenejšie": "popularity.desc",
    "Abecedne A-Z": "original_title.asc",
  },
  tv: {
    "Najnovšie": "first_air_date.desc",
    "Najlepšie hodnotené": "vote_average.desc",
    "Najobľúbenejšie": "popularity.desc",
    "Abecedne A-Z": "original_name.asc",
  },
};

// Katalógové/vyhľadávacie/filtrovacie state a "pokračovať v pozeraní" —
// zdieľané medzi telefón/desktop (StandardApp) a TV (TvHome) UI, nech sa
// TMDB fetch/paginácia/filtrovanie nepíše dvakrát.
export function useCatalog() {
  const [activeNav, setActiveNav] = useState("FILMY");
  const mediaType = activeNav === "SERIÁLY" ? "tv" : "movie";

  const [language, setLanguage] = useState("sk-SK");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 450);
  const isSearching = debouncedQuery.trim().length > 0;

  const [genreIds, setGenreIds] = useState([]);
  const [year, setYear] = useState("all");
  const [sortLabel, setSortLabel] = useState("Najobľúbenejšie");

  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [continueItems, setContinueItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const searchInputRef = useRef(null);

  const { movieGenres, tvGenres, loading: loadingGenres } = useTmdbGenres(language);
  const activeGenres = mediaType === "tv" ? tvGenres : movieGenres;

  // ID žánrov filmov a seriálov sa v TMDB líšia, preto pri prepnutí resetujeme výber.
  useEffect(() => {
    setGenreIds([]);
  }, [mediaType]);

  // "Všetko" vyprázdni výber, inak sa žáner pridá/odoberie zo zoznamu —
  // viacero vybraných žánrov naraz sa v discover() spojí cez AND (viď tmdb.js),
  // napr. Romantický + Komédia vráti len rom-comy, nie hocijaký z oboch žánrov.
  const toggleGenre = useCallback((id) => {
    if (id === "all") {
      setGenreIds([]);
      return;
    }
    setGenreIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }, []);

  const loadResults = useCallback(
    async (pageToLoad, replace) => {
      setLoading(true);
      setError(null);
      try {
        let data;
        if (isSearching) {
          data = await searchMulti(debouncedQuery.trim(), { language, page: pageToLoad });
        } else {
          const sortBy = SORT_MAP[mediaType][sortLabel];
          data = await discover(mediaType, { genreIds, year, sortBy, language, page: pageToLoad });
        }

        const items = (data.results || [])
          .filter((r) => (isSearching ? r.media_type === "movie" || r.media_type === "tv" : true))
          .map((r) => normalizeItem(r, mediaType));

        setResults((prev) => (replace ? items : [...prev, ...items]));
        setTotalPages(data.total_pages || 1);
        setPage(pageToLoad);
      } catch (e) {
        setError(e.message);
        if (replace) setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [isSearching, debouncedQuery, mediaType, genreIds, year, sortLabel, language]
  );

  useEffect(() => {
    loadResults(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching, debouncedQuery, mediaType, genreIds, year, sortLabel, language]);

  // "Pokračovať v pozeraní" — reálny progres uložený v localStorage (viď useTitlePlayer),
  // nie staršie z filmov/seriálov rozpozeraných menej ako COMPLETE_THRESHOLD (90 %).
  useEffect(() => {
    function refreshContinueWatching() {
      const items = getAllWatchProgress()
        .filter(isInProgress)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((entry) => ({
          id: entry.id,
          mediaType: entry.mediaType,
          title: entry.title,
          originalTitle: entry.originalTitle || entry.title,
          year: entry.year || null,
          posterPath: entry.posterPath,
          genreIds: [],
          overview: "",
          season: entry.season ?? null,
          episode: entry.episode ?? null,
          episodeName: entry.episodeName || null,
          progress: Math.round(getProgressRatio(entry) * 100),
        }));
      setContinueItems(items);
    }

    refreshContinueWatching();
    return subscribeToWatchProgress(refreshContinueWatching);
  }, []);

  const genreLookup = useCallback(
    (item) => {
      const names = genreNames(item.genreIds, item.mediaType === "tv" ? tvGenres : movieGenres);
      return names.slice(0, 1).join(", ") || (item.mediaType === "tv" ? "Seriál" : "Film");
    },
    [movieGenres, tvGenres]
  );

  return {
    activeNav,
    setActiveNav,
    mediaType,
    language,
    setLanguage,
    searchQuery,
    setSearchQuery,
    isSearching,
    genreIds,
    toggleGenre,
    year,
    setYear,
    sortLabel,
    setSortLabel,
    results,
    page,
    totalPages,
    loading,
    error,
    loadResults,
    continueItems,
    selected,
    setSelected,
    searchInputRef,
    activeGenres,
    loadingGenres,
    genreLookup,
  };
}
