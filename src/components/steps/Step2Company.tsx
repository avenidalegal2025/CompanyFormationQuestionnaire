"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Controller, type UseFormReturn } from "react-hook-form";

import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { type AllSteps } from "@/lib/schema";

type Props = {
  form: UseFormReturn<AllSteps>;
  setStep: (n: number) => void;
};

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

export default function Step2Company({ form, setStep }: Props) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = form;

  // ====== Entity type / dynamic suffix ======
  const entityType = watch("company.entityType");
  const companyNameBase = (watch("company.companyNameBase") || "").toUpperCase();
  const suffixWord = entityType === "C-Corp" ? "INC" : "LLC";

  // keep the computed name in sync
  useEffect(() => {
    const base = companyNameBase.replace(/\s+(LLC|INC)\.?$/i, "").trim();
    const full = base ? `${base} ${suffixWord}` : "";
    setValue("company.companyName", full, { shouldValidate: true });
  }, [companyNameBase, entityType, setValue, suffixWord]);

  // ====== Toggles ======
  const hasUsaAddress = watch("company.hasUsaAddress");
  const hasUsPhone = watch("company.hasUsPhone");

  // ====== Phone helpers (+1 XXX XXX XXXX) ======
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
      {/* HERO (single instance inside this step) */}
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
            <div className="label-lg mb-2">Estado donde desea formar su empresa</div>
            <select className="input" {...register("company.formationState", { required: true })}>
              {formationStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="help">{(errors.company?.formationState?.message as unknown as string) || ""}</p>
          </div>

          <div>
            <div className="label-lg mb-2">Tipo de entidad</div>
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

        {/* Nombre + botón revisar */}
        <div className="mt-6">
          <div className="label-lg mb-2">Nombre de la empresa</div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Controller
              name="company.companyNameBase"
              control={control}
              render={({ field }) => (
                <input
                  className="input uppercase w-full"
                  value={(field.value || "").toUpperCase()}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
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
          <p className="help">{(errors.company?.companyName?.message as unknown as string) || ""}</p>
        </div>

        {/* Dirección */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿Cuenta con una dirección en USA para su empresa?</div>
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
                setValue("company.addressLine1", addr.line1, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("company.addressLine2", "", { shouldDirty: true });
                setValue("company.city", addr.city, { shouldDirty: true, shouldValidate: true });
                setValue("company.state", addr.state, { shouldDirty: true, shouldValidate: true });
                setValue("company.postalCode", addr.postalCode, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("company.country", "Estados Unidos de América", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Dirección línea 1</label>
                <input className="input" {...register("company.addressLine1")} />
              </div>
              <div>
                <label className="label">Dirección línea 2</label>
                <input className="input" {...register("company.addressLine2")} />
              </div>
              <div>
                <label className="label">Ciudad</label>
                <input className="input" {...register("company.city")} />
              </div>
              <div>
                <label className="label">Estado/Provincia</label>
                <input className="input" {...register("company.state")} />
              </div>
              <div>
                <label className="label">Código postal</label>
                <input className="input" {...register("company.postalCode")} />
              </div>
              <div>
                <label className="label">País</label>
                <input className="input" value="Estados Unidos de América" readOnly />
              </div>
            </div>
          </div>
        )}

        {/* Teléfono */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿Cuenta con número de teléfono de USA de su empresa?</div>
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
              ref={(el) => {
                // FIX: return void, not the element
                phoneRef.current = el;
              }}
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

        {/* Acciones */}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(1)}>
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
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}