import { useCallback, useEffect, useRef, useState } from "react";
import { getDetails, posterUrl } from "../services/tmdb";
import { searchWebshare, getWebshareStreamMeta, getWebshareStreamUrl } from "../services/webshare";
import { useWebshareAuth } from "../context/WebshareAuthContext";
import { formatQuality } from "../utils/quality";
import {
  getWatchProgress,
  getEpisodeProgressForShow,
  isInProgress,
  saveWatchProgress,
} from "../utils/watchProgress";
import { CloseIcon, PlayIcon, PauseIcon, VolumeIcon, MuteIcon, FullscreenIcon } from "./Icons";
import SeasonEpisodePicker from "./SeasonEpisodePicker";
import FileTableSkeleton from "./skeletons/FileTableSkeleton";

const FALLBACK_LANGUAGE = { "sk-SK": "cs-CZ", "cs-CZ": "en-US" };

// Seek na blízko konca súboru necháme rezervu (zhoduje sa s END_SAFETY_MARGIN_SECONDS
// na backende) — presne na koniec by ffmpeg skončil bez jediného snímku.
const SEEK_END_MARGIN_SECONDS = 3;
const SEEK_NUDGE_SECONDS = 10;

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
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { loggedIn, refresh: refreshAuth } = useWebshareAuth();

  // Séria/epizóda (len pre seriály) — kým nie je vybraná, zobrazuje sa picker namiesto výsledkov.
  const [episodeSelection, setEpisodeSelection] = useState(null);

  const [wsFiles, setWsFiles] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [wsLooselyMatched, setWsLooselyMatched] = useState(false);
  const [wsNoResults, setWsNoResults] = useState(false);

  const [linkLoadingIdent, setLinkLoadingIdent] = useState(null);
  const [linkError, setLinkError] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [playerUrl, setPlayerUrl] = useState(null);
  const [playerFile, setPlayerFile] = useState(null);

  // Vlastný prehrávač (nie natívne <video controls>) — živý remux stream nemá
  // known duration/seek index (viď mediaProxy.js), takže natívne ovládanie by
  // nevedelo zobraziť pozíciu ani umožniť pretáčanie. `duration` zisťujeme
  // raz cez getWebshareStreamMeta, `baseOffsetRef` je `t`, s ktorým bol
  // načítaný aktuálny <video src> — efektívna pozícia je súčet toho a
  // video.currentTime (ktorý sa pri každom seeku/reloade vynuluje).
  const [duration, setDuration] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreviewSeconds, setDragPreviewSeconds] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const baseOffsetRef = useRef(0);
  const seekTimeoutRef = useRef(null);
  const seekCommitTimerRef = useRef(null);
  const pendingResumeRef = useRef(0);

  const isTv = item?.mediaType === "tv";

  // TMDB detail (originálny/lokalizovaný názov, popis, žánre, pri seriáli aj zoznam sérií)
  const loadDetails = useCallback(
    async (signal) => {
      if (!item) return;
      setLoading(true);
      setError(null);
      setDetails(null);

      try {
        let data = await getDetails(item.mediaType, item.id, language);

        // TMDB často nemá SK/CZ preklad popisu — doplníme ho fallback jazykom.
        if (!data.overview) {
          const fallbackLang = FALLBACK_LANGUAGE[language] || "en-US";
          const fallbackData = await getDetails(item.mediaType, item.id, fallbackLang).catch(() => null);
          if (fallbackData?.overview) {
            data = { ...data, overview: fallbackData.overview };
          }
        }

        if (!signal?.cancelled) setDetails(data);
      } catch (e) {
        if (!signal?.cancelled) setError(e.message);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [item, language]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    loadDetails(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadDetails]);

  // Pri otvorení seriálu skontroluj, či už nemá rozpozeranú nejakú epizódu —
  // ak áno, rovno na ňu naskoč (rovnaké správanie ako Continue Watching u filmov).
  useEffect(() => {
    if (!item) return;
    if (!isTv) {
      setEpisodeSelection(null);
      return;
    }
    const inProgress = getEpisodeProgressForShow(item.id).filter(isInProgress);
    if (inProgress.length > 0) {
      const latest = inProgress.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setEpisodeSelection({
        season: latest.season,
        episode: { episode_number: latest.episode, name: latest.episodeName || "" },
      });
    } else {
      setEpisodeSelection(null);
    }
  }, [item, isTv]);

  // Zresetuje celý stav vlastného prehrávača (naspäť na zoznam súborov, zmena
  // epizódy, nové vyhľadávanie) — bez toho by `duration`/`playbackPosition`
  // z predošlého súboru presiakli do ďalšieho prehrávania.
  function resetPlayerState() {
    setPlayerUrl(null);
    setPlayerFile(null);
    setDuration(0);
    setPlaybackPosition(0);
    baseOffsetRef.current = 0;
    setIsSeeking(false);
    setIsPlaying(true);
    setIsDragging(false);
    setDragPreviewSeconds(null);
    clearTimeout(seekTimeoutRef.current);
    clearTimeout(seekCommitTimerRef.current);
  }

  // Automatické vyhľadanie na Webshare — pri filme hneď, pri seriáli až po výbere epizódy.
  const runWebshareSearch = useCallback(
    async (signal) => {
      if (!item) return;

      setWsFiles([]);
      setWsError(null);
      setWsLooselyMatched(false);
      setWsNoResults(false);
      setLinkError(null);
      setPendingFile(null);
      resetPlayerState();
      setWsLoading(true);

      // Český TMDB názov (cs-CZ) — Webshare je prevažne česká komunita a filmy
      // s odlišným oficiálnym CZ marketingovým názvom (napr. "Zootopia" ->
      // "Město zvířat") sa bez neho na Webshare vôbec nenájdu. Ak appka už
      // zobrazuje cs-CZ, netreba dopytovať znova.
      let alternateTitle = null;
      if (language !== "cs-CZ") {
        try {
          const czData = await getDetails(item.mediaType, item.id, "cs-CZ");
          alternateTitle = (isTv ? czData.name : czData.title) || null;
        } catch {
          alternateTitle = null;
        }
      }
      if (signal?.cancelled) return;

      const params = isTv
        ? {
            title: item.title,
            originalTitle: item.originalTitle,
            alternateTitle,
            season: episodeSelection.season,
            episode: episodeSelection.episode.episode_number,
          }
        : { title: item.title, originalTitle: item.originalTitle, alternateTitle, year: item.year };

      try {
        const data = await searchWebshare(params);
        if (signal?.cancelled) return;
        setWsFiles(data.files || []);
        setWsLooselyMatched(Boolean(data.isLooselyMatched));
        setWsNoResults(Boolean(data.noResults));
      } catch (e) {
        if (!signal?.cancelled) setWsError(e.message);
      } finally {
        if (!signal?.cancelled) setWsLoading(false);
      }
    },
    [item, isTv, episodeSelection]
  );

  useEffect(() => {
    if (!item) return;
    if (isTv && !episodeSelection) {
      setWsFiles([]);
      setWsError(null);
      setWsLooselyMatched(false);
      setWsNoResults(false);
      resetPlayerState();
      return;
    }

    const signal = { cancelled: false };
    runWebshareSearch(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [item, isTv, episodeSelection, runWebshareSearch]);

  // Ak pre tento titul (resp. túto epizódu) existuje uložený rozpozeraný progres,
  // otvor prehrávač rovno na uloženom súbore a čase namiesto zoznamu súborov.
  useEffect(() => {
    if (!item) return;
    if (isTv && !episodeSelection) return;

    const saved = isTv
      ? getWatchProgress(item.mediaType, item.id, episodeSelection.season, episodeSelection.episode.episode_number)
      : getWatchProgress(item.mediaType, item.id);

    if (saved?.webshareIdent && isInProgress(saved)) {
      playFile({ ident: saved.webshareIdent, name: saved.webshareName || item.title }, saved.currentTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isTv, episodeSelection]);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  // Priebežné ukladanie rozpozerania (každých 5s + pri pauze/skončení/zatvorení) do localStorage.
  // Používa app-sledovanú `duration`/pozíciu, nie video.duration/currentTime —
  // video.duration je pre živý remux stream Infinity/NaN, takže predtým sa
  // sem (potichu) nikdy nič neuložilo.
  useEffect(() => {
    if (!playerUrl || !playerFile || !item || !duration) return;

    function persist() {
      const video = videoRef.current;
      const currentTime = baseOffsetRef.current + (video?.currentTime || 0);
      saveWatchProgress({
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        originalTitle: item.originalTitle || item.title,
        year: item.year,
        posterPath: item.posterPath,
        season: isTv ? episodeSelection?.season : undefined,
        episode: isTv ? episodeSelection?.episode?.episode_number : undefined,
        episodeName: isTv ? episodeSelection?.episode?.name : undefined,
        currentTime,
        duration,
        webshareIdent: playerFile.ident,
        webshareName: playerFile.name,
      });
    }

    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) persist();
    }, 5000);

    const video = videoRef.current;
    video?.addEventListener("pause", persist);
    video?.addEventListener("ended", persist);

    return () => {
      clearInterval(interval);
      video?.removeEventListener("pause", persist);
      video?.removeEventListener("ended", persist);
      persist();
    };
  }, [playerUrl, playerFile, item, isTv, episodeSelection, duration]);

  // Spoločný vstupný bod pre "pokračovať v pozeraní" aj pre pretočenie počas
  // prehrávania — oboje je len nové <video src> s presným ?t=, ffmpeg naň
  // reštartuje presne na danej sekunde (viď mediaProxy.js).
  function loadPlayerAt(file, startSeconds) {
    const clampedStart = Math.max(0, startSeconds || 0);
    baseOffsetRef.current = clampedStart;
    setPlaybackPosition(clampedStart);
    setIsSeeking(true);
    clearTimeout(seekTimeoutRef.current);
    // Poistka pre prípad, že ffmpeg potichu zlyhá a "playing" event nikdy nepríde.
    seekTimeoutRef.current = setTimeout(() => setIsSeeking(false), 12000);
    setPlayerUrl(getWebshareStreamUrl(file.ident, clampedStart));
    setPlayerFile(file);
  }

  function commitSeek(targetSeconds) {
    if (!playerFile || !duration) return;
    const clamped = Math.max(0, Math.min(targetSeconds, Math.max(0, duration - SEEK_END_MARGIN_SECONDS)));
    loadPlayerAt(playerFile, clamped);
  }

  async function playFile(file, resumeTime = 0) {
    setLinkError(null);
    setLinkLoadingIdent(file.ident);
    try {
      // getWebshareStreamMeta tu slúži ako kontrola prihlásenia (vyhodí 401,
      // ak treba login) a zároveň zistí trvanie pre vlastnú seek lištu —
      // samotné prehrávanie ide cez náš remux proxy, aby fungovalo aj pre
      // .mkv/AC3 súbory, ktoré prehliadač priamo nevie.
      const meta = await getWebshareStreamMeta(file.ident);
      setDuration(meta.duration || 0);
      loadPlayerAt(file, resumeTime);
      setPendingFile(null);
    } catch (e) {
      if (e.status === 401) {
        // Lokálny "loggedIn" stav môže byť zastaraný (napr. session medzičasom
        // vypršala) — bez tohto refreshu by sa prihlasovací formulár nižšie
        // nemusel zobraziť, lebo podmienka je `pendingFile && !loggedIn`.
        await refreshAuth();
        setPendingFile(file);
        pendingResumeRef.current = resumeTime || 0;
      } else {
        setLinkError(e.message);
      }
    } finally {
      setLinkLoadingIdent(null);
    }
  }

  // Prihlásenie je len jedno globálne (vpravo hore v Header) — žiadny vlastný
  // login formulár tu v modáli. Keď sa `loggedIn` zmení na true (užívateľ sa
  // medzitým prihlásil hore), automaticky doskúsime prehratie súboru, na
  // ktorý predtým kliklo (bez toho by musel znova klikať na "Prehrať").
  useEffect(() => {
    if (loggedIn && pendingFile) {
      const file = pendingFile;
      playFile(file, pendingResumeRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  function handleVideoPlaying() {
    setIsSeeking(false);
    clearTimeout(seekTimeoutRef.current);
  }

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  function toggleFullscreen() {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }

  // Prevedie X-ovú súradnicu kliknutia/ťahania na seek lište na sekundy.
  function seekSecondsFromClientX(clientX) {
    const el = sliderRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function handleSliderPointerDown(e) {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragPreviewSeconds(seekSecondsFromClientX(e.clientX));
  }

  function handleSliderPointerMove(e) {
    if (!isDragging) return;
    setDragPreviewSeconds(seekSecondsFromClientX(e.clientX));
  }

  function handleSliderPointerUp(e) {
    if (!isDragging) return;
    const target = seekSecondsFromClientX(e.clientX);
    setIsDragging(false);
    setDragPreviewSeconds(null);
    commitSeek(target);
  }

  // Šípky vľavo/vpravo posúvajú pozíciu o SEEK_NUDGE_SECONDS; stopPropagation
  // je nutný, lebo useSpatialNavigation má globálny window keydown listener,
  // ktorý by inak tie isté šípky zachytil a presunul fokus na susedný prvok
  // namiesto pretočenia. Hore/dole necháme bublať ďalej (normálna D-pad
  // navigácia mimo lišty). Držanie tlačidla (opakované keydown) sa batchuje
  // do jedného seeku cez debounce timer, nech nespúšťa ffmpeg reštart pri
  // každom stlačení.
  function handleSliderKeyDown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.key === "ArrowRight" ? SEEK_NUDGE_SECONDS : -SEEK_NUDGE_SECONDS;
    const base = dragPreviewSeconds ?? playbackPosition;
    const next = Math.max(0, Math.min(base + delta, duration));
    setDragPreviewSeconds(next);
    setIsDragging(true);
    clearTimeout(seekCommitTimerRef.current);
    seekCommitTimerRef.current = setTimeout(() => {
      commitSeek(next);
      setIsDragging(false);
      setDragPreviewSeconds(null);
    }, 450);
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
  const displayPosition = isDragging && dragPreviewSeconds != null ? dragPreviewSeconds : playbackPosition;

  return (
    <div
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
                      onError={handleVideoPlaying}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onTimeUpdate={() =>
                        setPlaybackPosition(baseOffsetRef.current + (videoRef.current?.currentTime || 0))
                      }
                      onVolumeChange={() => setIsMuted(videoRef.current?.muted ?? false)}
                      onClick={togglePlayPause}
                      className="w-full h-full"
                    >
                      Tvoj prehliadač nepodporuje prehrávanie tohto videa.
                    </video>

                    {isSeeking && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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
