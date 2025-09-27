"use client";

import { useMemo, useState } from "react";

type Props = {
  value?: string;                 // raw digits only, no dashes
  onChange: (rawDigits: string) => void;
  typeValue?: "SSN" | "EIN";      // optional external control for type
  onTypeChange?: (t: "SSN" | "EIN") => void;
  label?: string;                 // defaults to "SSN / EIN (opcional)"
  required?: boolean;
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "").slice(0, 9);
}

function formatForType(digits: string, type: "SSN" | "EIN") {
  const d = onlyDigits(digits);
  if (type === "EIN") {
    // ##-####### (up to 9 digits)
    if (d.length <= 2) return d;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  } else {
    // ###-##-#### (up to 9 digits)
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return d;
}

function maskLast4(digits: string, type: "SSN" | "EIN") {
  const d = onlyDigits(digits);
  const last4 = d.slice(-4);
  // We show the mask in SSN style regardless (clean + consistent),
  // as requested (“safe like in the image”)
  return `***-**-${last4}`.replace(/-$/, "");
}

export default function SSNEINInput({
  value = "",
  onChange,
  typeValue,
  onTypeChange,
  label = "SSN / EIN (opcional)",
  required,
}: Props) {
  // Local type if caller doesn’t provide one
  const [localType, setLocalType] = useState<"SSN" | "EIN">("SSN");
  const theType = typeValue ?? localType;

  const [show, setShow] = useState(false);

  const display = useMemo(() => {
    if (!value) return "";
    return show ? formatForType(value, theType) : maskLast4(value, theType);
  }, [value, theType, show]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // We always store only digits
    const digits = onlyDigits(e.target.value);
    onChange(digits);
  };

  const handleTypeChange = (t: "SSN" | "EIN") => {
    if (onTypeChange) onTypeChange(t);
    else setLocalType(t);
  };

  return (
    <div>
      <label className="label">
        {label} {!required && <span className="text-gray-400">(opcional)</span>}
      </label>

      <div className="relative">
        {/* Tiny type selector */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
            value={theType}
            onChange={(e) => handleTypeChange(e.target.value as "SSN" | "EIN")}
            aria-label="Tipo de identificación"
          >
            <option value="SSN">SSN</option>
            <option value="EIN">EIN</option>
          </select>
        </div>

        {/* Input (renders masked string unless 'show' is true).
            We keep it type="text" but block non-digits in onChange. */}
        <input
          className="input pl-20 pr-10"
          value={display}
          onChange={handleInput}
          inputMode="numeric"
          placeholder={theType === "EIN" ? "##-#######" : "###-##-####"}
          aria-label={`${theType} (opcional)`}
        />

        {/* Eye toggle */}
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          aria-label={show ? "Ocultar" : "Mostrar"}
          onClick={() => setShow((s) => !s)}
        >
          {/* simple eye glyph */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M1.5 12s3.75-6.5 10.5-6.5S22.5 12 22.5 12s-3.75 6.5-10.5 6.5S1.5 12 1.5 12Z"
              stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            {!show && <circle cx="12" cy="12" r="2" fill="currentColor" />}
          </svg>
        </button>
      </div>

      <p className="help">Puede proporcionar SSN o EIN. Guardamos solo dígitos (sin guiones).</p>
    </div>
  );
}