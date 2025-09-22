"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import AddressAutocomplete from "./AddressAutocomplete";
import type { AllSteps } from "@/lib/schema";

type Props = {
  name: FieldPath<AllSteps>;
  control: Control<AllSteps>;
  placeholder?: string;
};

export default function RHFAddressAutocomplete({
  name,
  control,
  placeholder = "Escriba y seleccione la dirección",
}: Props) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <AddressAutocomplete
          placeholder={placeholder}
          value={(field.value as string) ?? ""}
          onChangeText={(text) => field.onChange(text)}
          onSelect={(addr) => {
            const formatted =
              addr.fullAddress ||
              [addr.line1, addr.city, addr.state, addr.postalCode, addr.country]
                .filter(Boolean)
                .join(", ");
            field.onChange(formatted);
          }}
        />
      )}
    />
  );
}