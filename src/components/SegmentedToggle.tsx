"use client";

import { useRef } from "react";

type Opt = { label: string; value: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: (string | Opt)[];
  ariaLabel?: string;
  name?: string; // kept for RHF compatibility
};

export default function SegmentedToggle({
  value,
  onChange,
  options,
  ariaLabel,
  name,
}: Props) {
  const opts: Opt[] = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );

  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  // Check if this is a "Sí | No" toggle
  const isYesNoToggle = opts.length === 2 && 
    opts.some(opt => opt.label === "Sí" || opt.label === "Yes") &&
    opts.some(opt => opt.label === "No");

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = opts.findIndex((o) => o.value === value);
    if (idx < 0) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % opts.length;
      onChange(opts[next].value);
      buttonsRef.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (idx - 1 + opts.length) % opts.length;
      onChange(opts[prev].value);
      buttonsRef.current[prev]?.focus();
    }
  };

  // Determine grid columns based on number of options
  const gridCols = opts.length === 2 ? 'grid-cols-2' : opts.length === 3 ? 'grid-cols-3' : `grid-cols-${opts.length}`;
  
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={name}
      className={`grid ${gridCols} ${isYesNoToggle ? 'w-[200px]' : 'w-auto min-w-[320px]'} rounded-2xl border border-gray-300 overflow-hidden`}
      onKeyDown={onKeyDown}
    >
      {opts.map((opt, idx) => {
        const active = value === opt.value;
        const base =
          "px-4 py-2 text-sm font-medium text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 whitespace-nowrap";
        const colors = active
          ? "bg-brand-600 text-white"
          : "bg-white text-gray-700 hover:bg-gray-50";
        // Add border-right separator except for the last button
        const separator = idx < opts.length - 1 ? "border-r border-gray-300" : "";

        return (
          <button
            key={opt.value}
            ref={(el) => {
              // IMPORTANT: do not return a value from a ref callback
              buttonsRef.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            className={`${base} ${colors} ${separator}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}