// Beží AŽ PO @tailwindcss/vite (ten vygeneruje finálne Tailwind CSS, toto ho
// ešte post-procesuje) — Vite spúšťa postcss.config.js na výslednom CSS bez
// ohľadu na to, ktorý plugin ho vyprodukoval.
//
// Prečo je toto nutné: Tailwind v4 zabaľuje takmer všetky utility triedy
// (flex, grid, gap, spacing, farby...) do CSS `@layer` blokov a farby
// definuje cez oklch()/color-mix(). Staré Smart TV prehliadače (Tizen/WebOS/
// Android TV WebView so starším Chromium jadrom — na TV sa engine rokmi
// needatuje ako na desktope) nepoznajú `@layer` vôbec a CELÝ blok pravidiel
// v ňom zahodia (nie len tú jednu vlastnosť) — to je presná príčina, prečo sa
// na TV rozpadá layout (pills, grid) aj keď je zdrojový kód identický s
// desktopom. Táto konfigurácia @layer "vyplocho" na obyčajné CSS pravidlá
// (poradie zachované, takže kaskáda funguje rovnako) a oklch()/color-mix()
// prevedie na RGB fallback so `@supports` progressive enhancement pre
// moderné prehliadače.
export default {
  plugins: [
    (await import("postcss-preset-env")).default({
      stage: 2,
      features: {
        "cascade-layers": true,
        "oklab-function": { preserve: false },
        "color-mix": true,
      },
    }),
  ],
};
