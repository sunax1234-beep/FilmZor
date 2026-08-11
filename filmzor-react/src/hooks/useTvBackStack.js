import { useEffect } from "react";

// Android WebView back button maps to `webView.goBack()` (viď MainActivity.kt) —
// keďže táto SPA predtým nikdy nepridávala history záznamy, canGoBack() bol
// vždy false a diaľkové "späť" tak vždy rovno zavrelo appku, nech bola
// otvorená hocijaká obrazovka (detail, prehrávač...). TV obrazovky, ktoré sa
// "otvárajú" nad inou (napr. TvDetailView), zavolajú tento hook počas toho,
// čo sú zobrazené — pridá jeden history záznam a diaľkové/hardvérové "späť"
// namiesto opustenia appky zavrie len túto obrazovku.
export function useTvBackStack(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ filmzorTvView: true }, "");
    let popped = false;

    function handlePopState() {
      popped = true;
      onClose();
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Zatvorenie inak než diaľkovým "späť" (napr. klik na tlačidlo Zavrieť)
      // musí zahodiť aj nami pridaný history záznam, inak by ďalšie stlačenie
      // šípky späť len znova "zatvorilo" už zatvorenú obrazovku.
      if (!popped) history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
