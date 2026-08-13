import { useEffect, useRef } from "react";
import { posterUrl, backdropUrl } from "../../services/tmdb";
import { useTitlePlayer } from "../../hooks/useTitlePlayer";
import { useTvBackStack } from "../../hooks/useTvBackStack";
import { BackArrowIcon, PlayIcon } from "../Icons";
import SeasonEpisodePicker from "../SeasonEpisodePicker";
import FileTableSkeleton from "../skeletons/FileTableSkeleton";
import TvSourceList from "./TvSourceList";
import TvPlayer from "./TvPlayer";

// Full-screen náhrada MovieModal pre TV — popup na diaľkové ovládanie a na
// 3-metrový odstup nedáva zmysel, tu titul preberie celú obrazovku ako
// samostatná "stránka", na ktorú sa dá vrátiť diaľkovým "späť"
// (viď useTvBackStack) namiesto zatvárania appky.
export default function TvDetailView({ item, language, onClose }) {
  const videoRef = useRef(null);
  const playButtonRef = useRef(null);

  const player = useTitlePlayer(item, language, videoRef);
  const {
    details,
    loading,
    episodeSelection,
    setEpisodeSelection,
    wsFiles,
    wsLoading,
    wsError,
    wsLooselyMatched,
    wsNoResults,
    runWebshareSearch,
    linkLoadingIdent,
    pendingFile,
    setPendingFile,
    linkError,
    playerUrl,
    isTv,
    loggedIn,
    resetPlayerState,
    playFile,
  } = player;

  useTvBackStack(true, onClose);
  useTvBackStack(Boolean(playerUrl), resetPlayerState);

  // Znova skúsi fokusovať aj po dotiahnutí Webshare výsledkov — dovtedy
  // hlavné tlačidlo "Prehrať" ešte nemusí existovať (podmienené wsFiles.length).
  useEffect(() => {
    playButtonRef.current?.focus({ preventScroll: true });
  }, [item, wsLoading]);

  if (!item) return null;

  const title = (details && (isTv ? details.name : details.title)) || item.title;
  const dateStr = details && (isTv ? details.first_air_date : details.release_date);
  const year = (dateStr ? dateStr.slice(0, 4) : null) || item.year;
  const genres = details?.genres?.map((g) => g.name) || [];
  const overview = details?.overview || item.overview;
  const poster = posterUrl(item.posterPath, "w500");
  const backdrop = backdropUrl(details?.backdrop_path);
  const seasons = (details?.seasons || []).filter((s) => s.season_number > 0);

  const showEpisodePicker = isTv && !episodeSelection;
  const showResults = !isTv || episodeSelection;

  if (playerUrl) {
    return <TvPlayer player={player} videoRef={videoRef} title={title} onExit={resetPlayerState} />;
  }

  return (
    <div data-tv-overlay className="fixed inset-0 z-[150] bg-[#0f0f12] overflow-y-auto">
      <div className="relative">
        {backdrop && (
          <div className="absolute inset-0 h-[52vh] overflow-hidden">
            <img src={backdrop} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f12] via-[#0f0f12]/60 to-[#0f0f12]/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f12]/80 via-transparent to-transparent" />
          </div>
        )}

        <div className="relative flex flex-col gap-6 px-10 pt-8 pb-10 max-w-4xl">
          <button
            onClick={onClose}
            aria-label="Späť"
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <BackArrowIcon className="w-6 h-6" />
          </button>

          <div className="flex gap-6 items-end mt-[22vh]">
            {poster && (
              <img
                src={poster}
                alt={title}
                className="hidden md:block w-40 rounded-xl ring-1 ring-white/10 shadow-2xl shrink-0"
              />
            )}
            <div className="flex flex-col gap-3 min-w-0">
              <h1 className="text-4xl font-bold text-white leading-tight">{title}</h1>
              <p className="text-base text-gray-300">
                {year || "—"} • {isTv ? "Seriál" : "Film"}
                {isTv && episodeSelection && (
                  <>
                    {" "}
                    • S{episodeSelection.season}E{episodeSelection.episode.episode_number}
                    {episodeSelection.episode.name ? ` — ${episodeSelection.episode.name}` : ""}
                  </>
                )}
              </p>
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {genres.map((g) => (
                    <span
                      key={g}
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/10 text-gray-200"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
                {overview || "Popis nie je k dispozícii."}
              </p>

              {!showEpisodePicker && wsFiles.length > 0 && (
                <button
                  ref={playButtonRef}
                  onClick={() => playFile(wsFiles[0])}
                  disabled={linkLoadingIdent === wsFiles[0]?.ident}
                  className="mt-2 self-start inline-flex items-center gap-2 text-base font-bold tracking-wide bg-gradient-to-r from-violet-500 to-pink-500 hover:brightness-110 disabled:opacity-50 text-white px-7 py-3 rounded-full transition"
                >
                  <PlayIcon className="w-5 h-5 text-white ml-0" />
                  Prehrať
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-10 pb-16 flex flex-col gap-4 max-w-4xl">
        {showEpisodePicker && (
          <>
            <h2 className="text-sm font-bold tracking-widest text-gray-500">VYBER SÉRIU A EPIZÓDU</h2>
            {seasons.length > 0 ? (
              <SeasonEpisodePicker
                tvId={item.id}
                seasons={seasons}
                language={language}
                onSelectEpisode={(season, episode) => setEpisodeSelection({ season, episode })}
              />
            ) : (
              !loading && <p className="text-sm text-gray-500">Pre tento seriál sa nenašli žiadne série.</p>
            )}
          </>
        )}

        {showResults && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold tracking-widest text-gray-500">DOSTUPNÉ ZDROJE NA WEBSHARE</h2>
              {isTv && (
                <button
                  onClick={() => setEpisodeSelection(null)}
                  className="text-sm font-semibold text-gray-400 hover:text-white shrink-0 transition-colors"
                >
                  ← Zmeniť epizódu
                </button>
              )}
            </div>

            {wsLoading && <FileTableSkeleton />}

            {!wsLoading && wsError && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4">
                <p className="text-sm text-red-300 flex-1">Nepodarilo sa spojiť s Webshare. {wsError}</p>
                <button
                  onClick={() => runWebshareSearch()}
                  className="text-sm font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-4 py-2 rounded-full transition shrink-0"
                >
                  Skúsiť znova
                </button>
              </div>
            )}

            {wsLooselyMatched && wsFiles.length > 0 && (
              <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                Presná zhoda {isTv ? "epizódy" : "roku"} sa nenašla — zobrazené sú voľnejšie priradené výsledky, over
                si prosím rok/verziu v názve súboru.
              </p>
            )}

            {!wsLoading && !wsError && wsNoResults && (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-4">
                <p className="text-sm text-gray-300 flex-1">
                  Pre {isTv ? "túto epizódu" : "tento film"} sa nepodarilo nájsť žiadny stream na Webshare.
                </p>
                <button
                  onClick={() => runWebshareSearch()}
                  className="text-sm font-semibold text-gray-300 hover:text-white bg-white/10 hover:bg-white/15 px-4 py-2 rounded-full transition shrink-0"
                >
                  Skúsiť znova
                </button>
              </div>
            )}

            {wsFiles.length > 0 && (
              <TvSourceList files={wsFiles} linkLoadingIdent={linkLoadingIdent} onPlay={playFile} />
            )}

            {linkError && <p className="text-sm text-red-400">{linkError}</p>}

            {pendingFile && !loggedIn && (
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4">
                <p className="text-sm text-amber-300 flex-1">
                  Na prehratie sa treba prihlásiť k Webshare účtu — prihlás sa cez ikonu účtu v bočnom paneli a skúsi
                  sa to automaticky spustiť.
                </p>
                <button
                  onClick={() => setPendingFile(null)}
                  className="text-sm font-semibold text-gray-300 hover:text-white bg-white/10 hover:bg-white/15 px-4 py-2 rounded-full transition shrink-0"
                >
                  Zrušiť
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
