import { useEffect, useRef, useState } from "react";
import { useWebshareAuth } from "../context/WebshareAuthContext";
import WebshareLoginForm from "./WebshareLoginForm";
import { UserIcon } from "./Icons";

export default function HeaderAuthMenu() {
  const { loggedIn, username, checking, logout } = useWebshareAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  }

  if (checking) {
    return <div className="w-10 h-9 sm:w-32 sm:h-9 rounded-full bg-white/5 animate-pulse shrink-0" />;
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      {loggedIn ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-full pl-1.5 pr-2 sm:pr-3 py-1.5 transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-[11px] font-bold text-white uppercase shrink-0">
            {username?.charAt(0) || "?"}
          </span>
          <span className="hidden sm:inline text-xs font-semibold text-gray-200 max-w-[100px] truncate">
            {username}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-gray-300 hover:text-white border border-white/10 hover:border-white/20 rounded-full px-3 sm:px-4 py-2 transition-colors"
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prihlásenie</span>
        </button>
      )}

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-[#17171c] border border-white/10 rounded-xl shadow-2xl p-4 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {loggedIn ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-300">
                Prihlásený ako <span className="font-semibold text-white">{username}</span>
              </p>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 rounded-full px-4 py-2 transition self-start"
              >
                {loggingOut ? "Odhlasujem..." : "Odhlásiť sa"}
              </button>
            </div>
          ) : (
            <WebshareLoginForm onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}
