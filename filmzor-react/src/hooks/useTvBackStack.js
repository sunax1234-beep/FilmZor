import { useEffect, useRef } from "react";

// Android WebView back button maps to `webView.goBack()` (viď MainActivity.kt) —
// keďže táto SPA predtým nikdy nepridávala history záznamy, canGoBack() bol
// vždy false a diaľkové "späť" tak vždy rovno zavrelo appku, nech bola
// otvorená hocijaká obrazovka (detail, prehrávač...). TV obrazovky, ktoré sa
// "otvárajú" nad inou (napr. TvDetailView), zavolajú tento hook počas toho,
// čo sú zobrazené — pridá jeden history záznam a diaľkové/hardvérové "späť"
// namiesto opustenia appky zavrie len túto obrazovku.
export function useTvBackStack(isOpen, onClose) {
  // "Latest ref" namiesto priameho zachytenia `onClose` do closure — efekt
  // nižšie beží len raz za "otvorenie" ([isOpen] deps), takže bez tohto by
  // popstate/keydown handlery navždy volali PRVÚ verziu `onClose` z momentu,
  // keď sa obrazovka otvorila. Dnes to náhodou nevadí (všetky volania
  // posielajú stabilný setState wrapper), ale je to krehké — ref zaručuje
  // vždy aktuálnu verziu bez ohľadu na to, čo `onClose` volajúci odovzdá.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ filmzorTvView: true }, "");
    let popped = false;

    function handlePopState() {
      popped = true;
      onCloseRef.current();
    }

    // Klávesnica/diaľkové ovládanie na TV platformách bez hardvérového "späť"
    // (napr. prehliadačová appka na Tizen/webOS) posiela namiesto neho
    // Escape alebo Backspace — bez tohto sa z detailu/prehrávača nedalo
    // vrátiť inak než klikom na tlačidlo Späť na obrazovke. Volá priamo
    // `onClose` (rovnako ako tlačidlo Späť), nie `history.back()` — zvyšný
    // pushnutý history záznam potom zmaže cleanup nižšie (`if (!popped)`).
    function handleKeyDown(e) {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;
      e.preventDefault();
      onCloseRef.current();
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
      // Zatvorenie inak než diaľkovým "späť" (napr. klik na tlačidlo Zavrieť)
      // musí zahodiť aj nami pridaný history záznam, inak by ďalšie stlačenie
      // šípky späť len znova "zatvorilo" už zatvorenú obrazovku.
      if (!popped) history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
