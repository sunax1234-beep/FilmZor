import { LogoMark, SearchIcon } from "./Icons";
import HeaderAuthMenu from "./HeaderAuthMenu";

const NAV_ITEMS = ["VÍTAJTE", "FILMY", "SERIÁLY"];
const LANGUAGES = [
  { code: "sk-SK", label: "SK" },
  { code: "cs-CZ", label: "CZ" },
];

export default function Header({
  activeNav,
  onNavChange,
  searchQuery,
  onSearchChange,
  language,
  onLanguageChange,
  searchInputRef,
}) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0f0f12]/85 border-b border-white/5">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 h-16 md:h-20 flex items-center justify-between gap-3 md:gap-6">
        <a href="#" className="flex items-center gap-2 shrink-0">
          <LogoMark />
          <span className="text-xl md:text-2xl font-extrabold tracking-tight gradient-text">FilmZor</span>
        </a>

        <nav className="hidden md:flex items-center gap-10 text-sm font-semibold tracking-wide text-gray-400 mx-auto">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onNavChange(item);
              }}
              className={`hover:text-white transition-colors ${activeNav === item ? "nav-active" : ""}`}
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 shrink-0">
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => onLanguageChange(code)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                  language === code
                    ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-4 pr-1.5 py-1.5 focus-within:border-fuchsia-500/60 transition-colors"
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Hľadať..."
              className="bg-transparent outline-none text-sm placeholder:text-gray-500 w-20 sm:w-32 md:w-48"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs font-bold tracking-wider bg-gradient-to-r from-violet-500 to-pink-500 hover:brightness-110 text-white px-3 sm:px-4 py-2 rounded-full transition shrink-0"
            >
              <SearchIcon />
              <span className="hidden sm:inline">HĽADAŤ</span>
            </button>
          </form>

          <HeaderAuthMenu />
        </div>
      </div>
    </header>
  );
}
