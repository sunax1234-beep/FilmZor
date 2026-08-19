import FilterPanel from "../FilterPanel";
import MovieGrid from "../MovieGrid";
import MovieRow from "../MovieRow";
import { SearchIcon } from "../Icons";
import { hasApiKey } from "../../services/tmdb";

const TV_CARD_WIDTH = "w-56 lg:w-64 shrink-0";

// TV domovská obrazovka — jednoduchý feed (nie Netflix-štýl viacero radov
// podľa žánru): "Pokračovať v pozeraní" rad hore, potom dnešný filtrovateľný
// grid, len s väčšími kartami/rozostupmi (viď .tv-mode pravidlá v index.css)
// vhodnými na sledovanie z gauča. Dáta prichádzajú z useCatalog (zdieľané so
// StandardApp), tu sa len inak vykresľujú a inak sa nimi prechádza.
export default function TvHome({ catalog }) {
  const {
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
    setSelected,
    searchInputRef,
    activeGenres,
    loadingGenres,
    genreLookup,
  } = catalog;

  return (
    <div className="flex flex-col gap-10 px-10 py-8 pb-16">
      <form onSubmit={(e) => e.preventDefault()} className="w-full max-w-xl">
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-5 pr-2 py-2 focus-within:border-fuchsia-500/60 transition-colors">
          <SearchIcon className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hľadať filmy a seriály..."
            className="bg-transparent outline-none text-base placeholder:text-gray-500 flex-1 min-w-0"
          />
        </div>
      </form>

      {!hasApiKey && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm px-4 py-3 rounded-xl">
          Chýba TMDB API kľúč. Skopíruj <code>.env.example</code> do <code>.env</code> v priečinku{" "}
          <code>filmzor-react</code> a doplň <code>VITE_TMDB_API_KEY</code>.
        </div>
      )}

      {!isSearching && continueItems.length > 0 && (
        <MovieRow
          title="POKRAČOVAŤ V POZERANÍ"
          movies={continueItems}
          genreLookup={genreLookup}
          onSelect={setSelected}
          cardWidthClassName={TV_CARD_WIDTH}
        />
      )}

      {!isSearching && (
        <FilterPanel
          genres={activeGenres}
          genreIds={genreIds}
          onGenreToggle={toggleGenre}
          year={year}
          onYearChange={setYear}
          sortLabel={sortLabel}
          onSortChange={setSortLabel}
          loadingGenres={loadingGenres}
        />
      )}

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
    </div>
  );
}
