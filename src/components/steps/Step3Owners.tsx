"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  Controller,
  useFieldArray,
  type UseFormReturn,
} from "react-hook-form";

import SegmentedToggle from "@/components/SegmentedToggle";
import RHFAddressAutocomplete from "@/components/RHFAddressAutocomplete";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

export default function Step3Owners({ form, setStep }: Props) {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  // ===== Entity text (socio/accionista) =====
  const entityType = watch("company.entityType");
  const ownerPlural = entityType === "C-Corp" ? "accionistas" : "socios";
  const ownerSingular = entityType === "C-Corp" ? "Accionista" : "Socio";

  // ===== Owners array controls =====
  const ownersArray = useFieldArray({
    control,
    name: "owners",
  });

  const [ownersCountInput, setOwnersCountInput] = useState<string>(
    String(ownersArray.fields.length || 1)
  );

  const ownersCount = useMemo<number>(() => {
    const n = Number(ownersCountInput || "1");
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(6, Math.trunc(n)));
  }, [ownersCountInput]);

  // Keep field array size in sync with ownersCount
  useEffect(() => {
    const current = ownersArray.fields.length;
    if (ownersCount > current) {
      for (let i = current; i < ownersCount; i++) {
        ownersArray.append({
          fullName: "",
          addressFull: "",
          ownership: undefined,
          isUsResident: "No",
          ssn: "",
          passportFileName: "",
        });
      }
    } else if (ownersCount < current) {
      for (let i = current - 1; i >= ownersCount; i--) {
        ownersArray.remove(i);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersCount]);

  // ===== Percent sum =====
  const percentSum = (watch("owners") || [])
    .map((o) => (typeof o?.ownership === "number" ? o.ownership : Number(o?.ownership ?? 0)))
    .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  // ===== SSN/ITIN formatter =====
  const formatSSN = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 9);
    const a = d.slice(0, 3);
    const b = d.slice(3, 5);
    const c = d.slice(5, 9);
    if (d.length <= 3) return a;
    if (d.length <= 5) return `${a}-${b}`;
    return `${a}-${b}-${c}`;
  };

  // file input refs are not required; we just watch/set names

  return (
    <section className="space-y-6">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-2xl">
        <Image
          src="/miami.jpg"
          alt="Miami skyline"
          fill
          priority
          sizes="(min-width: 768px) 900px, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="text-white text-2xl sm:text-3xl font-semibold tracking-tight">
            Crea una empresa en Estados Unidos
          </h1>
        </div>
      </div>

      {/* CARD */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">
          Datos de los {ownerPlural}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Indique el número de {ownerPlural} y complete sus datos.
        </p>

        {/* Count */}
        <div className="mt-6">
          <label className="label">Número de {ownerPlural}</label>
          <input
            className="input w-[20%] min-w-24"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={ownersCountInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const digits = e.target.value.replace(/\D/g, "");
              setOwnersCountInput(digits);
            }}
            onBlur={() => {
              if (ownersCountInput === "") setOwnersCountInput("1");
              else setOwnersCountInput(String(ownersCount));
            }}
            placeholder="1–6"
          />
          <p className="help">
            Define cuántos bloques se muestran debajo (1 a 6).
          </p>
        </div>

        {/* Owners list */}
        <div className="mt-4 space-y-6">
          {ownersArray.fields.map((field, idx) => {
            const resident = watch(`owners.${idx}.isUsResident`);
            return (
              <div key={field.id} className="rounded-2xl border border-gray-100 p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">
                  {ownerSingular} {idx + 1}
                </div>

                <div className="grid grid-cols-12 gap-4">
                  {/* Name */}
                  <div className="col-span-12 md:col-span-9">
                    <label className="label">Nombre completo</label>
                    <input
                      className="input"
                      {...register(`owners.${idx}.fullName`)}
                    />
                    {errors.owners?.[idx]?.fullName?.message && (
                      <p className="help">
                        {String(errors.owners?.[idx]?.fullName?.message)}
                      </p>
                    )}
                  </div>

                  {/* Percentage */}
                  <div className="col-span-12 md:col-span-3">
                    <label className="label">Porcentaje</label>
                    <input
                      className="input w-24"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      {...register(`owners.${idx}.ownership`, {
                        valueAsNumber: true,
                      })}
                    />
                    {errors.owners?.[idx]?.ownership?.message && (
                      <p className="help">
                        {String(errors.owners?.[idx]?.ownership?.message)}
                      </p>
                    )}
                  </div>

                  {/* Address full (with autocomplete) */}
                  <div className="col-span-12">
                    <label className="label">Dirección completa</label>
                    <RHFAddressAutocomplete
                      name={`owners.${idx}.addressFull`}
                      control={control}
                    />
                    {errors.owners?.[idx]?.addressFull?.message && (
                      <p className="help">
                        {String(errors.owners?.[idx]?.addressFull?.message)}
                      </p>
                    )}
                  </div>

                  {/* Residency toggle */}
                  <div className="col-span-12">
                    <div className="mb-2">
                      <div className="label">
                        {entityType === "C-Corp"
                          ? "¿El accionista es residente de los Estados Unidos?"
                          : "¿El socio es residente de los Estados Unidos?"}
                      </div>
                    </div>
                    <Controller
                      name={`owners.${idx}.isUsResident`}
                      control={control}
                      render={({ field }) => (
                        <SegmentedToggle
                          value={field.value ?? "No"}
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

                  {/* SSN / ITIN when resident */}
                  {resident === "Yes" && (
                    <div className="col-span-12 md:col-span-6">
                      <label className="label">SSN / ITIN</label>
                      <Controller
                        name={`owners.${idx}.ssn`}
                        control={control}
                        render={({ field }) => (
                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder="123-45-6789"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(formatSSN(e.target.value))}
                          />
                        )}
                      />
                      <p className="help">Formato automático: 123-45-6789</p>
                    </div>
                  )}

                  {/* Passport upload when NOT resident */}
                  {resident === "No" && (
                    <div className="col-span-12">
                      <label className="label">
                        Subir imagen de pasaporte vigente (.png o .jpeg)
                      </label>
                      <div className="border-2 border-dashed rounded-xl p-6 text-center">
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          id={`passport-file-${idx}`}
                          {...register(`owners.${idx}.passportFile`, {
                            onChange: (e) => {
                              const input = e.target as HTMLInputElement;
                              const file = input.files?.[0];
                              setValue(
                                `owners.${idx}.passportFileName`,
                                file?.name ?? "",
                                { shouldDirty: true }
                              );
                            },
                          })}
                        />
                        <label
                          htmlFor={`passport-file-${idx}`}
                          className="cursor-pointer inline-block px-4 py-2 rounded-xl border text-sm"
                        >
                          Arrastrar y soltar o{" "}
                          <span className="underline">buscar archivo</span>
                        </label>
                        <div className="mt-3 text-sm text-gray-600">
                          {(watch(`owners.${idx}.passportFileName`) ?? "") !== "" ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-green-600">●</span>
                              {watch(`owners.${idx}.passportFileName`)}
                            </span>
                          ) : (
                            "Sin archivo seleccionado"
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sum helper */}
        <div className="mt-4 mb-6 text-sm text-gray-700">
          Suma de porcentajes:{" "}
          <span
            className={
              percentSum === 100
                ? "font-semibold text-brand-600"
                : "font-semibold text-red-600"
            }
          >
            {percentSum.toFixed(2)}%
          </span>{" "}
          (debe ser 100%)
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(2)}>
            Atrás
          </button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-sm text-gray-700 hover:underline"
              onClick={() => alert("Se guardará como borrador…")}
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(4)}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}