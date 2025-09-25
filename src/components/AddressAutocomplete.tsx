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

/** Extend window with only our loader helpers (avoid redeclaring `google`). */
declare global {
  interface Window {
    __gmapsLoader?: Promise<void>;
    __noop__?: () => void;
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

      // Already loaded?
      if (document.querySelector('script[data-gmaps="js"]')) {
        resolve();
        return;
      }

      // Core JS with Places lib
      const core = document.createElement("script");
      core.dataset.gmaps = "js";
      core.async = true;
      core.defer = true;
      core.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        GOOGLE_KEY
      )}&libraries=places`;
      core.onload = () => resolve();
      core.onerror = () => reject(new Error("Failed to load Google Maps JS"));
      document.head.appendChild(core);

      // Optional: elements bundle (future-proof)
      if (!document.querySelector('script[data-gmaps="elements"]')) {
        const el = document.createElement("script");
        el.dataset.gmaps = "elements";
        el.type = "module";
        el.src =
          `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            GOOGLE_KEY
          )}&v=weekly&libraries=places,marker&callback=__noop__`;
        window.__noop__ = () => {};
        document.head.appendChild(el);
      }
    });
  }
  return window.__gmapsLoader;
}

type Props = {
  placeholder?: string;
  defaultValue?: string;
  country?: string; // e.g. "us"
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
  placeholder = "Escriba y seleccione la dirección…",
  defaultValue = "",
  country,
  onSelect,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let listener: AcListener | null = null;

    loadMapsOnce()
      .then(() => {
        // Read google from window without redeclaring its type
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
        });
      })
      .catch((e) => {
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