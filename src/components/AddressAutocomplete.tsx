/// <reference types="google.maps" />
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export type Address = {
  fullAddress: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;       // e.g., FL
  postalCode: string;  // ZIP
  country: string;
  lat?: number;
  lng?: number;
};

export default function AddressAutocomplete({
  placeholder = "Escribe tu dirección",
  country = "us",
  /** NEW: controlled value (preferred) */
  value,
  /** NEW: controlled onChange (preferred) */
  onChangeText,
  /** legacy: fallback initial value when uncontrolled */
  defaultValue = "",
  onSelect,
}: {
  placeholder?: string;
  country?: string;
  value?: string;                    // <-- NEW
  onChangeText?: (text: string) => void; // <-- NEW
  defaultValue?: string;
  onSelect: (addr: Address) => void;
}) {
  const [ready, setReady] = useState(false);

  // Internal query state is used for predictions but mirrors the external value when provided
  const [query, setQuery] = useState(defaultValue);
  const [preds, setPreds] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const acSvcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const dummyDiv = useRef<HTMLDivElement | null>(null);

  // Keep internal query in sync with external controlled value
  useEffect(() => {
    if (typeof value === "string") setQuery(value);
  }, [value]);

  useEffect(() => {
    let mounted = true;
    loadGoogleMaps()
      .then((g) => {
        if (!mounted) return;
        acSvcRef.current = new g.maps.places.AutocompleteService();
        if (!dummyDiv.current) dummyDiv.current = document.createElement("div");
        placesRef.current = new g.maps.places.PlacesService(dummyDiv.current);
        setReady(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = (query || "").trim();
    if (!q) {
      setPreds([]);
      setOpen(false);
      return;
    }
    const h = setTimeout(() => {
      acSvcRef.current?.getPlacePredictions(
        { input: q, componentRestrictions: { country }, types: ["address"] },
        (res) => {
          setPreds(res || []);
          setOpen((res?.length || 0) > 0);
          setActiveIndex(-1);
        }
      );
    }, 150);
    return () => clearTimeout(h);
  }, [query, ready, country]);

  function parseComponents(components: google.maps.GeocoderAddressComponent[]) {
    const by = (t: string) => components.find((c) => c.types.includes(t));
    const streetNumber = by("street_number")?.long_name ?? "";
    const route = by("route")?.long_name ?? "";
    const city =
      by("locality")?.long_name ??
      by("sublocality")?.long_name ??
      by("postal_town")?.long_name ??
      "";
    const state = by("administrative_area_level_1")?.short_name ?? "";
    const postalCode = by("postal_code")?.long_name ?? "";
    const country = by("country")?.long_name ?? "";
    return {
      line1: [streetNumber, route].filter(Boolean).join(" ").trim(),
      city,
      state,
      postalCode,
      country,
    };
  }

  function selectPrediction(p: google.maps.places.AutocompletePrediction) {
    const pid = p.place_id;
    if (!pid || !placesRef.current) return;
    placesRef.current.getDetails(
      { placeId: pid, fields: ["address_component", "formatted_address", "geometry"] },
      (place, status) => {
        if (!place || status !== google.maps.places.PlacesServiceStatus.OK) return;
        const comps = parseComponents((place.address_components || []) as any);
        const addr: Address = {
          fullAddress: place.formatted_address || p.description,
          line1: comps.line1,
          line2: "",
          city: comps.city,
          state: comps.state,
          postalCode: comps.postalCode,
          country: comps.country || "United States",
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
        };

        // Update visible input immediately for uncontrolled usage
        setQuery(addr.fullAddress);

        // Close dropdown
        setPreds([]);
        setOpen(false);

        // IMPORTANT: do not call onChangeText here; the parent (RHF) will set the field value
        // in its onSelect handler (e.g., to a formatted string). Our input will update because
        // we sync to `value` via the effect above.

        onSelect(addr);
      }
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || preds.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, preds.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = preds[activeIndex] ?? preds[0];
      if (p) selectPrediction(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleChange = (text: string) => {
    // Always update internal query for predictions
    setQuery(text);
    // If controlled, notify parent
    onChangeText?.(text);
  };

  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (preds.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="addr-listbox"
      />
      {open && preds.length > 0 && (
        <ul
          id="addr-listbox"
          role="listbox"
          className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-soft max-h-64 overflow-auto"
        >
          {preds.map((p, idx) => (
            <li
              key={p.place_id}
              role="option"
              aria-selected={idx === activeIndex}
              className={`px-3 py-2 cursor-pointer ${idx === activeIndex ? "bg-gray-50" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectPrediction(p)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <div className="text-sm text-gray-900">
                {p.structured_formatting.main_text}
              </div>
              <div className="text-xs text-gray-500">
                {p.structured_formatting.secondary_text}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}