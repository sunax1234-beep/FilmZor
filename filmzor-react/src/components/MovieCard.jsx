import { memo } from "react";
import { PlayIcon } from "./Icons";
import { posterUrl } from "../services/tmdb";

// memo: mriežka vie mať po niekoľkých "Načítať viac" stovky kariet — bez
// tohto by prekreslenie rodiča z akéhokoľvek dôvodu (napr. úder klávesy vo
// vyhľadávaní) prekreslilo úplne KAŽDÚ kartu, aj keď jej vlastné props
// (item/genreLabel/onClick) sa vôbec nezmenili.
function MovieCard({ item, genreLabel, onClick, sizeClassName = "w-full" }) {
  const poster = posterUrl(item.posterPath, "w500");

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(item);
    }
  }

  return (
    <div
      className={`movie-card group snap-start cursor-pointer outline-none ${sizeClassName}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={handleKeyDown}
    >
      <div className="relative rounded-2xl overflow-hidden aspect-[2/3] bg-gradient-to-br from-violet-800 via-fuchsia-700 to-pink-600 ring-1 ring-white/10">
        <div className="poster-shade absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300" />

        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <span className="text-white/90 font-bold text-lg drop-shadow-lg leading-snug">{item.title}</span>
          </div>
        )}

        <div className="play-overlay absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-[0_0_25px_rgba(255,255,255,0.35)]">
            <PlayIcon />
          </div>
        </div>

        {item.progress != null && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
            <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2.5 px-0.5">
        <p className="text-sm font-semibold text-gray-100 truncate">{item.title}</p>
        <p className="text-xs text-gray-500 truncate">
          {item.season != null && item.episode != null ? `S${item.season}E${item.episode}` : genreLabel}
          {item.year ? ` • ${item.year}` : ""}
        </p>
      </div>
    </div>
  );
}

export default memo(MovieCard);
