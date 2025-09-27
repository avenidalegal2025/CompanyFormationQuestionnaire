// src/components/steps/Step3Owners.tsx
"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import SSNEINInput from "@/components/SSNEINInput";
import type { StepProps } from "./types";

const MAX_OWNERS = 6;

export default function Step3Owners({ form, setStep, onSave, onNext }: StepProps) {
  const { register, control, watch, setValue } = form;

  // Loosen types ONLY for ad-hoc (non-schema) paths without using `any`
  const w = watch as unknown as (name: string) => unknown;
  const reg = (name: string) => register(name as never);

  // Entity type decides wording
  const entityType = watch("company.entityType") as "LLC" | "C-Corp" | undefined;
  const isCorp = entityType === "C-Corp";
  const groupLabel = isCorp ? "accionistas" : "socios";
  const singleLabel = isCorp ? "Accionista" : "Socio";

  // How many blocks to render (stored at root as ownersCount)
  const ownersCount = (w("ownersCount") as number | undefined) ?? 1;

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">
          Datos de los {groupLabel}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Indique el número de {groupLabel} y complete sus datos.
        </p>

        {/* Número de accionistas/socios */}
        <div className="mt-6">
          <label className="label">Número de {groupLabel}</label>
          <input
            type="number"
            min={1}
            max={MAX_OWNERS}
            className="input w-full max-w-xs"
            {...reg("ownersCount")}
            onChange={(e) => {
              const n = Math.max(1, Math.min(MAX_OWNERS, Number(e.target.value) || 1));
              setValue("ownersCount" as never, n as never, { shouldDirty: true });
            }}
          />
          <p className="help">Define cuántos bloques se muestran debajo (1 a {MAX_OWNERS}).</p>
        </div>

        {/* Owners blocks */}
        <div className="mt-6 space-y-8">
          {Array.from({ length: ownersCount }).map((_, i) => {
            const base = `owners.${i}`;
            const residentKey = `${base}.isUsCitizen`;
            const resident = w(residentKey) as "Yes" | "No" | undefined;

            return (
              <div key={i} className="rounded-2xl border p-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {singleLabel} {i + 1}
                </h3>

                {/* Name + %: name wider (~2/3), % narrower (~1/3) */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                  <div>
                    <label className="label">Nombre completo</label>
                    <input className="input" {...reg(`${base}.fullName`)} />
                  </div>

                  <div>
                    <label className="label">Porcentaje de propiedad (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="input"
                      {...reg(`${base}.ownership`)}
                    />
                  </div>
                </div>

                {/* Dirección completa */}
                <div className="mt-4">
                  <label className="label">Dirección completa</label>
                  <input
                    className="input"
                    {...reg(`${base}.address`)}
                    placeholder="Escriba y seleccione la dirección"
                  />
                </div>

                {/* ¿Es ciudadano/residente de EE.UU.? */}
                <div className="mt-4">
                  <div className="label-lg mb-2">
                    ¿El {singleLabel.toLowerCase()} es ciudadano o residente de los Estados Unidos?
                  </div>
                  <Controller
                    name={residentKey as never}
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={(field.value as string) ?? "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Residencia en EE.UU."
                        name={field.name}
                      />
                    )}
                  />
                </div>

                {/* Conditional: Single SSN/EIN (US) or Passport (non-US) */}
                {resident === "Yes" ? (
                  <div className="mt-4">
                    <Controller
                      name={`${base}.tin` as never} // store raw digits only
                      control={control}
                      render={({ field }) => (
                        <SSNEINInput
                          value={(field.value as string) ?? ""}
                          onChange={(digits) => field.onChange(digits)}
                          label="SSN / EIN"
                        />
                      )}
                    />
                  </div>
                ) : (
                  <div className="mt-4">
                    <label className="label">
                      Subir imagen de pasaporte vigente (.png o .jpeg)
                    </label>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg"
                      className="block w-full rounded-xl border border-dashed p-6 text-sm text-gray-600"
                      {...reg(`${base}.passportImage`)}
                    />
                    <p className="help">Arrastrar y soltar o buscar archivo.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            className="btn"
            onClick={() => {
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
              className="text-sm underline text-blue-600 hover:text-blue-700"
              onClick={() => void onSave?.()}
            >
              Guardar y continuar más tarde
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (onNext ? void onNext() : setStep(4))}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}