"use client";

import { useRef } from "react";

type Opt = { label: string; value: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: (string | Opt)[];
  ariaLabel?: string;
  name?: string; // optional: if provided, we’ll mirror the value in a hidden input
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

  const activeIdx = Math.max(
    0,
    opts.findIndex((o) => o.value === value)
  );

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;

    e.preventDefault();

    let next = activeIdx;
    if (e.key === "ArrowRight") next = (activeIdx + 1) % opts.length;
    if (e.key === "ArrowLeft") next = (activeIdx - 1 + opts.length) % opts.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = opts.length - 1;

    const nextVal = opts[next]?.value;
    if (nextVal) {
      onChange(nextVal);
      buttonsRef.current[next]?.focus();
    }
  };

  return (
    <div className="inline-flex rounded-2xl border border-gray-300 overflow-hidden" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {opts.map((opt, idx) => {
        const active = value === opt.value;
        const base =
          "px-4 py-2 text-sm font-medium text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";
        const colors = active
          ? "bg-brand-600 text-white"
          : "bg-white text-gray-700 hover:bg-gray-50";

        return (
          <button
            key={opt.value}
            ref={(el) => (buttonsRef.current[idx] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`${base} ${colors}`}
          >
            {opt.label}
          </button>
        );
      })}

      {/* Optional hidden input for RHF forms that want a named field */}
      {name ? <input type="hidden" name={name} value={value} readOnly /> : null}
    </div>
  );
}