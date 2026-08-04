export default function EpisodeListSkeleton({ rows = 6 }) {
  return (
    <div className="flex flex-col divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center justify-between gap-3 px-4 py-3">
          <div className="h-3.5 rounded bg-white/10" style={{ width: `${50 + ((i * 11) % 35)}%` }} />
          <div className="h-3.5 w-3.5 rounded bg-white/5 shrink-0" />
        </div>
      ))}
    </div>
  );
}
