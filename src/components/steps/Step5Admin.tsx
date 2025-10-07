// src/components/steps/Step5Admin.tsx
"use client";

import { Controller, type FieldPath } from "react-hook-form";
import HeroBanner from "@/components/HeroBanner";
import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import InfoTooltip from "@/components/InfoTooltip";
import type { AllSteps } from "@/lib/schema";
import type { StepProps } from "./types";

// helper for dynamic field paths
const fp = (s: string) => s as unknown as FieldPath<AllSteps>;

export default function Step5Admin({ form, setStep, onSave, onNext }: StepProps) {
  const { control, register, watch, setValue } = form;

  const entityType = watch("company.entityType");

  // C-Corp: directors & officers
  const directorsAllOwners = watch("admin.directorsAllOwners");
  const directorsCount = watch("admin.directorsCount") || 1;

  const officersAllOwners = watch("admin.officersAllOwners");
  const officersCount = watch("admin.officersCount") || 1;

  // LLC: managers
  const managersAllOwners = watch("admin.managersAllOwners");
  const managersCount = watch("admin.managersCount") || 1;

  // Track selected officer roles to prevent duplicates
  const selectedRoles = Array.from({ length: officersCount || 0 }).map((_, idx) => 
    watch(`admin.officer${idx + 1}Role`) as string
  ).filter(role => role && role !== "");

  const availableRoles = ["President", "Vice-President", "Treasurer", "Secretary"];

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
            {/* LLC — Gerentes */}
            <div className="mt-6">
              <div className="flex flex-col">
                <label className="label flex items-center gap-2">
                  ¿Todos los socios y solo los socios son los gerentes?
                  <InfoTooltip
                    title="Gerentes de la LLC"
                    body="Los gerentes son responsables de la gestión diaria de la LLC. Pueden ser socios o personas externas. Si todos los socios son gerentes, significa que cada socio tiene voz y voto en las decisiones operativas."
                  />
                </label>
                <Controller
                  name="admin.managersAllOwners"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={(field.value as string) ?? "Yes"}
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
              <>
                <div className="mt-6">
                  <label className="label">Número de gerentes</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    className="input w-full max-w-xs"
                    placeholder="1"
                    {...register("admin.managersCount", { valueAsNumber: true })}
                  />
                </div>

                {Array.from({ length: managersCount || 0 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    {/* Nombre del Gerente */}
                    <div>
                      <label className="label">Nombre completo del Gerente {idx + 1}</label>
                      <input
                        className="input"
                        {...register(fp(`admin.manager${idx + 1}Name`))}
                      />
                    </div>

                    <div>
                      <label className="label">Dirección del Gerente {idx + 1}</label>
                      <Controller
                        name={fp(`admin.manager${idx + 1}Address`)}
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
          </>
        ) : (
          <>
            {/* C-Corp — Directores */}
            <div className="mt-2 flex flex-col">
              <label className="label flex items-center gap-2">
                ¿Todos los accionistas y solo los accionistas serán los directores?
                <InfoTooltip
                  title="Directores de la Corporación"
                  body="Los directores son responsables de tomar las decisiones estratégicas de la corporación. Si todos los accionistas son directores, significa que cada accionista tiene derecho a participar en las decisiones importantes de la empresa. Esto es común en corporaciones pequeñas donde los accionistas quieren mantener control directo sobre la gestión."
                />
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
                    {/* Nombre del Director */}
                    <div>
                      <label className="label">Nombre completo del Director {idx + 1}</label>
                      <input
                        className="input"
                        {...register(fp(`admin.director${idx + 1}Name`))}
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

            {/* C-Corp — Oficiales (replicated pattern) */}
            <div className="mt-8 flex flex-col">
              <label className="label flex items-center gap-2">
                ¿Todos los accionistas y solo los accionistas serán los oficiales?
                <InfoTooltip
                  title="Oficiales de la Corporación"
                  body="Los oficiales son responsables de las operaciones diarias de la corporación (CEO, CFO, Secretario, etc.). Si todos los accionistas son oficiales, significa que cada accionista puede ocupar un cargo ejecutivo en la empresa. Esto es común en corporaciones pequeñas donde los accionistas quieren participar activamente en la gestión operativa."
                />
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
              <>
                <div className="mt-6">
                  <label className="label">¿Número de oficiales?</label>
                  <input
                    className="input w-24"
                    type="number"
                    min={1}
                    step={1}
                    {...register("admin.officersCount", { valueAsNumber: true })}
                  />
                  <p className="help">
                    Debe elegir al menos un oficial con el rol de Presidente.
                  </p>
                </div>

                {Array.from({ length: officersCount || 0 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4"
                  >
                    {/* Nombre + Rol side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Nombre completo del Oficial {idx + 1}</label>
                        <input
                          className="input"
                          {...register(fp(`admin.officer${idx + 1}Name`))}
                        />
                      </div>
                      <div>
                        <label className="label">Rol</label>
                        <Controller
                          name={fp(`admin.officer${idx + 1}Role`)}
                          control={control}
                          render={({ field }) => {
                            const currentRole = field.value as string;
                            const otherSelectedRoles = selectedRoles.filter((_, roleIdx) => roleIdx !== idx);
                            const availableOptions = availableRoles.filter(role => 
                              !otherSelectedRoles.includes(role)
                            );
                            
                            return (
                              <select
                                className="input"
                                value={currentRole || ""}
                                onChange={(e) => {
                                  field.onChange(e);
                                  // If the new role was previously selected by another officer, clear it
                                  const newRole = e.target.value;
                                  if (newRole && newRole !== "") {
                                    Array.from({ length: officersCount || 0 }).forEach((_, otherIdx) => {
                                      if (otherIdx !== idx) {
                                        const otherRole = watch(`admin.officer${otherIdx + 1}Role`) as string;
                                        if (otherRole === newRole) {
                                          setValue(`admin.officer${otherIdx + 1}Role`, "");
                                        }
                                      }
                                    });
                                  }
                                }}
                              >
                                <option value="">Seleccionar rol</option>
                                {availableOptions.map(role => (
                                  <option key={role} value={role}>
                                    {role}
                                    {currentRole === role ? " (Seleccionado)" : ""}
                                  </option>
                                ))}
                              </select>
                            );
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Dirección del Oficial {idx + 1}</label>
                      <Controller
                        name={fp(`admin.officer${idx + 1}Address`)}
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
          </>
        )}

        {/* footer */}
        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button
            type="button"
            className="btn"
            onClick={() => {
              // Go back one step reliably (supports functional updater if provided)
              try {
                (setStep as unknown as (u: (n: number) => number) => void)((n) =>
                  Math.max(1, n - 1)
                );
              } catch {
                setStep(2);
              }
            }}
          >
            Atrás
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-base underline text-blue-600 hover:text-blue-700"
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