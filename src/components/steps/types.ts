// src/components/steps/types.ts
import type { UseFormReturn } from "react-hook-form";
import type { AllSteps } from "@/lib/schema";

export type StepProps = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
  /** Called by “Guardar y continuar” (save but stay) */
  onSave?: () => void | Promise<void>;
  /** Called by “Continuar” (save then advance) */
  onNext?: () => void | Promise<void>;
};