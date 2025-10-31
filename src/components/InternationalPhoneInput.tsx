"use client";

import { useState } from "react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { parsePhoneNumberFromString } from "libphonenumber-js";

interface Props {
  value?: string;
  onChange: (e164: string | undefined) => void;
  placeholder?: string;
}

export default function InternationalPhoneInput({ value, onChange, placeholder }: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (val?: string) => {
    // Remove all spaces and non-digit characters except + for E.164 format
    const e164 = (val || "").replace(/\s+/g, "");
    const parsed = parsePhoneNumberFromString(e164 || "");
    
    // Extract only digits from the national number (no spaces, no formatting)
    const nationalDigits = (parsed?.nationalNumber || "").replace(/[^\d]/g, "");

    // Allow 6-14 digits in the national number
    if (nationalDigits.length > 14) {
      return; // Don't allow more than 14 digits
    }
    
    if (nationalDigits.length > 0 && nationalDigits.length < 6) {
      setError("Debe tener entre 6 y 14 dígitos");
    } else {
      setError(null);
    }
    
    onChange(e164 || undefined);
  };

  return (
    <div className="w-full max-w-2xl">
      <div className={`input p-0 ${error ? "ring-1 ring-red-500 border-red-300" : ""}`}>
        <PhoneInput
          defaultCountry="us"
          value={value}
          onChange={handleChange}
          inputProps={{
            name: "forwardPhone",
            required: false,
          }}
          // full width and integrate with our input styles
          className="w-full"
          inputClassName="w-full !border-0 !outline-none !bg-transparent"
          countrySelectorStyleProps={{
            buttonClassName: "!px-3 !py-2 !rounded-l-lg !border-0",
          }}
          placeholder={placeholder || "Buscar país y escribir número"}
          hideDropdown={false}
          forceDialCode={true}
        />
      </div>
      <p className={`help mt-1 ${error ? "text-red-600" : ""}`}>{error ?? "Guardaremos este número para configurar el desvío automáticamente."}</p>
    </div>
  );
}


