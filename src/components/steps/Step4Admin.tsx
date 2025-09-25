// src/components/steps/Step4Admin.tsx
"use client";

import { Controller, type FieldPath } from "react-hook-form";
import HeroBanner from "@/components/HeroBanner";
import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete"; // default import ✅
import type { AllSteps } from "@/lib/schema";
import type { StepProps } from "./types";

// helper for dynamic field paths
const fp = (s: string) => s as unknown as FieldPath<AllSteps>;

export default function Step4Admin({ form, setStep, onSave, onNext }: StepProps) {
  const { control, register, watch } = form;

  const entityType = watch("company.entityType");

  // directors / officers (C-Corp)
  const directorsAllOwners = watch("admin.directorsAllOwners");
  const directorsCount = watch("admin.directorsCount") || 1;
  const officersAllOwners = watch("admin.officersAllOwners");

  // managers (LLC)
  const managersAllOwners = watch("admin.managersAllOwners");

  return (
    <section className="space-y-6">
      <HeroBanner title="Datos Administrativos" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Datos Administrativos</h2>
        <p className="mt-1 text-sm text-gray-600">
          {entityType === "C-Corp"
            ? "Configure directores y oficiales."
            : "Configure gerentes de la LLC."}
        </p>

        {entityType === "LLC" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-6">
              <div>
                <label className="label">¿Número de gerentes?</label>
                <input
                  className="input w-24"
                  type="number"
                  min={1}
                  step={1}
                  {...register("admin.managersCount", { valueAsNumber: true })}
                />
              </div>

              <div className="flex flex-col">
                <label className="label">
                  ¿Todos los socios y solo los socios son los gerentes?
                </label>
                <Controller
                  name="admin.managersAllOwners"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={(field.value as string) ?? "No"}
                      onChange={field.onChange}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Socios son gerentes"
                      name={field.name}
                    />
                  )}
                />
              </div>
            </div>

            {managersAllOwners === "No" && (
              <div className="mt-6 grid grid-cols-1 gap-4">
                <div>
                  <label className="label">Nombre completo del Gerente 1</label>
                  <input className="input w/full" {...register("admin.manager1Name")} />
                </div>
                <div>
                  <label className="label">Dirección del Gerente 1</label>
                  <Controller
                    name="admin.manager1Address"
                    control={control}
                    render={({ field }) => (
                      <AddressAutocomplete
                        placeholder="Escriba y seleccione la dirección"
                        defaultValue={(field.value as string) ?? ""}
                        onSelect={(addr) => field.onChange(addr.fullAddress)}
                      />
                    )}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* C-Corp — Directores */}
            <div className="mt-2 flex flex-col">
              <label className="label">
                ¿Todos los accionistas y solo los accionistas serán los directores?
              </label>
              <Controller
                name="admin.directorsAllOwners"
                control={control}
                render={({ field }) => (
                  <SegmentedToggle
                    value={(field.value as string) ?? "Yes"}
                    onChange={field.onChange}
                    options={[
                      { value: "Yes", label: "Sí" },
                      { value: "No", label: "No" },
                    ]}
                    ariaLabel="Accionistas serán directores"
                    name={field.name}
                  />
                )}
              />
            </div>

            {directorsAllOwners === "No" && (
              <>
                <div className="mt-6">
                  <label className="label">¿Número de directores?</label>
                  <input
                    className="input w-24"
                    type="number"
                    min={1}
                    step={1}
                    {...register("admin.directorsCount", { valueAsNumber: true })}
                  />
                  <p className="help">Debe elegir al menos un director.</p>
                </div>

                {Array.from({ length: directorsCount || 0 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    <div>
                      <label className="label">Nombre completo del Director {idx + 1}</label>
                      <input
                        className="input"
                        {...register(`admin.director${idx + 1}Name` as const)}
                      />
                    </div>

                    <div>
                      <label className="label">Dirección completa del Director {idx + 1}</label>
                      <Controller
                        name={fp(`admin.director${idx + 1}Address`)}
                        control={control}
                        render={({ field }) => (
                          <AddressAutocomplete
                            placeholder="Escriba y seleccione la dirección"
                            defaultValue={(field.value as string) ?? ""}
                            onSelect={(addr) => field.onChange(addr.fullAddress)}
                          />
                        )}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* C-Corp — Oficiales */}
            <div className="mt-8">
              <label className="label">¿Número de oficiales?</label>
              <input
                className="input w-24"
                type="number"
                min={1}
                step={1}
                {...register("admin.officersCount", { valueAsNumber: true })}
              />
              <p className="help">Debe elegir al menos un oficial con el rol de Presidente.</p>
            </div>

            <div className="mt-6 flex flex-col">
              <label className="label">
                ¿Todos los accionistas y solo los accionistas serán los oficiales?
              </label>
              <Controller
                name="admin.officersAllOwners"
                control={control}
                render={({ field }) => (
                  <SegmentedToggle
                    value={(field.value as string) ?? "Yes"}
                    onChange={field.onChange}
                    options={[
                      { value: "Yes", label: "Sí" },
                      { value: "No", label: "No" },
                    ]}
                    ariaLabel="Accionistas serán oficiales"
                    name={field.name}
                  />
                )}
              />
            </div>

            {officersAllOwners === "No" && (
              <div className="mt-6 grid grid-cols-1 gap-4">
                <div className="w-full">
                  <label className="label">Nombre completo del Oficial 1</label>
                  <input className="input w-full" {...register("admin.officer1Name")} />
                </div>
                <div className="w-full">
                  <label className="label">Dirección del Oficial 1</label>
                  <Controller
                    name="admin.officer1Address"
                    control={control}
                    render={({ field }) => (
                      <AddressAutocomplete
                        placeholder="Escriba y seleccione la dirección"
                        defaultValue={(field.value as string) ?? ""}
                        onSelect={(addr) => field.onChange(addr.fullAddress)}
                      />
                    )}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* footer */}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(3)}>
            Atrás
          </button>
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
              Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}