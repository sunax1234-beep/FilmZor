import PillGroup from "./PillGroup";
import { ChevronDown } from "./Icons";

const SORT_LABELS = ["Najnovšie", "Najlepšie hodnotené", "Najobľúbenejšie", "Abecedne A-Z"];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => String(currentYear + 1 - i));

export default function FilterPanel({
  genres,
  genreId,
  onGenreChange,
  year,
  onYearChange,
  sortLabel,
  onSortChange,
  loadingGenres,
}) {
  const genreOptions = [{ id: "all", name: "Všetko" }, ...genres];
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
          {!loadingGenres &&
            genreOptions.map((g) => (
              <button
                key={g.id}
                onClick={() => onGenreChange(g.id)}
                className={`pill px-4 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:border-fuchsia-400/50 ${
                  genreId === g.id ? "active" : ""
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

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 tracking-widest">ZORADIŤ PODĽA</span>
          <div className="relative">
            <select
              value={sortLabel}
              onChange={(e) => onSortChange(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 text-gray-200 text-xs font-semibold rounded-full pl-4 pr-9 py-2 outline-none focus:border-fuchsia-500/60 cursor-pointer"
            >
              {SORT_LABELS.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>
        </div>
      </div>
    </section>
  );
}
