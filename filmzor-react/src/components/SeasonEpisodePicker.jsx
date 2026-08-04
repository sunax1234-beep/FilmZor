import { useCallback, useEffect, useState } from "react";
import { getSeasonDetails } from "../services/tmdb";
import { ChevronDown, PlayIcon } from "./Icons";
import EpisodeListSkeleton from "./skeletons/EpisodeListSkeleton";

export default function SeasonEpisodePicker({ tvId, seasons, language, onSelectEpisode }) {
  const [seasonNumber, setSeasonNumber] = useState(seasons[0]?.season_number ?? 1);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadEpisodes = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      setEpisodes([]);

      try {
        const data = await getSeasonDetails(tvId, seasonNumber, language);
        if (signal?.cancelled) return;
        setEpisodes(data.episodes || []);
      } catch (e) {
        if (!signal?.cancelled) setError(e.message);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [tvId, seasonNumber, language]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    loadEpisodes(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadEpisodes]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-500 tracking-widest">SÉRIA</span>
        <div className="relative">
          <select
            value={seasonNumber}
            onChange={(e) => setSeasonNumber(Number(e.target.value))}
            className="appearance-none bg-white/5 border border-white/10 text-gray-200 text-xs font-semibold rounded-full pl-4 pr-9 py-2 outline-none focus:border-fuchsia-500/60 cursor-pointer"
          >
            {seasons.map((s) => (
              <option key={s.season_number} value={s.season_number}>
                Séria {s.season_number}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
        </div>
      </div>

      {loading && <EpisodeListSkeleton />}

      {!loading && error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-xs text-red-300 flex-1">Nepodarilo sa načítať epizódy. {error}</p>
          <button
            onClick={() => loadEpisodes()}
            className="text-xs font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-3 py-1.5 rounded-full transition shrink-0"
          >
            Skúsiť znova
          </button>
        </div>
      )}

      {!loading && !error && episodes.length > 0 && (
        <div className="flex flex-col divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden max-h-72 overflow-y-auto">
          {episodes.map((ep) => (
            <button
              key={ep.id}
              onClick={() => onSelectEpisode(seasonNumber, ep)}
              className="group flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
              <span className="text-sm text-gray-200 truncate">
                <span className="text-gray-500">Epizóda {ep.episode_number}:</span> {ep.name}
              </span>
              <PlayIcon className="w-4 h-4 text-gray-500 group-hover:text-white shrink-0 ml-0" />
            </button>
          ))}
        </div>
      )}

      {!loading && !error && episodes.length === 0 && (
        <p className="text-xs text-gray-500">Pre túto sériu sa nenašli žiadne epizódy.</p>
      )}
    </div>
  );
}
