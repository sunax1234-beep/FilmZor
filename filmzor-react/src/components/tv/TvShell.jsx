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

// TV náhrada Header + BottomNav — trvalý bočný panel (namiesto hornej lišty,
// ktorá je na diaľkové "preklikávanie" nepohodlná) s veľkými ikonami/textom,
// zvyšok obrazovky necháva na `children` (TvHome, neskôr TvDetailView/TvPlayer).
export default function TvShell({ activeNav, onNavChange, onSearchClick, language, onLanguageChange, children }) {
  return (
    <div className="tv-shell flex min-h-screen">
      <aside className="w-56 shrink-0 flex flex-col gap-8 px-5 py-8 border-r border-white/5 bg-[#0f0f12]">
        <div className="flex items-center gap-2 px-1">
          <LogoMark />
          <span className="text-xl font-extrabold tracking-tight gradient-text">FilmZor</span>
        </div>

        <nav className="flex flex-col gap-2" aria-label="Hlavná navigácia">
          {NAV_ITEMS.map(({ label, nav, icon: Icon }) => {
            const active = activeNav === nav;
            return (
              <button
                key={nav}
                onClick={() => onNavChange(nav)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition-colors ${
                  active ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <Icon className={`w-6 h-6 shrink-0 ${active ? "text-fuchsia-400" : ""}`} />
                {label}
              </button>
            );
          })}
          <button
            onClick={onSearchClick}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold text-gray-400 hover:text-white transition-colors"
          >
            <SearchIcon className="w-6 h-6 shrink-0" />
            Hľadať
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 self-start">
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
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
