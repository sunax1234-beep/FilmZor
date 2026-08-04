export default function FileTableSkeleton({ rows = 5 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
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
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-4 py-3">
                <div className="h-3.5 rounded bg-white/10" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
              </td>
              <td className="px-4 py-3">
                <div className="h-3.5 w-12 rounded bg-white/10" />
              </td>
              <td className="px-4 py-3">
                <div className="h-3.5 w-24 rounded bg-white/10" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="h-6 w-16 rounded-full bg-white/10 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
