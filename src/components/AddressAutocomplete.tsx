"use client";

import { useEffect, useRef } from "react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Minimal runtime shapes so we don’t rely on @types/google.maps */
type AcAddressComponent = { long_name: string; types: string[] };
type AcPlace = { address_components?: AcAddressComponent[]; formatted_address?: string };
type AcListener = { remove: () => void };
type AcInstance = {
  addListener: (eventName: "place_changed", handler: () => void) => AcListener;
  getPlace: () => AcPlace;
};
type GoogleRuntime = {
  maps?: {
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts: Record<string, unknown>
      ) => AcInstance;
    };
  };
};

/** Extend window only with our loader promise + init callback */
declare global {
  interface Window {
    __gmapsLoader?: Promise<void>;
    __gmapsInit?: () => void;
  }
}

/** Load Maps JS + Places exactly once */
function loadMapsOnce(): Promise<void> {
  if (!window.__gmapsLoader) {
    window.__gmapsLoader = new Promise<void>((resolve, reject) => {
      if (!GOOGLE_KEY) {
        reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing"));
        return;
      }

      // Already present?
      if ((window as unknown as { google?: GoogleRuntime }).google?.maps?.places) {
        resolve();
        return;
      }
      if (document.querySelector('script[data-gmaps="js"]')) {
        // If script tag exists but google is not ready, we’ll resolve on __gmapsInit
        return;
      }

      // Define the global callback the Google loader will call
      window.__gmapsInit = () => {
        resolve();
      };

      const s = document.createElement("script");
      s.dataset.gmaps = "js";
      s.async = true;
      s.defer = true;
      s.src =
        `https://maps.googleapis.com/maps/api/js` +
        `?key=${encodeURIComponent(GOOGLE_KEY)}` +
        `&libraries=places` +
        `&callback=__gmapsInit`;
      s.onerror = () => reject(new Error("Failed to load Google Maps JS"));
      document.head.appendChild(s);
    });
  }
  return window.__gmapsLoader;
}

export type AddressSelectPayload = {
  fullAddress: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type Props = {
  placeholder?: string;
  /** Uncontrolled initial value */
  defaultValue?: string;
  /** Controlled current value */
  value?: string;
  /** Controlled onChange handler */
  onChangeText?: (text: string) => void;
  country?: string; // e.g. "us"
  onSelect: (addr: AddressSelectPayload) => void;
};

export default function AddressAutocomplete({
  placeholder = "Escriba y seleccione la dirección…",
  defaultValue = "",
  value,
  onChangeText,
  country,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let listener: AcListener | null = null;

    loadMapsOnce()
      .then(() => {
        const g = (window as unknown as { google?: GoogleRuntime }).google;
        if (!inputRef.current || !g?.maps?.places) return;

        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["address_components", "formatted_address"],
          ...(country ? { componentRestrictions: { country } } : {}),
        });

        listener = ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const comps = place.address_components ?? [];

          const byType = (t: string) =>
            comps.find((c) => c.types.includes(t))?.long_name ?? "";

          const line1 = [byType("street_number"), byType("route")]
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
            fullAddress: place.formatted_address ?? "",
            line1,
            city,
            state,
            postalCode,
            country: countryName,
          });

          if (onChangeText && place.formatted_address) {
            onChangeText(place.formatted_address);
          }
        });
      })
      .catch((e) => {
        // Keep this log for quick diagnosis if env var or script fails
        console.error("Google Maps loader error:", e);
      });

    return () => {
      if (listener) listener.remove();
    };
  }, [country, onSelect, onChangeText]);

  // Controlled vs uncontrolled configuration
  const inputProps =
    value !== undefined
      ? {
          value,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onChangeText?.(e.target.value),
        }
      : {
          defaultValue,
        };

  return (
    <input
      ref={inputRef}
      className="input"
      placeholder={placeholder}
      autoComplete="off"
      {...inputProps}
    />
  );
}