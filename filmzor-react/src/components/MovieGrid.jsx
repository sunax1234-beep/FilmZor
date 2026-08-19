import { memo } from "react";
import MovieCard from "./MovieCard";
import MovieGridSkeleton from "./skeletons/MovieGridSkeleton";

function MovieGrid({ title, items, genreLookup, loading, error, onSelect, onLoadMore, hasMore, onRetry }) {
  const initialLoading = loading && items.length === 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold tracking-wide">
          {title} <span className="gradient-text">.</span>
        </h2>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-3 text-center bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-12">
          <p className="text-sm text-red-300">Nepodarilo sa načítať dáta z TMDB. Skontroluj internetové pripojenie.</p>
          <p className="text-xs text-red-400/70">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 px-5 py-2 rounded-full text-xs font-bold tracking-wider bg-gradient-to-r from-violet-500 to-pink-500 hover:brightness-110 text-white transition"
            >
              Skúsiť znova
            </button>
          )}
        </div>
      )}

      {!error && initialLoading && <MovieGridSkeleton />}

      {!error && !loading && items.length === 0 && (
        <p className="text-sm text-gray-500">Nič sa nenašlo. Skús zmeniť filtre alebo hľadaný výraz.</p>
      )}

      {!error && !initialLoading && items.length > 0 && (
        <div className="movie-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-8">
          {items.map((item) => (
            <MovieCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              genreLabel={genreLookup(item)}
              onClick={onSelect}
            />
          ))}
        </div>
      )}

      {!error && loading && items.length > 0 && <p className="text-sm text-gray-500 mt-6">Načítavam...</p>}

      {hasMore && !loading && items.length > 0 && (
        <div className="flex justify-center mt-8">
          <button
            onClick={onLoadMore}
            className="px-6 py-2.5 rounded-full text-xs font-bold tracking-wider bg-white/5 border border-white/10 hover:border-fuchsia-400/50 transition"
          >
            NAČÍTAŤ VIAC
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(MovieGrid);
