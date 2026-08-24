import { useEffect, useState } from "react";

// Dočasný diagnostický panel na zistenie, prečo TV prehliadač renderuje
// appku väčšiu než fyzická obrazovka (viditeľné len s ?debug=1 v URL).
// Bezpečné nechať v kóde — bez query parametra sa vôbec nevykreslí.
export default function DebugOverlay() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    function collect() {
      setInfo({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        dpr: window.devicePixelRatio,
        docClientWidth: document.documentElement.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        tvMode: document.documentElement.classList.contains("tv-mode"),
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        hoverNone: window.matchMedia?.("(hover: none)").matches,
        touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        ua: navigator.userAgent,
      });
    }

    collect();
    window.addEventListener("resize", collect);
    const interval = setInterval(collect, 1000);
    return () => {
      window.removeEventListener("resize", collect);
      clearInterval(interval);
    };
  }, []);

  if (!info) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 999999,
        background: "rgba(0,0,0,.85)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: "16px",
        lineHeight: 1.5,
        padding: "10px 14px",
        maxWidth: "90vw",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {`inner: ${info.innerWidth}x${info.innerHeight}
outer: ${info.outerWidth}x${info.outerHeight}
screen: ${info.screenWidth}x${info.screenHeight}
dpr: ${info.dpr}
doc.clientWidth: ${info.docClientWidth}
doc.scrollWidth: ${info.docScrollWidth}
tv-mode class: ${info.tvMode}
root font-size: ${info.rootFontSize}
hover:none matches: ${info.hoverNone}
touch: ${info.touch}
UA: ${info.ua}`}
    </div>
  );
}
