// src/components/steps/Step2Company.tsx
"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Controller } from "react-hook-form";

import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

const formationStates = [
  "Florida",
  "Delaware",
  "Wyoming",
  "Texas",
  "Nevada",
  "New Mexico",
  "Georgia",
  "California",
  "Arizona",
];

const entityTypes = ["LLC", "C-Corp"] as const;

const formatWithCommas = (s: string) =>
  s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const parseDigits = (s: string) => s.replace(/[^\d]/g, "");

export default function Step2Company({ form, setStep, onSave, onNext }: StepProps) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = form;

  const entityType = watch("company.entityType");
  const companyNameBase = (watch("company.companyNameBase") || "").toUpperCase();
  const suffixWord = entityType === "C-Corp" ? "Inc" : "LLC";

  useEffect(() => {
    const base = companyNameBase.replace(/\s+(LLC|INC)\.?$/i, "").trim();
    const full = base ? `${base} ${suffixWord}` : "";
    setValue("company.companyName", full, { shouldValidate: true });
  }, [companyNameBase, entityType, setValue, suffixWord]);

  const hasUsaAddress = watch("company.hasUsaAddress");
  const hasUsPhone = watch("company.hasUsPhone");

  const PHONE_PREFIX = "+1 ";
  const phoneRef = useRef<HTMLInputElement | null>(null);

  const formatUsPhone = (rawDigits: string) => {
    const d = rawDigits.slice(0, 10);
    const a = d.slice(0, 3);
    const b = d.slice(3, 6);
    const c = d.slice(6, 10);
    if (d.length <= 3) return `${PHONE_PREFIX}${a}`;
    if (d.length <= 6) return `${PHONE_PREFIX}${a} ${b}`;
    return `${PHONE_PREFIX}${a} ${b} ${c}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    const dropCountry = digits.startsWith("1") ? digits.slice(1) : digits;
    const formatted = formatUsPhone(dropCountry);
    setValue("company.usPhoneNumber", formatted, { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      const node = phoneRef.current;
      if (!node) return;
      const pos = Math.max(node.selectionStart ?? formatted.length, PHONE_PREFIX.length);
      node.setSelectionRange(pos, pos);
    });
  };

  const preventDeletePrefix = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (
      (e.key === "Backspace" && start <= PHONE_PREFIX.length && end <= PHONE_PREFIX.length) ||
      (e.key === "Delete" && start < PHONE_PREFIX.length)
    ) {
      e.preventDefault();
    }
  };

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
        <h2 className="text-xl font-semibold text-gray-900">Datos de la empresa</h2>
        <p className="mt-1 text-sm text-gray-600">Cuéntanos sobre la nueva empresa</p>

        {/* Estado / Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="label-lg">Estado donde desea formar su empresa</div>
              <InfoTooltip
                title="Estado"
                body="¿No sabes cual es el mejor estado para tu nueva empresa? Lee nuestro artículo:"
              />
            </div>
            <select className="input" {...register("company.formationState", { required: true })}>
              {formationStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="help">{(errors.company?.formationState?.message as string) || ""}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="label-lg">Tipo de entidad</div>
              <InfoTooltip
                title="LLC | C-Corp"
                body="¿No sabes si crear una LLC o C-Corp? Lee nuestro artículo:"
              />
            </div>
            <Controller
              name="company.entityType"
              control={control}
              render={({ field }) => (
                <SegmentedToggle
                  value={(field.value as string) ?? "LLC"}
                  onChange={field.onChange}
                  options={entityTypes.map((v) => ({ value: v, label: v }))}
                  ariaLabel="Tipo de entidad"
                  name={field.name}
                />
              )}
            />
          </div>
        </div>

        {/* Nombre empresa */}
        <div className="mt-6">
          <div className="label-lg mb-2">Nombre de la empresa</div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Controller
              name="company.companyNameBase"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <input
                    className="input uppercase w-full"
                    value={(field.value || "").toUpperCase()}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                  <span className="text-gray-700">{suffixWord}</span>
                </div>
              )}
            />
            <button
              type="button"
              className="btn btn-primary text-sm px-4 py-2"
              onClick={() =>
                alert("Puedes continuar en lo que revisamos si tu nombre está disponible.")
              }
            >
              Revisar disponibilidad
            </button>
          </div>
          <input type="hidden" {...register("company.companyName")} />
        </div>

        {/* Dirección */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿Cuenta con una dirección en USA para su empresa?</div>
          <p className="help">
            No puede ser P.O. BOX. Si no cuenta con una nosotros le podemos proveer una por $600 usd
            al año.
          </p>
          <Controller
            name="company.hasUsaAddress"
            control={control}
            render={({ field }) => (
              <SegmentedToggle
                value={(field.value as string) ?? "No"}
                onChange={(v) => {
                  field.onChange(v);
                  if (v === "Yes") {
                    setValue("company.country", "Estados Unidos de América", { shouldDirty: true });
                    setValue("company.state", getValues("company.formationState"), {
                      shouldDirty: true,
                    });
                  }
                }}
                options={[
                  { value: "Yes", label: "Sí" },
                  { value: "No", label: "No" },
                ]}
                ariaLabel="Cuenta con dirección en USA"
                name={field.name}
              />
            )}
          />
        </div>

        {hasUsaAddress === "Yes" && (
          <div className="mt-4 space-y-4">
            <AddressAutocomplete
              country="us"
              placeholder="1600 Pennsylvania Ave NW, Washington"
              onSelect={(addr) => {
                setValue("company.addressLine1", addr.line1, { shouldDirty: true, shouldValidate: true });
                setValue("company.city", addr.city, { shouldDirty: true, shouldValidate: true });
                setValue("company.state", addr.state, { shouldDirty: true, shouldValidate: true });
                setValue("company.postalCode", addr.postalCode, { shouldDirty: true, shouldValidate: true });
                setValue("company.country", "Estados Unidos de América", { shouldDirty: true, shouldValidate: true });
              }}
            />
          </div>
        )}

        {/* Teléfono */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿Cuenta con número de teléfono de USA de su empresa?</div>
          <p className="help">
            Si no cuenta con uno, nosotros se lo podemos proveer por $180 usd al año.
          </p>
          <Controller
            name="company.hasUsPhone"
            control={control}
            render={({ field }) => (
              <SegmentedToggle
                value={(field.value as string) ?? "No"}
                onChange={field.onChange}
                options={[
                  { value: "Yes", label: "Sí" },
                  { value: "No", label: "No" },
                ]}
                ariaLabel="Cuenta con número de teléfono USA"
                name={field.name}
              />
            )}
          />
        </div>

        {hasUsPhone === "Yes" && (
          <div className="mt-4">
            <label className="label">Número de teléfono (USA)</label>
            <input
              ref={(el) => (phoneRef.current = el)}
              className="input"
              inputMode="numeric"
              autoComplete="tel"
              value={watch("company.usPhoneNumber") || "+1 "}
              onChange={handlePhoneChange}
              onKeyDown={preventDeletePrefix}
            />
            <p className="help">Formato: +1 305 555 0123</p>
          </div>
        )}

        {/* Business Purpose */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿A qué se dedica la empresa?</div>
          <textarea className="input min-h-[120px]" {...register("company.businessPurpose")} />
        </div>

        {/* Número de acciones (C-Corp only) */}
        {entityType === "C-Corp" && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="label-lg">Número de acciones</div>
              <InfoTooltip
                title="Número de acciones"
                body="¿No sabes cuántas acciones emitir? Lee nuestro artículo:"
              />
            </div>
            {(() => {
              const shares = watch("company.numberOfShares");
              const digits = typeof shares === "number" ? String(shares) : "";
              const display = digits ? formatWithCommas(digits) : "";

              const onChangeShares = (e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = parseDigits(e.target.value);
                if (raw === "") {
                  setValue("company.numberOfShares", undefined as unknown as number, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                } else {
                  setValue("company.numberOfShares", Number(raw) as unknown as number, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
              };

              return (
                <input
                  type="text"
                  inputMode="numeric"
                  className="input w-24"
                  value={display}
                  onChange={onChangeShares}
                  placeholder="Ej: 10,000"
                />
              );
            })()}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-sm underline text-primary-600"
              onClick={() => void onSave?.()}
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (onNext ? void onNext() : setStep(3))}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

