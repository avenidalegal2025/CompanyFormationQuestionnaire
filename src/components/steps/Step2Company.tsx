// src/components/steps/Step2Company.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function formatWithCommas(n: number | string | undefined): string {
  if (n === undefined || n === null || n === "") return "";
  const s = typeof n === "number" ? String(n) : n.replace(/[, ]+/g, "");
  if (s === "") return "";
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function Step2Company({ form, setStep, onSave, onNext }: StepProps) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = form;

  // ====== Entity type / dynamic suffix ======
  const entityType = watch("company.entityType") as "LLC" | "C-Corp" | undefined;
  const companyNameBase = (watch("company.companyNameBase") || "").toString();
  const suffixWord = useMemo(() => (entityType === "C-Corp" ? "Inc" : "LLC"), [entityType]);

  // keep the computed name in sync with a SPACE before the suffix (e.g., "ACME LLC")
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

  // ====== Controlled display for numberOfShares (commas in UI, number in form) ======
  const watchedShares = watch("company.numberOfShares") as number | undefined;
  const [sharesDisplay, setSharesDisplay] = useState<string>(formatWithCommas(watchedShares));

  useEffect(() => {
    // keep UI in sync if value changes externally (load/reset)
    setSharesDisplay(formatWithCommas(watchedShares));
  }, [watchedShares]);

  const onSharesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[, ]+/g, "");
    if (/^\d*$/.test(raw)) {
      setSharesDisplay(formatWithCommas(raw));
      // Save as number (or undefined if empty)
      setValue(
        "company.numberOfShares",
        raw === "" ? (undefined as unknown as number) : Number(raw),
        { shouldDirty: true, shouldValidate: true }
      );
    }
  };

  // ====== For suffix positioning right after typed text ======
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);
  const [suffixLeft, setSuffixLeft] = useState<number>(0);

  // Measure the visible width of the typed text + a space, then place the suffix there.
  useEffect(() => {
    const input = nameInputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;

    // mirror the input value (uppercase) plus one space before the suffix
    mirror.textContent = `${companyNameBase.toUpperCase()} `;

    // copy font styles so measurement matches
    const cs = getComputedStyle(input);
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.fontWeight = cs.fontWeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.padding = cs.padding; // padding matters for left inset
    mirror.style.border = "0";

    const padLeft = parseFloat(cs.paddingLeft || "0");
    const rect = mirror.getBoundingClientRect();
    const width = rect.width;

    // left position inside the input: padding-left + text width
    setSuffixLeft(padLeft + width);
  }, [companyNameBase]);

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
        {/* (1) Removed the tooltip that used to sit on the section title per your request */}

        {/* Estado / Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-6">
          <div>
            <div className="label-lg mb-2 flex items-center gap-2">
              Estado donde desea formar su empresa
              <InfoTooltip
                title="Estado"
                body={`¿No sabes cual es el mejor estado para tu nueva empresa?\nLee nuestro artículo:`}
              />
            </div>
            <select className="input" {...register("company.formationState", { required: true })}>
              {formationStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="help">
              {(errors.company?.formationState?.message as unknown as string) || ""}
            </p>
          </div>

          <div>
            <div className="label-lg mb-2 flex items-center gap-2">
              Tipo de entidad
              <InfoTooltip
                title="LLC o C-Corp"
                body={`¿ No sabes si crear una LLC o C-Corp?\nLee nuestro artículo:`}
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

        {/* Nombre + sufijo inmediato + botón revisar */}
        <div className="mt-6">
          <div className="label-lg mb-2">Nombre de la empresa</div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="relative">
              {/* The input itself */}
              <Controller
                name="company.companyNameBase"
                control={control}
                render={({ field }) => (
                  <input
                    ref={nameInputRef}
                    className="input uppercase w-full"
                    value={field.value?.toString().toUpperCase() ?? ""}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                )}
              />

              {/* Invisible mirror to measure text width */}
              <span
                ref={mirrorRef}
                aria-hidden
                className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 whitespace-pre text-transparent"
                style={{
                  visibility: "hidden",
                }}
              />

              {/* Suffix placed exactly after the typed text (one space) */}
              {companyNameBase.trim() !== "" && (
                <span
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-gray-500"
                  style={{ left: suffixLeft }}
                >
                  {suffixWord}
                </span>
              )}
            </div>
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
          <p className="help">
            {(errors.company?.companyName?.message as unknown as string) || ""}
          </p>
        </div>

        {/* Dirección */}
        <div className="mt-6">
          <div className="label-lg mb-1">¿Cuenta con una dirección en USA para su empresa?</div>
          <p className="text-sm text-gray-600">
            No puede ser P.O. BOX. Si no cuenta con una nosotros le podemos proveer una por $600
            usd al año.
          </p>
          <div className="mt-2">
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
          <div className="label-lg mb-1">¿Cuenta con número de teléfono de USA de su empresa?</div>
          <p className="text-sm text-gray-600">
            Si no cuenta con uno, nosotros se lo podemos proveer por $180 usd al año.
          </p>
          <div className="mt-2">
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
        </div>

        {hasUsPhone === "Yes" && (
          <div className="mt-4">
            <label className="label">Número de teléfono (USA)</label>
            <input
              ref={(el) => {
                // Important: do not return anything from this callback (fixes TS build error)
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

        {/* A qué se dedica la empresa (moved here, under phone section) */}
        <div className="mt-6">
          <div className="label-lg mb-2">¿A qué se dedica la empresa?</div>
          <textarea
            className="input min-h-[120px]"
            placeholder="Describe brevemente el objeto o giro de la empresa…"
            {...register("company.businessPurpose")}
          />
        </div>

        {/* Número de acciones (under businessPurpose) */}
        {entityType === "C-Corp" && (
          <div className="mt-6">
            <div className="label-lg mb-2 flex items-center gap-2">
              Número de acciones
              <InfoTooltip
                title="Número de acciones"
                body={`¿ No sabes cuántas acciones emitir?\nLee nuestro artículo:`}
              />
            </div>
            <div className="w-[20%] min-w-[140px]">
              <input
                type="text"
                inputMode="numeric"
                step="1"
                className="input"
                value={sharesDisplay}
                onChange={onSharesChange}
                placeholder="10,000"
              />
            </div>
            <p className="help">
              {(errors.company?.numberOfShares?.message as unknown as string) || ""}
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-8 flex items-center justify-between">
          {/* (6) No back button on this first step */}
          <div />
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