/// <reference types="google.maps" />
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export type Address = {
  fullAddress: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat?: number;
  lng?: number;
};

type Props = {
  placeholder?: string;
  country?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  defaultValue?: string;
  onSelect: (addr: Address) => void;
};

function AddressAutocomplete({
  placeholder,
  country = "us",
  value,
  defaultValue,
  onChangeText,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] =
    useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    async function init() {
      const maps = await loadGoogleMaps();
      if (inputRef.current && !autocomplete) {
        const ac = new maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components"],
          componentRestrictions: { country },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.address_components) return;

          const get = (type: string) =>
            place.address_components?.find((c) => c.types.includes(type))
              ?.long_name || "";

          const addr: Address = {
            fullAddress: place.formatted_address || "",
            line1: [get("street_number"), get("route")].filter(Boolean).join(" "),
            city: get("locality") || get("sublocality") || get("postal_town"),
            state: get("administrative_area_level_1"),
            postalCode: get("postal_code"),
            country: get("country"),
            lat: place.geometry?.location?.lat(),
            lng: place.geometry?.location?.lng(),
          };

          onSelect(addr);
        });
        setAutocomplete(ac);
      }
    }
    void init();
  }, [autocomplete, country, onSelect]);

  return (
    <input
      ref={inputRef}
      className="input w-full"
      placeholder={placeholder ?? "Escriba y seleccione la dirección"}
      defaultValue={defaultValue}
      value={value}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
}

export default AddressAutocomplete;
export { AddressAutocomplete };