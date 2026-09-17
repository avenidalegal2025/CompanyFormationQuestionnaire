"use client";

import type { UseFormReturn } from "react-hook-form";
import type { AllSteps } from "@/lib/schema";

// Red "Selecciona una opción" under a required agreement question. The error is
// set by page.tsx when "Continuar" finds the question unanswered (see
// src/lib/required-answers.ts) and cleared as soon as the field changes.
export default function RequiredHint({ form, name }: { form: UseFormReturn<AllSteps>; name: string }) {
  const { error } = form.getFieldState(name as never, form.formState);
  if (!error?.message) return null;
  return (
    <p className="mt-2 text-sm text-red-600" role="alert" data-required-hint={name}>
      {String(error.message)}
    </p>
  );
}
