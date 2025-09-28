// src/components/SSNEINInput.tsx
"use client";

import { useMemo, useState } from "react";

type Props = {
  /** Raw digits only (we strip non-digits), max 9 */
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
 * Progressive mask while typing (mask positions 1..5):
 * 1 -> "*"
 * 2 -> "**"
 * 3 -> "***"
 * 4 -> "***-*"
 * 5 -> "***-**"
 * 6..9 -> "***-**-<tail>"
 */
function progressiveMask(d: string) {
  const n = onlyDigits(d);
  const len = n.length;
  if (len === 0) return "";
  if (len <= 3) return "*".repeat(len);
  if (len <= 5) return `***-${"*".repeat(len - 3)}`;
  return `***-**-${n.slice(5)}`;
}

export default function SSNEINInput({
  value = "",
  onChange,
  label = "SSN / EIN",
}: Props) {
  const [show, setShow] = useState(false);

  const display = useMemo(() => {
    if (!value) return "";
    return show ? formatSSNStyle(value) : progressiveMask(value);
  }, [value, show]);

  // IMPORTANT: make the field readOnly and handle typing ourselves so
  // masked text doesn’t break input (this fixes the “only 1 digit” bug).
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    const key = e.key;

    // allow navigation & tab
    if (key === "Tab" || key.startsWith("Arrow") || key === "Home" || key === "End") return;

    // digits
    if (/^\d$/.test(key)) {
      e.preventDefault();
      const next = onlyDigits((value || "") + key);
      if (next.length <= 9) onChange(next);
      return;
    }

    // backspace/delete
    if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      onChange((value || "").slice(0, -1));
      return;
    }

    // block everything else
    e.preventDefault();
  };

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault();
    const paste = e.clipboardData?.getData("text") || "";
    const next = onlyDigits((value || "") + paste);
    onChange(next);
  };

  return (
    <div>
      <label className="label">{label}</label>

      {/* 1/6 width with a sensible minimum */}
      <div className="relative w-1/6 min-w-[220px]">
        <input
          className="input pr-10 w-full"
          value={display}
          readOnly
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
            <path d="M1.5 12s3.75-6.5 10.5-6.5S22.5 12 22.5 12s-3.75 6.5-10.5 6.5S1.5 12 1.5 12Z"
                  stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            {!show && <circle cx="12" cy="12" r="2" fill="currentColor" />}
          </svg>
        </button>
      </div>
    </div>
  );
}