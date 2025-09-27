// src/components/SSNEINInput.tsx
"use client";

import { useMemo, useState } from "react";

type Props = {
  /** Raw digits only (we’ll strip non-digits), max 9 */
  value?: string;
  onChange: (rawDigits: string) => void;
  /** Label above the input */
  label?: string; // default: "SSN / EIN"
  required?: boolean;
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "").slice(0, 9);
}

// Full SSN-style formatting when visible: ###-##-####
function formatSSNStyle(d: string) {
  const n = onlyDigits(d);
  if (!n) return "";
  if (n.length <= 3) return n;
  if (n.length <= 5) return `${n.slice(0, 3)}-${n.slice(3)}`;
  return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
}

/**
 * Progressive masking:
 * - As the user types, mask only the digits they have entered from positions 1..5.
 * - Format with SSN hyphens as we go.
 */
function progressiveMask(d: string) {
  const n = onlyDigits(d);
  const len = n.length;
  if (len === 0) return "";

  if (len <= 3) return "*".repeat(len);
  if (len <= 5) return `***-${"*".repeat(len - 3)}`;

  const visibleTail = n.slice(5); // digits 6..end
  return `***-**-${visibleTail}`;
}

export default function SSNEINInput({
  value = "",
  onChange,
  label = "SSN / EIN",
  required,
}: Props) {
  const [show, setShow] = useState(false);

  const display = useMemo(() => {
    if (!value) return "";
    return show ? formatSSNStyle(value) : progressiveMask(value);
  }, [value, show]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Always derive raw digits from input + current raw value
    const digits = onlyDigits(e.target.value);
    onChange(digits);
  };

  return (
    <div>
      <label className="label">{label}{required ? "" : null}</label>

      <div className="relative w-1/6 min-w-[220px]">
        <input
          className="input pr-10 w-full"
          value={display}
          onChange={handleInput}
          inputMode="numeric"
          placeholder="###-##-####"
          aria-label={label}
        />

        {/* Eye toggle */}
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          aria-label={show ? "Ocultar" : "Mostrar"}
          onClick={() => setShow((s) => !s)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M1.5 12s3.75-6.5 10.5-6.5S22.5 12 22.5 12s-3.75 6.5-10.5 6.5S1.5 12 1.5 12Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            {!show && <circle cx="12" cy="12" r="2" fill="currentColor" />}
          </svg>
        </button>
      </div>
    </div>
  );
}