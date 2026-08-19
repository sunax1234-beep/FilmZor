import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { discover, searchMulti } from "../services/tmdb";
import { normalizeItem } from "../utils/normalize";
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

  // Chráni pred zastaranými odpoveďami — bez tohto by rýchle prepnutie
  // filtra/žánru počas prebiehajúceho fetchu mohlo neskôr doručenou
  // (staršou) odpoveďou prepísať už zobrazené výsledky pre NOVÝ filter.
  const loadRequestRef = useRef(0);

  const loadResults = useCallback(
    async (pageToLoad, replace) => {
      const requestId = ++loadRequestRef.current;
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
        if (loadRequestRef.current !== requestId) return;

        const items = (data.results || [])
          .filter((r) => (isSearching ? r.media_type === "movie" || r.media_type === "tv" : true))
          .map((r) => normalizeItem(r, mediaType));

        setResults((prev) => (replace ? items : [...prev, ...items]));
        setTotalPages(data.total_pages || 1);
        setPage(pageToLoad);
      } catch (e) {
        if (loadRequestRef.current !== requestId) return;
        setError(e.message);
        if (replace) setResults([]);
      } finally {
        if (loadRequestRef.current === requestId) setLoading(false);
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

  // Mapy sa stavajú raz na zmenu zoznamu žánrov, nie pri každom volaní
  // genreLookup — predtým sa nová Map staval nanovo pre KAŽDÚ kartu filmu
  // pri KAŽDOM renderi mriežky (rádovo stovky zbytočných alokácií po
  // niekoľkých "Načítať viac").
  const movieGenreMap = useMemo(() => new Map(movieGenres.map((g) => [g.id, g.name])), [movieGenres]);
  const tvGenreMap = useMemo(() => new Map(tvGenres.map((g) => [g.id, g.name])), [tvGenres]);

  const genreLookup = useCallback(
    (item) => {
      const map = item.mediaType === "tv" ? tvGenreMap : movieGenreMap;
      const name = (item.genreIds || []).map((id) => map.get(id)).find(Boolean);
      return name || (item.mediaType === "tv" ? "Seriál" : "Film");
    },
    [movieGenreMap, tvGenreMap]
  );

  // Bez tohto by tento hook vrátil NOVÝ objekt pri každom renderi App —
  // napr. aj pri zmene `searchQuery` na každý úder klávesy (debounce odloží
  // len fetch, nie tento re-render) — čo by prekreslilo celý strom vrátane
  // každej karty filmu v mriežke, hoci sa výsledky ešte vôbec nezmenili.
  return useMemo(
    () => ({
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
    }),
    [
      activeNav,
      mediaType,
      language,
      searchQuery,
      isSearching,
      genreIds,
      toggleGenre,
      year,
      sortLabel,
      results,
      page,
      totalPages,
      loading,
      error,
      loadResults,
      continueItems,
      selected,
      activeGenres,
      loadingGenres,
      genreLookup,
    ]
  );
}
