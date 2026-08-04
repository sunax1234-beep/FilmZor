import { FilmIcon, HomeIcon, SearchIcon, TvIcon } from "./Icons";

const NAV_ITEMS = [
  { label: "VÍTAJTE", icon: HomeIcon },
  { label: "FILMY", icon: FilmIcon },
  { label: "SERIÁLY", icon: TvIcon },
];

// Mobilná náhrada hornej navigácie — dostupná palcom, vždy viditeľná na spodku obrazovky.
export default function BottomNav({ activeNav, onNavChange, onSearchClick }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0f0f12]/95 backdrop-blur-md border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      aria-label="Hlavná navigácia"
    >
      <div className="grid grid-cols-4 h-16">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const active = activeNav === label;
          return (
            <button
              key={label}
              onClick={() => onNavChange(label)}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors ${
                active ? "text-white" : "text-gray-500"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? "text-fuchsia-400" : ""}`} />
              {label}
            </button>
          );
        })}
        <button
          onClick={onSearchClick}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-gray-500"
        >
          <SearchIcon className="w-5 h-5" />
          HĽADAŤ
        </button>
      </div>
    </nav>
  );
}
