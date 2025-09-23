"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SegmentedToggle from "@/components/SegmentedToggle";
import HeroBanner from "@/components/HeroBanner";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

export default function Step2Company({ form, setStep }: Props) {
  const { control, register, watch } = form;
  const entityType = watch("company.entityType");

  return (
    <section className="space-y-6">
      <HeroBanner title="Datos de la Empresa" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Información de la Empresa</h2>

        <div className="mt-4">
          <label className="label">Tipo de entidad</label>
          <Controller
            name="company.entityType"
            control={control}
            render={({ field }) => (
              <SegmentedToggle
                value={field.value || "LLC"}
                onChange={field.onChange}
                options={[
                  { value: "LLC", label: "LLC" },
                  { value: "C-Corp", label: "C-Corp" },
                ]}
                ariaLabel="Tipo de entidad"
                name={field.name}
              />
            )}
          />
        </div>

        <div className="mt-4">
          <label className="label">Nombre de la Empresa</label>
          <input className="input w-full" {...register("company.companyName")} />
        </div>

        <div className="mt-4">
          <label className="label">Dirección principal</label>
          <Controller
            name="company.address"
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

        {/* footer */}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(1)}>
            Atrás
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}