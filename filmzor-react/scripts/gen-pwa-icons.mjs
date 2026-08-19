// Jednorazový generátor PWA ikon z public/favicon.svg. sharp nie je deklarovaná
// závislosť appky (je len tranzitívne dostupná) — tento skript sa spúšťa
// ručne raz, výstupné PNG súbory sa commitujú, appka samotná sharp nepotrebuje.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BG = "#0f0f12";
const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));

async function renderIcon(size, logoScale, outPath) {
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(svg, { density: 384 }).resize(logoSize, logoSize, { fit: "contain" }).toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log("wrote", outPath);
}

// fileURLToPath (nie .pathname.slice(1)) — .slice(1) len náhodou funguje na
// Windows (kde pathname pre file:// URL začína "/C:/...", vedúce "/" treba
// odseknúť), na POSIX by ale odsekol SKUTOČNÉ vedúce "/" a spravil z
// absolútnej cesty relatívnu (voči CWD, nie voči tomuto skriptu).
await renderIcon(192, 0.62, fileURLToPath(new URL("../public/icon-192.png", import.meta.url)));
await renderIcon(512, 0.62, fileURLToPath(new URL("../public/icon-512.png", import.meta.url)));
// Maskable: OS orezáva do kruhu/rounded-square, logo musí byť v "safe zone" (menšie + viac paddingu).
await renderIcon(512, 0.42, fileURLToPath(new URL("../public/maskable-icon-512.png", import.meta.url)));
