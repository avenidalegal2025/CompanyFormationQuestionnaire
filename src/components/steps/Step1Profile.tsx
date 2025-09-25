// src/components/steps/Step1Profile.tsx
"use client";

import HeroBanner from "@/components/HeroBanner";
import type { StepProps } from "./types";
import type { AllSteps } from "@/lib/schema";

export default function Step1Profile({ form, setStep, onSave, onNext }: StepProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section className="space-y-6">
      <HeroBanner title="Información del solicitante" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Perfil</h2>
        <p className="mt-1 text-sm text-gray-600">
          Comencemos con tus datos básicos. Puedes completarlos más tarde.
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre completo</label>
            <input
              className="input"
              placeholder="Ej: Juan Pérez"
              {...register("profile.fullName" as const)}
            />
            <p className="help">{(errors.profile?.fullName as unknown as string) || ""}</p>
          </div>

          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="tu@email.com"
              {...register("profile.email" as const)}
            />
            <p className="help">{(errors.profile?.email as unknown as string) || ""}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-sm text-gray-700 hover:underline"
              onClick={() => void onSave?.()}
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onNext?.()}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}