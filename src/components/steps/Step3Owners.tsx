"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import HeroBanner from "@/components/HeroBanner";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

export default function Step3Owners({ form, setStep }: Props) {
  const { control, register, watch } = form;
  const ownersCount = watch("owners.count") || 1;

  return (
    <section className="space-y-6">
      <HeroBanner title="Datos de los Socios / Accionistas" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Información de Propietarios</h2>

        <div className="mt-4">
          <label className="label">Número de socios / accionistas</label>
          <input
            className="input w-24"
            type="number"
            min={1}
            step={1}
            {...register("owners.count", { valueAsNumber: true })}
          />
        </div>

        {Array.from({ length: ownersCount }).map((_, idx) => (
          <div
            key={idx}
            className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
          >
            <div>
              <label className="label">Nombre completo del Socio {idx + 1}</label>
              <input
                className="input w-full"
                {...register(`owners.owner${idx + 1}Name` as const)}
              />
            </div>

            <div>
              <label className="label">Dirección del Socio {idx + 1}</label>
              <Controller
                name={`owners.owner${idx + 1}Address` as const}
                control={control}
                render={({ field }) => (
                  <AddressAutocomplete
                    placeholder="Escriba y seleccione la dirección"
                    defaultValue={field.value ?? ""}
                    onSelect={(addr) => field.onChange(addr.fullAddress)}
                  />
                )}
              />
            </div>
          </div>
        ))}

        {/* footer */}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(2)}>
            Atrás
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}