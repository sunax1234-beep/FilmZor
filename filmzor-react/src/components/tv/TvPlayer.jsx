import { useEffect, useRef, useState } from "react";
import {
  BackArrowIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  MuteIcon,
  Rewind10Icon,
  Forward10Icon,
} from "../Icons";

const AUTO_HIDE_MS = 4000;

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

// Full-viewport TV prehrávač — na rozdiel od malého "aspect-video" okna v
// MovieModal tu video zaberá celú obrazovku hneď (WebView aj tak zaberá celý
// TV displej, netreba teda ani manuálny fullscreen toggle). Ovládacie prvky
// sú väčšie a po chvíli nečinnosti sa schovajú, akékoľvek stlačenie ich
// znova ukáže — presne ako u Netflixu/YouTube na TV.
export default function TvPlayer({ player, videoRef, title, onExit }) {
  const {
    playerUrl,
    playerFile,
    duration,
    displayPosition,
    isPlaying,
    isSeeking,
    isMuted,
    videoError,
    commitSeek,
    retryPlayback,
    handleVideoPlaying,
    handleVideoError,
    handleVideoEnded,
    handleTimeUpdate,
    togglePlayPause,
    toggleMute,
    setIsPlaying,
    setIsMuted,
  } = player;

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);
  const sliderRef = useRef(null);
  const playPauseRef = useRef(null);

  // Bez tohto by prvé stlačenie šípky na diaľkovom ovládači presunulo fokus
  // na prvý fokusovateľný prvok v celom dokumente (bočný panel), nie na
  // niečo v prehrávači — useSpatialNavigation totiž vychádza z
  // `document.activeElement`, ktorý je pri mountnutí spravidla <body>.
  useEffect(() => {
    playPauseRef.current?.focus({ preventScroll: true });
  }, []);

  function revealControls() {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
  }

  useEffect(() => {
    revealControls();
    return () => clearTimeout(hideTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerUrl]);

  // Diaľkové ovládanie: MediaPlayPause/MediaRewind/MediaFastForward posiela
  // časť Android TV diaľkových ovládačov ako vyhradené klávesy prehliadača.
  function handleKeyDown(e) {
    revealControls();
    if (e.key === "MediaPlayPause") togglePlayPause();
    else if (e.key === "MediaRewind") commitSeek(displayPosition - 10);
    else if (e.key === "MediaFastForward") commitSeek(displayPosition + 10);
  }

  function handleSliderKeyDown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    commitSeek(displayPosition + (e.key === "ArrowRight" ? 10 : -10));
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black"
      onKeyDownCapture={handleKeyDown}
      onPointerMove={revealControls}
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
        className="w-full h-full object-contain"
      >
        Tvoj prehliadač nepodporuje prehrávanie tohto videa.
      </video>

      {isSeeking && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-14 h-14 rounded-full border-4 border-white/30 border-t-white animate-spin" />
        </div>
      )}

      {videoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center">
          <p className="text-lg text-red-300">{videoError}</p>
          <button
            type="button"
            onClick={retryPlayback}
            className="text-sm font-bold text-white bg-red-500/30 hover:bg-red-500/40 px-6 py-2.5 rounded-full transition"
          >
            Skúsiť znova
          </button>
        </div>
      )}

      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-4 px-10 pt-8 pb-16 bg-gradient-to-b from-black/85 to-transparent transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={onExit}
          aria-label="Späť"
          className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
        >
          <BackArrowIcon className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <p className="text-xl font-bold text-white truncate">{title}</p>
          {playerFile?.name && <p className="text-sm text-gray-400 truncate">{playerFile.name}</p>}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 px-10 pt-16 pb-8 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Pozícia prehrávania"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={Math.round(displayPosition)}
          onKeyDown={handleSliderKeyDown}
          className="relative h-4 flex items-center focus:outline-none"
        >
          <div className="w-full h-2 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
              style={{ width: duration ? `${Math.min(100, (displayPosition / duration) * 100)}%` : "0%" }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={() => commitSeek(displayPosition - 10)}
            aria-label="O 10 sekúnd späť"
            className="text-white hover:text-fuchsia-400 transition-colors"
          >
            <Rewind10Icon className="w-8 h-8" />
          </button>
          <button
            ref={playPauseRef}
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? "Pauza" : "Prehrať"}
            className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 ml-1" />}
          </button>
          <button
            type="button"
            onClick={() => commitSeek(displayPosition + 10)}
            aria-label="O 10 sekúnd dopredu"
            className="text-white hover:text-fuchsia-400 transition-colors"
          >
            <Forward10Icon className="w-8 h-8" />
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Zapnúť zvuk" : "Stlmiť zvuk"}
            className="text-white hover:text-fuchsia-400 transition-colors ml-4"
          >
            {isMuted ? <MuteIcon className="w-7 h-7" /> : <VolumeIcon className="w-7 h-7" />}
          </button>
        </div>

        <p className="text-center text-sm text-gray-300 tabular-nums">
          {formatTime(displayPosition)} / {formatTime(duration)}
        </p>
      </div>
    </div>
  );
}
