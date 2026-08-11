import StandardApp from "./components/StandardApp";
import TvShell from "./components/tv/TvShell";
import TvHome from "./components/tv/TvHome";
import TvDetailView from "./components/tv/TvDetailView";
import { useCatalog } from "./hooks/useCatalog";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import { useIsTvDevice } from "./hooks/useIsTvDevice";
import { WebshareAuthProvider } from "./context/WebshareAuthContext";

function App() {
  const catalog = useCatalog();
  const isTv = useIsTvDevice();

  useSpatialNavigation();

  return (
    <WebshareAuthProvider>
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
