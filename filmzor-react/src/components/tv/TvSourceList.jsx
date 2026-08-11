import { PlayIcon } from "../Icons";
import { formatQuality } from "../../utils/quality";

// Nahrádza malú tabuľku z MovieModal veľkými riadkami, kde je fokusovateľný
// celý riadok (nielen malé tlačidlo "Prehrať" v poslednom stĺpci) — na
// diaľkové ovládanie oveľa spoľahlivejší cieľ ako bunka v tabuľke.
export default function TvSourceList({ files, linkLoadingIdent, onPlay }) {
  return (
    <div className="flex flex-col gap-3">
      {files.map((file) => (
        <button
          key={file.ident}
          onClick={() => onPlay(file)}
          disabled={linkLoadingIdent === file.ident}
          className={`flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-6 py-4 text-left transition-colors disabled:opacity-50 ${
            file.isCam ? "opacity-60" : ""
          }`}
        >
          <span className="w-11 h-11 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 flex items-center justify-center shrink-0">
            <PlayIcon className="w-5 h-5 text-white ml-0.5" />
          </span>
          <span className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex items-center gap-2 truncate">
              {file.isCam && (
                <span
                  title={file.qualityWarning}
                  className="shrink-0 px-1.5 py-0.5 rounded text-[0.6rem] font-bold tracking-wide bg-red-500/20 text-red-400 border border-red-500/30"
                >
                  CAM
                </span>
              )}
              <span className="truncate text-gray-100 font-medium">{file.name}</span>
            </span>
            <span className="text-sm text-gray-400">
              {file.sizeFormatted} · {formatQuality(file)}
              {file.audioTags?.length > 0 ? ` · ${file.audioTags.join(", ")}` : ""}
            </span>
          </span>
          {linkLoadingIdent === file.ident && (
            <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}
