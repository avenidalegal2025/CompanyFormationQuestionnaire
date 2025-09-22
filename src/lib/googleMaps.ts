declare global {
  interface Window {
    google?: typeof google;
  }
}

let loadingPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }

  // Already available
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  // Already loading
  if (loadingPromise) return loadingPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
  }

  loadingPromise = new Promise<typeof google>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gmaps="1"]');
    if (existing) {
      existing.addEventListener("load", () => window.google ? resolve(window.google) : reject(new Error("Google failed to attach")));
      existing.addEventListener("error", () => reject(new Error("Failed loading Google Maps")));
      return;
    }

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-gmaps", "1");
    script.onload = () => {
      if (window.google) resolve(window.google);
      else reject(new Error("Google failed to attach"));
    };
    script.onerror = () => reject(new Error("Failed loading Google Maps"));
    document.head.appendChild(script);
  });

  return loadingPromise;
}