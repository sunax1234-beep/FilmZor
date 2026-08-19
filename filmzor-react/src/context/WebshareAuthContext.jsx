import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getWebshareSession, loginWebshare, logoutWebshare } from "../services/webshare";

const WebshareAuthContext = createContext(null);

export function WebshareAuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getWebshareSession();
      setLoggedIn(Boolean(data.loggedIn));
      setUsername(data.username || null);
    } catch {
      setLoggedIn(false);
      setUsername(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (usernameInput, password, rememberMe = false) => {
    const data = await loginWebshare(usernameInput, password, rememberMe);
    setLoggedIn(true);
    setUsername(data.username);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await logoutWebshare().catch(() => {});
    setLoggedIn(false);
    setUsername(null);
  }, []);

  // Bez tohto by Provider posielal nový objekt pri KAŽDOM svojom renderi
  // (aj keď sa loggedIn/username/checking nezmenili) a prekreslil tak
  // úplne všetkých consumerov (Header, TvShell, useTitlePlayer...).
  const value = useMemo(
    () => ({ loggedIn, username, checking, login, logout, refresh }),
    [loggedIn, username, checking, login, logout, refresh]
  );

  return <WebshareAuthContext.Provider value={value}>{children}</WebshareAuthContext.Provider>;
}

export function useWebshareAuth() {
  const ctx = useContext(WebshareAuthContext);
  if (!ctx) {
    throw new Error("useWebshareAuth sa musí použiť vnútri <WebshareAuthProvider>.");
  }
  return ctx;
}
