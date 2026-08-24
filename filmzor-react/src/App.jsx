import StandardApp from "./components/StandardApp";
import TvShell from "./components/tv/TvShell";
import TvHome from "./components/tv/TvHome";
import TvDetailView from "./components/tv/TvDetailView";
import DebugOverlay from "./components/DebugOverlay";
import { useCatalog } from "./hooks/useCatalog";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import { useIsTvDevice } from "./hooks/useIsTvDevice";
import { WebshareAuthProvider } from "./context/WebshareAuthContext";

function App() {
  const catalog = useCatalog();
  const isTv = useIsTvDevice();

  // Šípkami-ovládaná navigácia je určená pre diaľkové ovládanie na TV —
  // mimo TV by inak šípka namiesto natívneho scrollu/pohybu kurzora
  // nečakane preskočila fokus na najbližšiu kartu/tlačidlo.
  useSpatialNavigation({ enabled: isTv });

  return (
    <WebshareAuthProvider>
      <DebugOverlay />
      {isTv ? (
        <TvShell
          activeNav={catalog.activeNav}
          onNavChange={catalog.setActiveNav}
          onSearchClick={() => catalog.searchInputRef.current?.focus()}
          language={catalog.language}
          onLanguageChange={catalog.setLanguage}
        >
          <TvHome catalog={catalog} />
          <TvDetailView
            item={catalog.selected}
            language={catalog.language}
            onClose={() => catalog.setSelected(null)}
          />
        </TvShell>
      ) : (
        <StandardApp catalog={catalog} />
      )}
    </WebshareAuthProvider>
  );
}

export default App;
