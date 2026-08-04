export function normalizeItem(item, fallbackMediaType) {
  const mediaType = item.media_type || fallbackMediaType;
  const isTv = mediaType === "tv";
  const dateStr = isTv ? item.first_air_date : item.release_date;

  return {
    id: item.id,
    mediaType,
    title: (isTv ? item.name : item.title) || item.original_title || item.original_name,
    originalTitle: isTv ? item.original_name : item.original_title,
    year: dateStr ? dateStr.slice(0, 4) : null,
    posterPath: item.poster_path,
    overview: item.overview,
    genreIds: item.genre_ids || [],
    voteAverage: item.vote_average,
  };
}

export function genreNames(genreIds = [], genreList = []) {
  const map = new Map(genreList.map((g) => [g.id, g.name]));
  return genreIds.map((id) => map.get(id)).filter(Boolean);
}
