"use client";

import type { UseFormReturn } from "react-hook-form";

// Structured replacement for the free-text non-compete territory. The agreement
// is generated in English, so the free-text Spanish wording ("Estado de
// Florida") used to land untranslated in the document. The dropdown composes
// the English phrase itself and stores it in `<prefix>_nonCompeteScope`, which
// the mapper and docgen already read.

type Kind = "state" | "usa" | "city_state" | "zip" | "distance";

const OPTIONS: { value: Kind; label: string }[] = [
  { value: "state", label: "Estado de formación" },
  { value: "city_state", label: "Ciudad y estado" },
  { value: "zip", label: "Código postal (zip)" },
  { value: "distance", label: "Distancia (millas)" },
  { value: "usa", label: "Todo Estados Unidos" },
];

const DETAIL: Record<Exclude<Kind, "state" | "usa">, { placeholder: string; inputMode?: "numeric" }> = {
  city_state: { placeholder: "ej. Miami, Florida" },
  zip: { placeholder: "ej. 33101, 33130", inputMode: "numeric" },
  distance: { placeholder: "ej. 50", inputMode: "numeric" },
};

export function composeTerritory(kind: Kind | undefined, detail: string, formationState: string): string {
  const d = detail.trim();
  switch (kind) {
    case "state":
      return `the State of ${formationState}`;
    case "usa":
      return "the United States";
    case "city_state": {
      // Stored as "City, State"; a city without its state stays empty (two Miamis).
      const i = d.lastIndexOf(",");
      const city = i < 0 ? "" : d.slice(0, i).trim();
      const state = i < 0 ? "" : d.slice(i + 1).trim();
      return city && state ? `the area of ${city}, ${state}` : "";
    }
    case "zip":
      return d ? `the area of ZIP code ${d}` : "";
    case "distance": {
      const miles = d.replace(/\D/g, "");
      return miles ? `a ${miles}-mile radius of the Company's principal place of business` : "";
    }
    default:
      return "";
  }
}

export default function TerritoryField({
  form,
  prefix,
  formationState,
}: {
  form: UseFormReturn<any>;
  prefix: "corp" | "llc";
  formationState: string;
}) {
  const { watch, setValue } = form;
  const typeName = `agreement.${prefix}_nonCompeteScopeType`;
  const detailName = `agreement.${prefix}_nonCompeteScopeDetail`;
  const scopeName = `agreement.${prefix}_nonCompeteScope`;
  const kind = watch(typeName) as Kind | undefined;
  const detail = (watch(detailName) as string | undefined) ?? "";
  const hasDetail = kind === "city_state" || kind === "zip" || kind === "distance";
  // "City, State": the state starts as the formation state; Antonio asked that a
  // city never be accepted without one.
  const comma = detail.lastIndexOf(",");
  const cityPart = comma < 0 ? detail : detail.slice(0, comma);
  const statePart = comma < 0 ? formationState : detail.slice(comma + 1).trim();

  const update = (nextKind: Kind | "", nextDetail: string) => {
    setValue(typeName, nextKind || undefined, { shouldDirty: true, shouldValidate: true });
    setValue(detailName, nextDetail, { shouldDirty: true });
    setValue(scopeName, composeTerritory(nextKind || undefined, nextDetail, formationState), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <select
        name={typeName}
        className="input w-full"
        aria-label="Alcance geográfico de la no competencia"
        value={kind ?? ""}
        onChange={(e) => update(e.target.value as Kind | "", "")}
      >
        <option value="">Seleccionar alcance</option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {kind === "city_state" && (
        <div className="flex gap-2">
          <input
            type="text"
            className="input w-full"
            aria-label="Ciudad"
            placeholder="Ciudad, ej. Miami"
            value={cityPart}
            onChange={(e) => update("city_state", `${e.target.value}, ${statePart}`)}
          />
          <input
            type="text"
            className="input w-full"
            aria-label="Estado"
            placeholder="Estado"
            value={statePart}
            onChange={(e) => update("city_state", `${cityPart}, ${e.target.value}`)}
          />
        </div>
      )}
      {hasDetail && kind !== "city_state" && (
        <input
          type="text"
          className="input w-full"
          inputMode={DETAIL[kind as keyof typeof DETAIL].inputMode}
          placeholder={DETAIL[kind as keyof typeof DETAIL].placeholder}
          value={detail}
          onChange={(e) => update(kind as Kind, e.target.value)}
        />
      )}
    </div>
  );
}
