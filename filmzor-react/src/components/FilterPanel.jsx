import PillGroup from "./PillGroup";

const SORT_LABELS = ["Najnovšie", "Najlepšie hodnotené", "Najobľúbenejšie", "Abecedne A-Z"];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => String(currentYear + 1 - i));

export default function FilterPanel({
  genres,
  genreIds,
  onGenreToggle,
  year,
  onYearChange,
  sortLabel,
  onSortChange,
  loadingGenres,
}) {
  const yearOptions = ["Všetky", ...YEARS];

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-10 py-6 flex flex-col gap-4 border-b border-white/5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-bold text-gray-500 tracking-widest mr-1">ŽÁNER</span>
        <div className="flex flex-wrap gap-2">
          {loadingGenres &&
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-[26px] rounded-full bg-white/10"
                style={{ width: `${60 + ((i * 17) % 50)}px` }}
              />
            ))}
          {!loadingGenres && (
            <button
              onClick={() => onGenreToggle("all")}
              className={`pill px-4 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:border-fuchsia-400/50 ${
                genreIds.length === 0 ? "active" : ""
              }`}
            >
              Všetko
            </button>
          )}
          {!loadingGenres &&
            genres.map((g) => (
              <button
                key={g.id}
                onClick={() => onGenreToggle(g.id)}
                aria-pressed={genreIds.includes(g.id)}
                className={`pill px-4 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:border-fuchsia-400/50 ${
                  genreIds.includes(g.id) ? "active" : ""
                }`}
              >
                {g.name}
              </button>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <PillGroup
          label="ROK"
          options={yearOptions}
          active={year === "all" ? "Všetky" : String(year)}
          onChange={(v) => onYearChange(v === "Všetky" ? "all" : v)}
        />

        <PillGroup label="ZORADIŤ PODĽA" options={SORT_LABELS} active={sortLabel} onChange={onSortChange} />
      </div>
    </section>
  );
}
