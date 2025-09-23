"use client";

import { useEffect, useRef, useState } from "react";

type Address = {
  fullAddress: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type Props = {
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  country?: string;
  onChangeText?: (text: string) => void;
  onSelect?: (addr: Address) => void;
};

export default function AddressAutocomplete({
  placeholder = "Escriba y seleccione la dirección",
  defaultValue = "",
  value,
  country = "us",
  onChangeText,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  // lazy-load Google Maps script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autocomplete) return;

    const load = async () => {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
          script.async = true;
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }

      if (inputRef.current && window.google?.maps?.places) {
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components"],
          componentRestrictions: { country },
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place || !place.address_components) return;

          const components: Record<string, string> = {};
          place.address_components.forEach((c) => {
            const type = c.types[0];
            components[type] = c.long_name;
          });

          const addr: Address = {
            fullAddress: place.formatted_address || "",
            line1:
              components["street_number"] && components["route"]
                ? `${components["street_number"]} ${components["route"]}`
                : components["route"] || "",
            city:
              components["locality"] ||
              components["sublocality"] ||
              components["administrative_area_level_2"] ||
              "",
            state: components["administrative_area_level_1"] || "",
            postalCode: components["postal_code"] || "",
            country: components["country"] || "",
          };

          onSelect?.(addr);
        });

        setAutocomplete(ac);
      }
    };

    load();
  }, [autocomplete, country, onSelect]);

  return (
    <input
      ref={inputRef}
      className="input w-full"
      placeholder={placeholder}
      defaultValue={defaultValue}
      value={value}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
}