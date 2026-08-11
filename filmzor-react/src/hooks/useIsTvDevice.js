import { useEffect, useState } from "react";

const TV_UA_PATTERN = /\b(TV|SmartTV|GoogleTV|AFTT|AFTB|AFTA|AFTM|AFTS|BRAVIA|Tizen|Web0S|CrKey)\b/i;

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
  const isLargeScreen = Math.max(window.innerWidth, window.innerHeight) >= 1280;
  return Boolean(noHover && isLargeScreen);
}

// Prepína triedu `tv-mode` na <html> (viď index.css) — CSS efekty príliš
// náročné na slabšie TV GPU (backdrop-blur, veľké rozmazané box-shadow) sa
// tak dajú zľahčiť bez toho, aby to ovplyvnilo mobil/desktop.
export function useIsTvDevice() {
  const [isTv, setIsTv] = useState(detectTv);

  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", isTv);
  }, [isTv]);

  useEffect(() => {
    function recheck() {
      setIsTv(detectTv());
    }
    window.addEventListener("resize", recheck);
    return () => window.removeEventListener("resize", recheck);
  }, []);

  return isTv;
}
