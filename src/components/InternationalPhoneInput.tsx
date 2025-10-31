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
    const e164 = (val || "").replace(/\s+/g, "");
    const parsed = parsePhoneNumberFromString(e164 || "");
    let countryCallingCode = parsed?.countryCallingCode || "";
    let national = parsed?.nationalNumber || e164.replace(/^\+?\d{1,4}/, "").replace(/[^\d]/g, "");

    if (national.length > 12) {
      national = national.slice(0, 12);
      const rebuilt = countryCallingCode ? `+${countryCallingCode}${national}` : `+${national}`;
      onChange(rebuilt);
      setError(national.length < 6 ? "Debe tener al menos 6 dígitos" : null);
      return;
    }
    setError(national.length > 0 && national.length < 6 ? "Debe tener entre 6 y 12 dígitos" : null);
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
          showDisabledDialCode={true}
          forceDialCode={true}
          autoComplete="tel"
        />
      </div>
      <p className={`help mt-1 ${error ? "text-red-600" : ""}`}>{error ?? "Guardaremos este número para configurar el desvío automáticamente."}</p>
    </div>
  );
}


