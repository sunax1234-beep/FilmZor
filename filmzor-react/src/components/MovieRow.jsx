import { memo, useRef } from "react";
import MovieCard from "./MovieCard";
import { ChevronLeft, ChevronRight } from "./Icons";

function MovieRow({
  title,
  movies,
  genreLookup,
  onSelect,
  cardWidthClassName = "w-36 sm:w-44 md:w-52 shrink-0",
}) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold tracking-wide">
          {title} <span className="gradient-text">.</span>
        </h2>
      </div>
      <div className="row-wrap relative group">
        <button
          onClick={() => scroll("left")}
          aria-label="Posunúť doľava"
          className="row-arrow hidden md:flex absolute -left-3 top-0 bottom-8 z-30 w-10 my-auto items-center justify-center rounded-full bg-black/60 hover:bg-black/80 border border-white/10"
        >
          <ChevronLeft />
        </button>
        <div
          ref={scrollRef}
          className="row-scroll touch-scroll flex gap-4 md:gap-5 overflow-x-auto pb-3 pt-2 px-1 scroll-px-1 snap-x snap-mandatory"
        >
          {movies.map((item) => (
            <MovieCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              genreLabel={genreLookup(item)}
              onClick={onSelect}
              sizeClassName={cardWidthClassName}
            />
          ))}
        </div>
        <button
          onClick={() => scroll("right")}
          aria-label="Posunúť doprava"
          className="row-arrow hidden md:flex absolute -right-3 top-0 bottom-8 z-30 w-10 my-auto items-center justify-center rounded-full bg-black/60 hover:bg-black/80 border border-white/10"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

export default memo(MovieRow);
