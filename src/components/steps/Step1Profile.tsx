"use client";

import { type UseFormReturn } from "react-hook-form";
import HeroBanner from "@/components/HeroBanner";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

export default function Step1Profile({ form, setStep }: Props) {
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
            <input className="input" placeholder="Ej: Juan Pérez" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="tu@email.com" />
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