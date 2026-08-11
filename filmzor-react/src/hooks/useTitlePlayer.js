import { useCallback, useEffect, useRef, useState } from "react";
import { getDetails } from "../services/tmdb";
import { searchWebshare, getWebshareStreamMeta, getWebshareStreamUrl } from "../services/webshare";
import { useWebshareAuth } from "../context/WebshareAuthContext";
import { getWatchProgress, getEpisodeProgressForShow, isInProgress, saveWatchProgress } from "../utils/watchProgress";

const FALLBACK_LANGUAGE = { "sk-SK": "cs-CZ", "cs-CZ": "en-US" };

// Seek na blízko konca súboru necháme rezervu (zhoduje sa s END_SAFETY_MARGIN_SECONDS
// na backende) — presne na koniec by ffmpeg skončil bez jediného snímku.
const SEEK_END_MARGIN_SECONDS = 3;

const MEDIA_ERROR_MESSAGES = {
  1: "Prehrávanie bolo prerušené.",
  2: "Sieťová chyba pri sťahovaní videa.",
  3: "Zariadenie nedokázalo dekódovať tento súbor (nepodporovaný kodek).",
  4: "Tento formát videa zariadenie nepodporuje.",
};

// Detail titulu + Webshare vyhľadávanie + vlastný prehrávač (webshare zdroje,
// playFile/seek/progres/chyby) — zdieľané medzi modálom na telefóne/desktope
// (MovieModal) a full-screen TV detailom/prehrávačom (TvDetailView/TvPlayer),
// nech sa táto neraz komplikovaná stavová logika nepíše dvakrát.
//
// `videoRef` si drží (a vlastní <video> element) komponent, ktorý hook volá —
// hook len číta/nastavuje jeho vlastnosti cez ref, ktorý mu treba odovzdať.
export function useTitlePlayer(item, language, videoRef) {
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
  const [videoError, setVideoError] = useState(null);

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
    setVideoError(null);
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
  }, [playerUrl, playerFile, item, isTv, episodeSelection, duration, videoRef]);

  // Spoločný vstupný bod pre "pokračovať v pozeraní" aj pre pretočenie počas
  // prehrávania — oboje je len nové <video src> s presným ?t=, ffmpeg naň
  // reštartuje presne na danej sekunde (viď mediaProxy.js).
  function loadPlayerAt(file, startSeconds) {
    const clampedStart = Math.max(0, startSeconds || 0);
    baseOffsetRef.current = clampedStart;
    setPlaybackPosition(clampedStart);
    setIsSeeking(true);
    setVideoError(null);
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

  // `baseOffsetRef` (aktuálny `?t=` s ktorým bol <video src> načítaný) je
  // interné účtovníctvo hooku — komponent volá len toto, nech mu ho netreba
  // odovzdávať von.
  function handleTimeUpdate() {
    setPlaybackPosition(baseOffsetRef.current + (videoRef.current?.currentTime || 0));
  }

  // Predtým sa chyba prehrávania len potichu prehltla (spinner zmizol a nič sa
  // nestalo) — na TV to vyzeralo, akoby sa video vôbec nedalo zapnúť, bez
  // jedinej stopy prečo. `console.error` je tu zámerne, nech je vidno detail
  // aj cez chrome://inspect vzdialené ladenie.
  function handleVideoError() {
    setIsSeeking(false);
    clearTimeout(seekTimeoutRef.current);
    const mediaError = videoRef.current?.error;
    const message = (mediaError && MEDIA_ERROR_MESSAGES[mediaError.code]) || "Video sa nepodarilo prehrať.";
    console.error("[useTitlePlayer] chyba prehrávania videa:", mediaError?.code, mediaError?.message);
    setVideoError(message);
  }

  function retryPlayback() {
    if (!playerFile) return;
    loadPlayerAt(playerFile, baseOffsetRef.current + (videoRef.current?.currentTime || 0));
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

  // Prevedie X-ovú súradnicu kliknutia/ťahania na seek lište na sekundy.
  function seekSecondsFromClientX(clientX, sliderEl) {
    if (!sliderEl || !duration) return 0;
    const rect = sliderEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function nudgePosition(deltaSeconds) {
    const base = dragPreviewSeconds ?? playbackPosition;
    const next = Math.max(0, Math.min(base + deltaSeconds, duration));
    setDragPreviewSeconds(next);
    setIsDragging(true);
    clearTimeout(seekCommitTimerRef.current);
    seekCommitTimerRef.current = setTimeout(() => {
      commitSeek(next);
      setIsDragging(false);
      setDragPreviewSeconds(null);
    }, 450);
  }

  const displayPosition = isDragging && dragPreviewSeconds != null ? dragPreviewSeconds : playbackPosition;

  return {
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
    playbackPosition,
    displayPosition,
    isPlaying,
    isSeeking,
    isDragging,
    setIsDragging,
    dragPreviewSeconds,
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
    handleTimeUpdate,
    togglePlayPause,
    toggleMute,
    seekSecondsFromClientX,
    nudgePosition,
    setIsPlaying,
    setPlaybackPosition,
    setIsMuted,
  };
}
