import Header from "./Header";
import BottomNav from "./BottomNav";
import FilterPanel from "./FilterPanel";
import MovieGrid from "./MovieGrid";
import MovieRow from "./MovieRow";
import MovieModal from "./MovieModal";
import { hasApiKey } from "../services/tmdb";

// Telefón/desktop UI — pôvodný obsah App.jsx, teraz konzument zdieľaného
// useCatalog() (viď hooks/useCatalog.js), nech katalógový state nie je
// duplikovaný oproti TV UI (TvHome).
export default function StandardApp({ catalog }) {
  const {
    activeNav,
    setActiveNav,
    language,
    setLanguage,
    searchQuery,
    setSearchQuery,
    isSearching,
    genreId,
    setGenreId,
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
  } = catalog;

  return (
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
  );
}
