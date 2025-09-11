"use client";

type Opt = { label: string; value: string };

export default function SegmentedToggle({
  value,
  onChange,
  options,
  ariaLabel,
  name, // se mantiene por compatibilidad con RHF
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | Opt)[];
  ariaLabel?: string;
  name?: string;
}) {
  const opts: Opt[] = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid grid-cols-2 w-full max-w-sm rounded-2xl border border-gray-300 overflow-hidden"
    >
      {opts.map((opt, i) => {
        const active = value === opt.value;
        const base =
          "px-4 py-2 text-sm font-medium text-center transition-colors focus:outline-none";
        const colors = active
          ? "bg-brand-600 text-white"
          : "bg-white text-gray-700 hover:bg-gray-50";

        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`${base} ${colors}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}