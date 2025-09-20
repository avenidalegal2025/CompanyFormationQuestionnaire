// src/lib/formHandlers.ts
import type { AllSteps } from "@/lib/schema";

/**
 * Final submit handler for the wizard.
 * You can replace the alert/console with a real POST later.
 */
export function onSubmit(data: AllSteps) {
  console.log("Form submitted:", data);
  alert("Guardado (UI). La integración final se hace luego.");
}

/**
 * “Check availability” button from Step 2.
 */
export function checkAvailability() {
  alert("Puedes continuar en lo que revisamos si tu nombre está disponible.");
}