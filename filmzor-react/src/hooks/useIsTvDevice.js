import { useEffect, useState } from "react";

const TV_UA_PATTERN = /\b(TV|SmartTV|GoogleTV|AFTT|AFTB|AFTA|AFTM|AFTS|BRAVIA|Tizen|Web0S|CrKey)\b/i;

// Fyzická šírka obrazovky v pixeloch — nie CSS `window.innerWidth`. Niektoré
// Android TV boxy (napr. "Smart TV Pro", zistené 2026-08 s dpr=2) hlásia
// innerWidth len ako polovicu skutočného rozlíšenia (960 namiesto fyzických
// 1920), lebo devicePixelRatio je 2. Kdekoľvek rozhodujeme podľa veľkosti
// obrazovky (TV heuristika aj počet stĺpcov v gride nižšie), musíme počítať
// s touto fyzickou šírkou, inak appka na takom zariadení vyzerá cca 2×
// väčšia, než má (viď index.css .tv-mode .movie-grid).
function physicalWidth() {
  return window.innerWidth * (window.devicePixelRatio || 1);
}
function physicalHeight() {
  return window.innerHeight * (window.devicePixelRatio || 1);
}

// Heuristika: skutočné TV/set-top-box zariadenia nemajú dotykovú obrazovku ani
// myš (hover: none) a bežia na veľkej obrazovke — presne opak telefónu/tabletu
// (ktorý má dotyk) aj desktopu (ktorý má hover). UA reťazec je len doplnkový
// fallback pre platformy, ktoré ho hlásia explicitne.
function detectTv() {
  if (typeof window === "undefined") return false;

  if (TV_UA_PATTERN.test(navigator.userAgent || "")) return true;

  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (hasTouch) return false;

  const noHover = window.matchMedia?.("(hover: none)").matches;
  const isLargeScreen = Math.max(physicalWidth(), physicalHeight()) >= 1280;
  return Boolean(noHover && isLargeScreen);
}

// Počet stĺpcov `.movie-grid` v tv-mode podľa fyzickej šírky obrazovky (viď
// physicalWidth() vyššie) — nahrádza pôvodné `@media (min-width: ...)`
// pravidlá v index.css, ktoré merali CSS px a boli tak nesprávne na
// zariadeniach s devicePixelRatio ≠ 1.
function gridColsForWidth(width) {
  if (width >= 3840) return 14;
  if (width >= 2560) return 10;
  if (width >= 1920) return 8;
  if (width >= 1200) return 6;
  return 4;
}

function gridGapForWidth(width) {
  if (width >= 3840) return "2.25rem 2.75rem";
  if (width >= 1920) return "2rem 2.5rem";
  return "1.75rem 2.25rem";
}

// Prepína triedu `tv-mode` na <html> (viď index.css) — CSS efekty príliš
// náročné na slabšie TV GPU (backdrop-blur, veľké rozmazané box-shadow) sa
// tak dajú zľahčiť bez toho, aby to ovplyvnilo mobil/desktop. Zároveň
// nastavuje `--tv-grid-cols`, ktorý index.css používa v `repeat(var(...))`.
export function useIsTvDevice() {
  const [isTv, setIsTv] = useState(detectTv);

  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", isTv);
  }, [isTv]);

  useEffect(() => {
    function applyGridCols() {
      const width = physicalWidth();
      document.documentElement.style.setProperty("--tv-grid-cols", String(gridColsForWidth(width)));
      document.documentElement.style.setProperty("--tv-grid-gap", gridGapForWidth(width));
    }
    function recheck() {
      setIsTv(detectTv());
      applyGridCols();
    }
    applyGridCols();
    window.addEventListener("resize", recheck);
    return () => window.removeEventListener("resize", recheck);
  }, []);

  return isTv;
}
