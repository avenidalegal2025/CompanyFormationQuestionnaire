"use client";

import { useEffect } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface Props {
  value?: string;
  onChange: (e164: string | undefined) => void;
  placeholder?: string;
}

export default function InternationalPhoneInput({ value, onChange, placeholder }: Props) {
  // Ensure only E.164 is propagated
  return (
    <div className="w-full max-w-2xl">
      <div className="input p-0 flex items-center">
        <PhoneInput
          international
          defaultCountry="US"
          value={value}
          onChange={onChange}
          placeholder={placeholder || "Ingresa número internacional"}
          countryCallingCodeEditable={true}
          className="w-full [&_.PhoneInputInput]:w-full [&_.PhoneInputInput]:outline-none [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:bg-transparent"
        />
      </div>
      <p className="help mt-1">Guardaremos este número para configurar el desvío automáticamente.</p>
    </div>
  );
}


