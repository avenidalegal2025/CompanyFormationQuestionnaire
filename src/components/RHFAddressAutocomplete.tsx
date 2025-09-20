"use client";

import React from "react";
import { Controller, useFormContext, type Control } from "react-hook-form";
import AddressAutocomplete from "@/components/AddressAutocomplete";

// If your AddressAutocomplete exports a type for the selected address, import it here:
// import type { Address } from "@/components/AddressAutocomplete";

type Props<TFieldValues = any> = {
  name: string;                     // RHF field path
  control?: Control<TFieldValues>;  // optional; will use context if not provided
  placeholder?: string;
  onSelectedAddress?: (addr: any) => void;
};

export default function RHFAddressAutocomplete<TFieldValues = any>({
  name,
  control,
  placeholder = "Escriba y seleccione la dirección",
  onSelectedAddress,
}: Props<TFieldValues>) {
  // Fallback to RHF context if control wasn’t passed
  const ctx = useFormContext<TFieldValues>();
  const ctrl = (control ?? ctx?.control) as Control<TFieldValues> | undefined;

  // If we still don’t have control (e.g., not inside FormProvider and no prop), render a safe fallback
  if (!ctrl) {
    return <input className="input" placeholder={placeholder} />;
  }

  return (
    <Controller
      name={name}
      control={ctrl}
      render={({ field }) => (
        <AddressAutocomplete
          placeholder={placeholder}
          // If your AddressAutocomplete supports controlled props:
          value={field.value ?? ""}
          onChangeText={(text: string) => field.onChange(text)}
          onSelect={(addr: any) => {
            // Build a formatted string if your component doesn’t already provide one
            const formatted =
              addr.formatted ||
              addr.fullAddress ||
              [addr.line1, addr.city, addr.state, addr.postalCode, addr.country]
                .filter(Boolean)
                .join(", ");

            field.onChange(formatted);
            onSelectedAddress?.(addr);
          }}
        />
      )}
    />
  );
}