"use client";

import { useEffect, useRef } from "react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Minimal runtime shapes so we don’t rely on @types/google.maps */
type AcAddressComponent = { long_name: string; short_name: string; types: string[] };
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

/**
 * Fallback parser for a US `formatted_address` string when structured
 * `address_components` are unavailable (Google's 2025 legacy-Places changes can
 * return predictions + formatted_address while omitting components for some
 * keys). Example: "3090 West Oakland Park Blvd, Oakland Park, FL 33311, USA".
 */
function parseFormattedUsAddress(
  formatted: string
): Omit<AddressSelectPayload, "fullAddress" | "country"> {
  const parts = formatted
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result = { line1: "", city: "", state: "", postalCode: "" };

  // Find the "ST 33311" (state + ZIP) chunk.
  let stateZipIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/\b([A-Z]{2})\b\s+(\d{5})(?:-\d{4})?/);
    if (m) {
      result.state = m[1];
      result.postalCode = m[2];
      stateZipIdx = i;
      break;
    }
  }

  if (stateZipIdx >= 1) {
    result.line1 = parts[0];
    result.city = parts.slice(1, stateZipIdx).join(", ");
  } else {
    result.line1 = parts[0] ?? "";
    if (parts.length >= 3) result.city = parts[1];
  }

  return result;
}

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

  // Keep the latest callbacks in refs so the place_changed listener always
  // calls the current handlers WITHOUT re-creating the Autocomplete widget.
  // Re-instantiating the widget on every render (because onSelect is an inline
  // function) attaches duplicate widgets to the same input and makes
  // place_changed fire unreliably — the bug this component had.
  const onSelectRef = useRef(onSelect);
  const onChangeTextRef = useRef(onChangeText);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onChangeTextRef.current = onChangeText;
  });

  useEffect(() => {
    let listener: AcListener | null = null;
    let cancelled = false;

    loadMapsOnce()
      .then(() => {
        if (cancelled) return;
        const g = (window as unknown as { google?: GoogleRuntime }).google;
        if (!inputRef.current || !g?.maps?.places) return;

        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["address_components", "formatted_address"],
          types: ["address"],
          ...(country ? { componentRestrictions: { country } } : {}),
        });

        listener = ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const comps = place.address_components ?? [];
          const formatted = place.formatted_address ?? "";

          const byType = (t: string) =>
            comps.find((c) => c.types.includes(t))?.long_name ?? "";
          const byTypeShort = (t: string) =>
            comps.find((c) => c.types.includes(t))?.short_name ?? "";

          let line1 = [byType("street_number"), byType("route")]
            .filter(Boolean)
            .join(" ");
          let city =
            byType("locality") ||
            byType("postal_town") ||
            byType("sublocality") ||
            "";
          // Prefer the 2-letter state abbreviation (FL), which is what the
          // downstream forms and Sunbiz expect.
          let state =
            byTypeShort("administrative_area_level_1") ||
            byType("administrative_area_level_1") ||
            byType("administrative_area_level_2") ||
            "";
          let postalCode = byType("postal_code");
          const countryName = byType("country");

          // Fallback: if structured components didn't yield the street address,
          // parse the formatted_address string so the fields still populate.
          if ((!line1 || !city || !state || !postalCode) && formatted) {
            const f = parseFormattedUsAddress(formatted);
            line1 = line1 || f.line1;
            city = city || f.city;
            state = state || f.state;
            postalCode = postalCode || f.postalCode;
          }

          onSelectRef.current({
            fullAddress: formatted,
            line1,
            city,
            state,
            postalCode,
            country: countryName,
          });

          if (onChangeTextRef.current && formatted) {
            onChangeTextRef.current(formatted);
          }
        });
      })
      .catch((e) => {
        // Keep this log for quick diagnosis if env var or script fails
        console.error("Google Maps loader error:", e);
      });

    return () => {
      cancelled = true;
      if (listener) listener.remove();
    };
    // Only re-create the widget if the country restriction changes — NOT on
    // every render. Callbacks are read from refs above.
  }, [country]);

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
