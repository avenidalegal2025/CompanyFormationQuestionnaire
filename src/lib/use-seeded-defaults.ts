"use client";

import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AllSteps } from "./schema";

/**
 * Writes a number shown in an input into the form when the answer is still
 * empty, so "what the customer sees" and "what the document uses" are the same
 * value.
 *
 * Numeric questions used to render `defaultValue={50.01}`, which shows 50.01 in
 * the box but saves nothing; the document then used its own fallback (50, or in
 * the super-majority case no definition at all). Seeding the form instead keeps
 * the displayed number, the saved draft, Airtable and the document in sync.
 * Existing answers are never overwritten.
 */
export function useSeededDefaults(
  form: UseFormReturn<AllSteps>,
  defaults: Record<string, number>
) {
  const { setValue, getValues } = form;
  const key = JSON.stringify(defaults);
  useEffect(() => {
    for (const [name, value] of Object.entries(JSON.parse(key) as Record<string, number>)) {
      const current = (getValues as (n: string) => unknown)(name);
      const blank =
        current === undefined ||
        current === null ||
        current === "" ||
        (typeof current === "number" && Number.isNaN(current));
      if (blank) {
        (setValue as (n: string, v: number, o?: object) => void)(name, value, { shouldDirty: false });
      }
    }
  }, [key, setValue, getValues]);
}
