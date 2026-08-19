export default function PillGroup({ label, options, active, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-xs font-bold text-gray-500 tracking-widest mr-1">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active === option}
            className={`pill px-3.5 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:border-fuchsia-400/50 ${
              active === option ? "active" : ""
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
