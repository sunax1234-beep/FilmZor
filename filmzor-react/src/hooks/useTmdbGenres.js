import { useEffect, useState } from "react";
import { getGenres } from "../services/tmdb";

export function useTmdbGenres(language) {
  const [movieGenres, setMovieGenres] = useState([]);
  const [tvGenres, setTvGenres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getGenres("movie", language), getGenres("tv", language)])
      .then(([movies, tv]) => {
        if (cancelled) return;
        setMovieGenres(movies);
        setTvGenres(tv);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return { movieGenres, tvGenres, loading };
}
