import { useCallback, useEffect, useState } from "react";
import { getGenres } from "../services/tmdb";

export function useTmdbGenres(language) {
  const [movieGenres, setMovieGenres] = useState([]);
  const [tvGenres, setTvGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Zmena hodnoty vynúti opätovné spustenie efektu nižšie — jediný účel je
  // dať retry() spôsob, ako "znova skúsiť", bez toho aby language musela byť
  // súčasťou tohto triku.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getGenres("movie", language), getGenres("tv", language)])
      .then(([movies, tv]) => {
        if (cancelled) return;
        setMovieGenres(movies);
        setTvGenres(tv);
      })
      .catch((e) => {
        // Predtým sa chyba len prehltla — filter žánrov ostal navždy prázdny
        // (len "Všetko") bez akéhokoľvek vysvetlenia alebo možnosti to skúsiť znova.
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [language, retryToken]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  return { movieGenres, tvGenres, loading, error, retry };
}
