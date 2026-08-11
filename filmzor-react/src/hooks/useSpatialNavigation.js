import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const DIRECTIONS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// `getBoundingClientRect` je aj tak nevyhnutný pre pozičnú navigáciu nižšie,
// takže viditeľnosť odvodzujeme z jeho rozmerov namiesto ďalšieho volania
// `getComputedStyle` (vynucuje vlastný style recalc) — na appke s desiatkami
// až stovkami kariet (po "Načítať viac") to pri každom stlačení šípky
// prakticky zdvojnásobovalo počet vynútených reflow na slabšom TV CPU/GPU.
function getFocusableElements() {
  const rects = new Map();
  const elements = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    rects.set(el, rect);
    return true;
  });
  return { elements, rects };
}

function getCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Nájde najbližší focusovateľný prvok v danom smere podľa jeho pozície na obrazovke
// (nie podľa poradia v DOM) — presne ako navigácia šípkami na Smart TV diaľkovom ovládaní.
// `rects` je mapa už zmeraných obdĺžnikov (viď getFocusableElements), nech sa
// tá istá vrstva kariet nemeria opakovane.
function findNextElement(current, direction, candidates, rects) {
  const currentCenter = getCenter(rects.get(current) || current.getBoundingClientRect());
  let best = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const center = getCenter(rects.get(el) || el.getBoundingClientRect());
    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;

    let primary;
    let perpendicular;
    let matchesDirection;

    switch (direction) {
      case "right":
        primary = dx;
        perpendicular = dy;
        matchesDirection = dx > 4;
        break;
      case "left":
        primary = -dx;
        perpendicular = dy;
        matchesDirection = dx < -4;
        break;
      case "down":
        primary = dy;
        perpendicular = dx;
        matchesDirection = dy > 4;
        break;
      case "up":
        primary = -dy;
        perpendicular = dx;
        matchesDirection = dy < -4;
        break;
      default:
        matchesDirection = false;
    }

    if (!matchesDirection) continue;

    // Bočné vychýlenie penalizujeme viac než vzdialenosť v smere pohybu,
    // aby šípka doprava/doľava uprednostnila prvky v tom istom riadku.
    const score = primary + Math.abs(perpendicular) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

// Globálna podpora navigácie šípkami (Smart TV diaľkové ovládanie / klávesnica).
// Aktuálne zaostrený prvok dostane triedu `tv-focus` (glow efekt, viď index.css).
export function useSpatialNavigation({ enabled = true } = {}) {
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    function setFocusClass(el) {
      if (lastFocusedRef.current && lastFocusedRef.current !== el) {
        lastFocusedRef.current.classList.remove("tv-focus");
      }
      if (el) {
        el.classList.add("tv-focus");
        lastFocusedRef.current = el;
      }
    }

    function handleKeyDown(e) {
      const active = document.activeElement;
      const activeTag = active?.tagName;

      // V texte/selecte necháme natívne správanie šípok (kurzor, hodnota selectu).
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }

      const direction = DIRECTIONS[e.key];
      if (direction) {
        const { elements: candidates, rects } = getFocusableElements();
        if (candidates.length === 0) return;

        const current = active && candidates.includes(active) ? active : null;

        if (!current) {
          e.preventDefault();
          const first = candidates[0];
          first.focus({ preventScroll: true });
          setFocusClass(first);
          return;
        }

        const next = findNextElement(current, direction, candidates, rects);
        if (next) {
          e.preventDefault();
          next.focus({ preventScroll: true });
          next.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          setFocusClass(next);
        }
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        // Skutočné <button>/<a> spracujú Enter natívne; toto je len pre
        // vlastné prvky s role="button" (napr. karty filmov), ktoré to nemajú zadarmo.
        if (active && active.getAttribute("role") === "button" && activeTag === "DIV") {
          e.preventDefault();
          active.click();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (lastFocusedRef.current) lastFocusedRef.current.classList.remove("tv-focus");
    };
  }, [enabled]);
}
