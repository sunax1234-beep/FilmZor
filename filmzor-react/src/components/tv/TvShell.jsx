import { LogoMark, HomeIcon, FilmIcon, TvIcon, SearchIcon } from "../Icons";
import HeaderAuthMenu from "../HeaderAuthMenu";

const NAV_ITEMS = [
  { label: "Domov", nav: "VÍTAJTE", icon: HomeIcon },
  { label: "Filmy", nav: "FILMY", icon: FilmIcon },
  { label: "Seriály", nav: "SERIÁLY", icon: TvIcon },
];

const LANGUAGES = [
  { code: "sk-SK", label: "SK" },
  { code: "cs-CZ", label: "CZ" },
];

// TV náhrada Header + BottomNav — trvalá horná lišta zarovnaná s PC
// rozložením (namiesto pôvodného bočného panelu), s väčšími cieľmi na
// diaľkové ovládanie vďaka globálnemu 10-foot UI škálovaniu
// (`html.tv-mode { font-size: 130% }` v index.css). `.tv-mode header.sticky`
// v index.css jej aj tak vypína backdrop-blur kvôli výkonu na slabšom GPU.
export default function TvShell({ activeNav, onNavChange, onSearchClick, language, onLanguageChange, children }) {
  return (
    <div className="tv-shell min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-[#0f0f12] border-b border-white/5">
        <div className="max-w-[1920px] mx-auto px-10 h-20 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <LogoMark />
            <span className="text-2xl font-extrabold tracking-tight gradient-text">FilmZor</span>
          </div>

          <nav className="flex items-center gap-3 mx-auto" aria-label="Hlavná navigácia">
            {NAV_ITEMS.map(({ label, nav, icon: Icon }) => {
              const active = activeNav === nav;
              return (
                <button
                  key={nav}
                  onClick={() => onNavChange(nav)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold transition-colors ${
                    active ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon className={`w-6 h-6 shrink-0 ${active ? "text-fuchsia-400" : ""}`} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={onSearchClick}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 text-base font-semibold text-gray-400 hover:text-white transition-colors"
            >
              <SearchIcon className="w-5 h-5 shrink-0" />
              Hľadať
            </button>

            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1">
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => onLanguageChange(code)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                    language === code
                      ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <HeaderAuthMenu />
          </div>
        </div>
      </header>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
