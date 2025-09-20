"use client";

import { useEffect, useRef, useState } from "react";

export type OwnerSuggestion = { name: string; address?: string };

export default function DirectorNameInput({
  value, onChange, suggestionsSource, onPickOwner, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestionsSource: OwnerSuggestion[];
  onPickOwner: (name: string, address?: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = (() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return [];
    return suggestionsSource.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 6);
  })();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        className="input"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-md">
          {filtered.map((s, idx) => (
            <button
              key={`${idx}-${s.name}`}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => { onPickOwner(s.name, s.address); setOpen(false); }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}