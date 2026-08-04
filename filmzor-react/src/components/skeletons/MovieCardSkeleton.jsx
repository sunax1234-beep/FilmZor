export default function MovieCardSkeleton({ sizeClassName = "w-full" }) {
  return (
    <div className={`animate-pulse ${sizeClassName}`}>
      <div className="rounded-2xl aspect-[2/3] bg-white/10 ring-1 ring-white/5" />
      <div className="mt-2.5 px-0.5 flex flex-col gap-1.5">
        <div className="h-3.5 w-4/5 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/5" />
      </div>
    </div>
  );
}
