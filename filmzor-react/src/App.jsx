import { useCallback, useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import FilterPanel from "./components/FilterPanel";
import MovieGrid from "./components/MovieGrid";
import MovieRow from "./components/MovieRow";
import MovieModal from "./components/MovieModal";
import { discover, searchMulti, hasApiKey } from "./services/tmdb";
import { normalizeItem, genreNames } from "./utils/normalize";
import { useDebounce } from "./hooks/useDebounce";
import { useTmdbGenres } from "./hooks/useTmdbGenres";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import { useIsTvDevice } from "./hooks/useIsTvDevice";
import { WebshareAuthProvider } from "./context/WebshareAuthContext";
import { getAllWatchProgress, getProgressRatio, isInProgress, subscribeToWatchProgress } from "./utils/watchProgress";

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

function App() {
  const [activeNav, setActiveNav] = useState("FILMY");
  const mediaType = activeNav === "SERIÁLY" ? "tv" : "movie";

  const [language, setLanguage] = useState("sk-SK");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 450);
  const isSearching = debouncedQuery.trim().length > 0;

  const [genreId, setGenreId] = useState("all");
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

  useSpatialNavigation();
  useIsTvDevice();

  const { movieGenres, tvGenres, loading: loadingGenres } = useTmdbGenres(language);
  const activeGenres = mediaType === "tv" ? tvGenres : movieGenres;

  // ID žánrov filmov a seriálov sa v TMDB líšia, preto pri prepnutí resetujeme výber.
  useEffect(() => {
    setGenreId("all");
  }, [mediaType]);

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
          data = await discover(mediaType, { genreId, year, sortBy, language, page: pageToLoad });
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
    [isSearching, debouncedQuery, mediaType, genreId, year, sortLabel, language]
  );

  useEffect(() => {
    loadResults(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching, debouncedQuery, mediaType, genreId, year, sortLabel, language]);

  // "Pokračovať v pozeraní" — reálny progres uložený v localStorage (viď MovieModal),
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

  return (
    <WebshareAuthProvider>
    <div className="min-h-screen text-gray-200 selection:bg-fuchsia-500/40 pb-16 md:pb-0">
      <Header
        activeNav={activeNav}
        onNavChange={setActiveNav}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        language={language}
        onLanguageChange={setLanguage}
        searchInputRef={searchInputRef}
      />

      {!hasApiKey && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-300 text-sm px-6 py-3 text-center">
          Chýba TMDB API kľúč. Skopíruj <code>.env.example</code> do <code>.env</code> v priečinku{" "}
          <code>filmzor-react</code> a doplň <code>VITE_TMDB_API_KEY</code> (reštart <code>npm run dev</code>).
        </div>
      )}

      {!isSearching && (
        <FilterPanel
          genres={activeGenres}
          genreId={genreId}
          onGenreChange={setGenreId}
          year={year}
          onYearChange={setYear}
          sortLabel={sortLabel}
          onSortChange={setSortLabel}
          loadingGenres={loadingGenres}
        />
      )}

      <main className="max-w-[1440px] mx-auto px-6 lg:px-10 py-10 flex flex-col gap-14">
        <MovieGrid
          title={isSearching ? "VÝSLEDKY VYHĽADÁVANIA" : "NOVINKY"}
          items={results}
          genreLookup={genreLookup}
          loading={loading}
          error={error}
          onSelect={setSelected}
          hasMore={page < totalPages}
          onLoadMore={() => loadResults(page + 1, false)}
          onRetry={() => loadResults(1, true)}
        />

        {!isSearching && continueItems.length > 0 && (
          <MovieRow
            title="POKRAČOVAŤ V POZERANÍ"
            movies={continueItems}
            genreLookup={genreLookup}
            onSelect={setSelected}
          />
        )}
      </main>

      <footer className="max-w-[1440px] mx-auto px-6 lg:px-10 py-10 text-center text-xs text-gray-600">
        © 2026 FilmZor — dáta poskytuje{" "}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-400"
        >
          TMDB
        </a>
        . Táto appka nie je podporovaná ani certifikovaná TMDB.
      </footer>

      <MovieModal item={selected} language={language} onClose={() => setSelected(null)} />

      <BottomNav
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onSearchClick={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          searchInputRef.current?.focus();
        }}
      />
    </div>
    </WebshareAuthProvider>
  );
}

export default App;
