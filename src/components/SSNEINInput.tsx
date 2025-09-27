// src/components/SSNEINInput.tsx
"use client";

import { useMemo, useState } from "react";

type Props = {
  /** Raw digits only (we’ll strip non-digits), max 9 */
  value?: string;
  onChange: (rawDigits: string) => void;
  /** Label above the input */
  label?: string; // default: "SSN / EIN (opcional)"
  required?: boolean;
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "").slice(0, 9);
}

// Format as SSN for display when fully shown (###-##-####).
// We use SSN style for consistency even if it’s an EIN.
function formatSSNStyle(d: string) {
  const n = onlyDigits(d);
  if (!n) return "";
  if (n.length <= 3) return n;
  if (n.length <= 5) return `${n.slice(0, 3)}-${n.slice(3)}`;
  return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
}

// Mask first 5, show last 4: ***-**-1234
function maskFirstFiveShowLast4(d: string) {
  const n = onlyDigits(d);
  const last4 = n.slice(-4);
  if (!last4) return "";
  return `***-**-${last4}`;
}

export default function SSNEINInput({
  value = "",
  onChange,
  label = "SSN / EIN (opcional)",
  required,
}: Props) {
  const [show, setShow] = useState(false);

  const display = useMemo(() => {
    if (!value) return "";
    return show ? formatSSNStyle(value) : maskFirstFiveShowLast4(value);
  }, [value, show]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(onlyDigits(e.target.value));
  };

  return (
    <div>
      <label className="label">
        {label} {required ? "" : null}
      </label>

      <div className="relative">
        <input
          className="input pr-10"
          value={display}
          onChange={handleInput}
          inputMode="numeric"
          placeholder="###-##-####"
          aria-label={`${label}${required ? "" : " (opcional)"}`}
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

      <p className="help">Puede proporcionar SSN o EIN. Guardamos solo dígitos (sin guiones).</p>
    </div>
  );
}