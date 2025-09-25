"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import AddressAutocomplete, {
  type AddressSelectPayload,
} from "@/components/AddressAutocomplete";
import type { AllSteps } from "@/lib/schema";

type Props<TFieldPath extends FieldPath<AllSteps>> = {
  control: Control<AllSteps>;
  name: TFieldPath;
  placeholder?: string;
  country?: string;
};

/** React Hook Form wrapper that uses the controlled mode of AddressAutocomplete */
export default function RHFAddressAutocomplete<TFieldPath extends FieldPath<AllSteps>>({
  control,
  name,
  placeholder,
  country,
}: Props<TFieldPath>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <AddressAutocomplete
          placeholder={placeholder ?? "Escriba y seleccione la dirección"}
          value={(field.value as string) ?? ""}
          onChangeText={(text: string) => field.onChange(text)}
          country={country}
          onSelect={(addr: AddressSelectPayload) => {
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