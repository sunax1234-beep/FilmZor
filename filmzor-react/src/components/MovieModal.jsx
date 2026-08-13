import { useEffect, useRef } from "react";
import { posterUrl } from "../services/tmdb";
import { useTitlePlayer } from "../hooks/useTitlePlayer";
import { formatQuality } from "../utils/quality";
import { CloseIcon, PlayIcon, PauseIcon, VolumeIcon, MuteIcon, FullscreenIcon } from "./Icons";
import SeasonEpisodePicker from "./SeasonEpisodePicker";
import FileTableSkeleton from "./skeletons/FileTableSkeleton";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function MovieModal({ item, language, onClose }) {
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const sliderRef = useRef(null);

  const {
    details,
    loading,
    error,
    loadDetails,
    episodeSelection,
    setEpisodeSelection,
    wsFiles,
    wsLoading,
    wsError,
    wsLooselyMatched,
    wsNoResults,
    runWebshareSearch,
    linkLoadingIdent,
    linkError,
    pendingFile,
    setPendingFile,
    playerUrl,
    playerFile,
    duration,
    displayPosition,
    isPlaying,
    isSeeking,
    isDragging,
    setIsDragging,
    setDragPreviewSeconds,
    isMuted,
    videoError,
    isTv,
    loggedIn,
    resetPlayerState,
    commitSeek,
    playFile,
    retryPlayback,
    handleVideoPlaying,
    handleVideoError,
    handleVideoEnded,
    handleTimeUpdate,
    togglePlayPause,
    toggleMute,
    seekSecondsFromClientX,
    nudgePosition,
    setIsPlaying,
    setIsMuted,
  } = useTitlePlayer(item, language, videoRef);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  function toggleFullscreen() {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }

  function handleSliderPointerDown(e) {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragPreviewSeconds(seekSecondsFromClientX(e.clientX, sliderRef.current));
  }

  function handleSliderPointerMove(e) {
    if (!isDragging) return;
    setDragPreviewSeconds(seekSecondsFromClientX(e.clientX, sliderRef.current));
  }

  function handleSliderPointerUp(e) {
    if (!isDragging) return;
    const target = seekSecondsFromClientX(e.clientX, sliderRef.current);
    setIsDragging(false);
    setDragPreviewSeconds(null);
    commitSeek(target);
  }

  // Šípky vľavo/vpravo posúvajú pozíciu; stopPropagation je nutný, lebo
  // useSpatialNavigation má globálny window keydown listener, ktorý by inak
  // tie isté šípky zachytil a presunul fokus na susedný prvok namiesto
  // pretočenia. Hore/dole necháme bublať ďalej (normálna D-pad navigácia
  // mimo lišty).
  function handleSliderKeyDown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    nudgePosition(e.key === "ArrowRight" ? 10 : -10);
  }

  if (!item) return null;

  const title = (details && (isTv ? details.name : details.title)) || item.title;
  const originalTitle = (details && (isTv ? details.original_name : details.original_title)) || item.originalTitle;
  const dateStr = details && (isTv ? details.first_air_date : details.release_date);
  const year = (dateStr ? dateStr.slice(0, 4) : null) || item.year;
  const genres = details?.genres?.map((g) => g.name) || [];
  const overview = details?.overview || item.overview;
  const poster = posterUrl(item.posterPath, "w500");
  const seasons = (details?.seasons || []).filter((s) => s.season_number > 0);

  const showEpisodePicker = isTv && !episodeSelection && !playerUrl;
  const showResults = !isTv || episodeSelection;

  return (
    <div
      data-tv-overlay
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#17171c] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Zavrieť"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 flex items-center justify-center"
        >
          <CloseIcon />
        </button>

        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="shrink-0 w-full md:w-56 mx-auto md:mx-0">
            <div className="rounded-xl overflow-hidden aspect-[2/3] bg-gradient-to-br from-violet-800 to-fuchsia-700 ring-1 ring-white/10">
              {poster && <img src={poster} alt={title} className="w-full h-full object-cover" />}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {error && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-red-300">Nepodarilo sa načítať detail z TMDB.</p>
                <button
                  onClick={() => loadDetails()}
                  className="text-xs font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-3 py-1 rounded-full transition shrink-0"
                >
                  Skúsiť znova
                </button>
              </div>
            )}

            <h3 className="text-2xl font-bold text-white leading-tight">{title}</h3>

            {originalTitle && originalTitle !== title && (
              <p className="text-sm text-gray-500 italic">Originálny názov: {originalTitle}</p>
            )}

            <p className="text-sm text-gray-400">
              {year || "—"} • {isTv ? "Seriál" : "Film"}
              {isTv && episodeSelection && (
                <>
                  {" "}
                  • S{episodeSelection.season}E{episodeSelection.episode.episode_number}
                  {episodeSelection.episode.name ? ` — ${episodeSelection.episode.name}` : ""}
                </>
              )}
            </p>

            {loading && genres.length === 0 && (
              <div className="flex flex-wrap gap-2 animate-pulse">
                <div className="h-6 w-16 rounded-full bg-white/10" />
                <div className="h-6 w-20 rounded-full bg-white/10" />
                <div className="h-6 w-14 rounded-full bg-white/10" />
              </div>
            )}

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-gray-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {loading && !overview ? (
              <div className="flex flex-col gap-2 animate-pulse">
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-3 w-2/3 rounded bg-white/5" />
              </div>
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed">{overview || "Popis nie je k dispozícii."}</p>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          {showEpisodePicker && (
            <>
              <h4 className="text-xs font-bold tracking-widest text-gray-500">VYBER SÉRIU A EPIZÓDU</h4>
              {seasons.length > 0 ? (
                <SeasonEpisodePicker
                  tvId={item.id}
                  seasons={seasons}
                  language={language}
                  onSelectEpisode={(season, episode) => setEpisodeSelection({ season, episode })}
                />
              ) : (
                !loading && <p className="text-xs text-gray-500">Pre tento seriál sa nenašli žiadne série.</p>
              )}
            </>
          )}

          {showResults && (
            <>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold tracking-widest text-gray-500">DOSTUPNÉ ZDROJE NA WEBSHARE</h4>
                {isTv && !playerUrl && (
                  <button
                    onClick={() => setEpisodeSelection(null)}
                    className="text-xs font-semibold text-gray-400 hover:text-white shrink-0 transition-colors"
                  >
                    ← Zmeniť epizódu
                  </button>
                )}
              </div>

              {playerUrl ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400 truncate">{playerFile?.name}</p>
                    <button
                      onClick={resetPlayerState}
                      className="text-xs font-semibold text-gray-400 hover:text-white shrink-0 transition-colors"
                    >
                      ← Späť na zoznam súborov
                    </button>
                  </div>

                  <div
                    ref={playerContainerRef}
                    className="relative w-full aspect-video rounded-xl overflow-hidden bg-black ring-1 ring-white/10"
                  >
                    <video
                      ref={videoRef}
                      key={playerUrl}
                      src={playerUrl}
                      autoPlay
                      onPlaying={handleVideoPlaying}
                      onError={handleVideoError}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={handleVideoEnded}
                      onTimeUpdate={handleTimeUpdate}
                      onVolumeChange={() => setIsMuted(videoRef.current?.muted ?? false)}
                      onClick={togglePlayPause}
                      className="w-full h-full"
                    >
                      Tvoj prehliadač nepodporuje prehrávanie tohto videa.
                    </video>

                    {isSeeking && !videoError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      </div>
                    )}

                    {videoError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
                        <p className="text-sm text-red-300">{videoError}</p>
                        <button
                          type="button"
                          onClick={retryPlayback}
                          className="text-xs font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-4 py-1.5 rounded-full transition"
                        >
                          Skúsiť znova
                        </button>
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-2.5">
                      <div
                        ref={sliderRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Pozícia prehrávania"
                        aria-valuemin={0}
                        aria-valuemax={duration || 0}
                        aria-valuenow={Math.round(displayPosition)}
                        onPointerDown={handleSliderPointerDown}
                        onPointerMove={handleSliderPointerMove}
                        onPointerUp={handleSliderPointerUp}
                        onKeyDown={handleSliderKeyDown}
                        className="relative h-3 flex items-center cursor-pointer touch-none focus:outline-none"
                      >
                        <div className="w-full h-1.5 rounded-full bg-white/20">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                            style={{
                              width: duration ? `${Math.min(100, (displayPosition / duration) * 100)}%` : "0%",
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={togglePlayPause}
                          aria-label={isPlaying ? "Pauza" : "Prehrať"}
                          className="text-white hover:text-fuchsia-400 transition-colors"
                        >
                          {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
                        </button>
                        <span className="text-xs text-gray-300 tabular-nums">
                          {formatTime(displayPosition)} / {formatTime(duration)}
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={toggleMute}
                          aria-label={isMuted ? "Zapnúť zvuk" : "Stlmiť zvuk"}
                          className="text-white hover:text-fuchsia-400 transition-colors"
                        >
                          {isMuted ? <MuteIcon className="w-5 h-5" /> : <VolumeIcon className="w-5 h-5" />}
                        </button>
                        <button
                          type="button"
                          onClick={toggleFullscreen}
                          aria-label="Celá obrazovka"
                          className="text-white hover:text-fuchsia-400 transition-colors"
                        >
                          <FullscreenIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {wsLoading && <FileTableSkeleton />}

                  {!wsLoading && wsError && (
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                      <p className="text-xs text-red-300 flex-1">Nepodarilo sa spojiť s Webshare. {wsError}</p>
                      <button
                        onClick={() => runWebshareSearch()}
                        className="text-xs font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-3 py-1.5 rounded-full transition shrink-0"
                      >
                        Skúsiť znova
                      </button>
                    </div>
                  )}

                  {wsLooselyMatched && wsFiles.length > 0 && (
                    <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      Presná zhoda {isTv ? "epizódy" : "roku"} sa nenašla — zobrazené sú voľnejšie priradené výsledky,
                      over si prosím rok/verziu v názve súboru.
                    </p>
                  )}

                  {!wsLoading && !wsError && wsNoResults && (
                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-300 flex-1">
                        Pre {isTv ? "túto epizódu" : "tento film"} sa nepodarilo nájsť žiadny stream na Webshare.
                      </p>
                      <button
                        onClick={() => runWebshareSearch()}
                        className="text-xs font-semibold text-gray-300 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full transition shrink-0"
                      >
                        Skúsiť znova
                      </button>
                    </div>
                  )}

                  {wsFiles.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white/5 text-left text-[11px] text-gray-400 uppercase tracking-wide">
                            <th className="px-4 py-2.5 font-semibold">Názov súboru</th>
                            <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Veľkosť</th>
                            <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kvalita/Formát</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Akcia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {wsFiles.map((file) => (
                            <tr
                              key={file.ident}
                              className={`hover:bg-white/5 transition-colors ${file.isCam ? "opacity-60" : ""}`}
                            >
                              <td className="px-4 py-2.5 max-w-[280px] truncate text-gray-200" title={file.name}>
                                {file.isCam && (
                                  <span
                                    title={file.qualityWarning}
                                    className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-red-500/20 text-red-400 border border-red-500/30 align-middle"
                                  >
                                    CAM
                                  </span>
                                )}
                                {file.name}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{file.sizeFormatted}</td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">
                                {formatQuality(file)}
                                {file.audioTags?.length > 0 ? ` · ${file.audioTags.join(", ")}` : ""}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => playFile(file)}
                                  disabled={linkLoadingIdent === file.ident}
                                  className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide bg-gradient-to-r from-violet-500 to-pink-500 hover:brightness-110 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-full transition"
                                >
                                  <PlayIcon className="w-3 h-3 text-white ml-0" />
                                  {linkLoadingIdent === file.ident ? "Načítavam..." : "Prehrať"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {linkError && <p className="text-xs text-red-400">{linkError}</p>}

                  {pendingFile && !loggedIn && (
                    <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                      <p className="text-xs text-amber-300 flex-1">
                        Na prehratie sa treba prihlásiť k Webshare účtu — prihlás sa hore vpravo a skúsi sa to
                        automaticky spustiť.
                      </p>
                      <button
                        onClick={() => setPendingFile(null)}
                        className="text-xs font-semibold text-gray-300 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full transition shrink-0"
                      >
                        Zrušiť
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
