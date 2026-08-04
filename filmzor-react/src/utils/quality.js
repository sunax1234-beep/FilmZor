const RESOLUTION_RE = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;

export function formatQuality(file) {
  const match = file.name?.match(RESOLUTION_RE);
  let resolution = match ? match[1].toUpperCase() : null;
  if (resolution === "4K") resolution = "2160P";

  const format = (file.type || "").toUpperCase();

  return [resolution, format].filter(Boolean).join(" · ") || "—";
}
