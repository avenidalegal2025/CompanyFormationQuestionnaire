// src/components/steps/Step1Intro.tsx
"use client";

import HeroBanner from "@/components/HeroBanner";
import type { StepProps } from "./types";

export default function Step1Intro({ form, setStep }: StepProps) {
  const { register } = form;

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
              {...register("profile.fullName")}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="tu@email.com"
              {...register("profile.email")}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep(2)}
          >
            Continuar
          </button>
        </div>
      </div>
    </section>
  );
}