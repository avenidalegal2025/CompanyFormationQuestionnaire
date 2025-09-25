"use client";

import { useEffect, useRef } from "react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Keep one loader Promise in the window to avoid “already defined” spam
declare global {
  interface Window {
    __gmapsLoader?: Promise<void>;
  }
}

function loadMapsOnce(): Promise<void> {
  if (!window.__gmapsLoader) {
    window.__gmapsLoader = new Promise((resolve, reject) => {
      if (!GOOGLE_KEY) {
        reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing"));
        return;
      }
      // If script already present, resolve
      if (document.querySelector('script[data-gmaps="js"]')) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.dataset.gmaps = "js";
      s.async = true;
      s.defer = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        GOOGLE_KEY
      )}&libraries=places`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Google Maps JS"));
      document.head.appendChild(s);

      // Also load the Web Components bundle once (future-proof for migration)
      if (!document.querySelector('script[data-gmaps="elements"]')) {
        const w = document.createElement("script");
        w.dataset.gmaps = "elements";
        w.type = "module";
        w.src =
          "https://maps.googleapis.com/maps/api/js?key=" +
          encodeURIComponent(GOOGLE_KEY) +
          "&v=weekly&libraries=places,marker&callback=__noop";
        // callback no-op so Google doesn’t complain
        (window as any).__noop = () => {};
        document.head.appendChild(w);
      }
    });
  }
  return window.__gmapsLoader;
}

type Props = {
  placeholder?: string;
  defaultValue?: string;
  country?: string; // e.g., "us"
  onSelect: (addr: {
    fullAddress: string;
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }) => void;
};

export default function AddressAutocomplete({
  placeholder = "Start typing an address…",
  defaultValue = "",
  country,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let listener: google.maps.MapsEventListener | undefined;

    loadMapsOnce()
      .then(() => {
        if (!inputRef.current || !(window as any).google?.maps?.places) return;

        const autocomplete = new google.maps.places.Autocomplete(
          inputRef.current,
          {
            fields: ["address_components", "formatted_address"],
            ...(country ? { componentRestrictions: { country } } : {}),
          }
        );

        listener = autocomplete.addListener("place_changed", () => {
          const p = autocomplete.getPlace();
          const comps = (p.address_components || []) as google.maps.GeocoderAddressComponent[];

          const byType = (t: string) =>
            comps.find((c) => c.types.includes(t))?.long_name || "";

          const line1 = [
            byType("street_number"),
            byType("route"),
          ]
            .filter(Boolean)
            .join(" ");

            const city =
            byType("locality") ||
            byType("postal_town") ||
            byType("sublocality") ||
            "";

          const state =
            byType("administrative_area_level_1") ||
            byType("administrative_area_level_2") ||
            "";

          const postalCode = byType("postal_code");
          const countryName = byType("country");

          onSelect({
            fullAddress: p.formatted_address || "",
            line1,
            city,
            state,
            postalCode,
            country: countryName,
          });
        });
      })
      .catch((e) => {
        // Helpful during bring-up
        // eslint-disable-next-line no-console
        console.error("Google Maps loader error:", e);
      });

    return () => {
      if (listener) listener.remove();
    };
  }, [country, onSelect]);

  return (
    <input
      ref={inputRef}
      className="input"
      placeholder={placeholder}
      defaultValue={defaultValue}
      autoComplete="off"
    />
  );
}