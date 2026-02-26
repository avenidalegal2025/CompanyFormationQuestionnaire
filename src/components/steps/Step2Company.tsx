// src/components/steps/Step2Company.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HeroMiami2 from "@/components/HeroMiami2";
import { Controller } from "react-hook-form";

import SegmentedToggle from "@/components/SegmentedToggle";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import InternationalPhoneInput from "@/components/InternationalPhoneInput";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import CompanyNameCheckButton from "./CompanyNameCheckButton";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

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

const entityTypes = ["LLC", "C-Corp", "S-Corp"] as const;

function formatWithCommas(n: number | string | undefined): string {
  if (n === undefined || n === null || n === "") return "";
  const s = typeof n === "number" ? String(n) : n.replace(/[, ]+/g, "");
  if (s === "") return "";
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface Step2CompanyProps extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step2Company({ form, setStep, onSave, onNext, session, anonymousId }: Step2CompanyProps) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = form;

  // ====== Entity type / suffix ======
  const entityType = watch("company.entityType") as "LLC" | "C-Corp" | "S-Corp" | undefined;
  const formationState = watch("company.formationState") as string | undefined;
  const companyNameBase = (watch("company.companyNameBase") || "").toString();
  const entitySuffix = watch("company.entitySuffix") as string | undefined;

  // Modal state for S-Corp
  const [showSCorpModal, setShowSCorpModal] = useState(false);
  const [pendingEntityType, setPendingEntityType] = useState<string | null>(null);
  const entityTypeFieldRef = useRef<((value: string) => void) | null>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showSCorpModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showSCorpModal]);

  // Entity suffix options based on entity type
  const entitySuffixOptions = useMemo(() => {
    if (entityType === "LLC") {
      return [
        "LLC",
        "L.L.C.",
        "Limited Liability Company"
      ];
    } else if (entityType === "C-Corp") {
      return [
        "Corp",
        "Corporation",
        "Inc",
        "Incorporated"
      ];
    } else if (entityType === "S-Corp") {
      return [
        "Corp",
        "Corporation",
        "Inc",
        "Incorporated"
      ];
    }
    return [];
  }, [entityType]);

  // Set default entity type on mount
  useEffect(() => {
    if (!entityType) {
      setValue("company.entityType", "LLC", { shouldValidate: true });
    }
  }, [entityType, setValue]);

  // Set default suffix when entity type changes
  useEffect(() => {
    if (entityType === "LLC" && !entitySuffix) {
      setValue("company.entitySuffix", "LLC", { shouldValidate: true });
    } else if (entityType === "C-Corp" && !entitySuffix) {
      setValue("company.entitySuffix", "Inc", { shouldValidate: true });
    } else if (entityType === "S-Corp" && !entitySuffix) {
      setValue("company.entitySuffix", "Inc", { shouldValidate: true });
    }
  }, [entityType, entitySuffix, setValue]);

  // Handle entity type change - show modal for S-Corp
  const handleEntityTypeChange = (newType: string) => {
    if (newType === "S-Corp") {
      setPendingEntityType(newType);
      setShowSCorpModal(true);
    } else {
      setValue("company.entityType", newType as "LLC" | "C-Corp" | "S-Corp", { shouldValidate: true });
    }
  };

  // Handle S-Corp modal OK
  const handleSCorpModalOK = () => {
    if (pendingEntityType) {
      setValue("company.entityType", pendingEntityType as "LLC" | "C-Corp" | "S-Corp", { shouldValidate: true });
    }
    setShowSCorpModal(false);
    setPendingEntityType(null);
  };

  // Handle S-Corp modal Cancel
  const handleSCorpModalCancel = () => {
    setShowSCorpModal(false);
    setPendingEntityType(null);
    // Always default to LLC when cancel is clicked
    // Use both setValue and field.onChange to ensure toggle updates
    setValue("company.entityType", "LLC", { shouldValidate: true });
    if (entityTypeFieldRef.current) {
      entityTypeFieldRef.current("LLC");
    }
  };

  // Build full company name from base + suffix
  useEffect(() => {
    const base = companyNameBase.trim();
    const suffix = entitySuffix || "";
    const full = base && suffix ? `${base} ${suffix}` : base;
    setValue("company.companyName", full, { shouldValidate: true });
  }, [companyNameBase, entitySuffix, setValue]);

  // ====== Company Name Validation ======
  // Check if company name contains reserved suffixes
  const RESERVED_SUFFIXES = [
    'LLC', 'L.L.C.', 'Limited Liability Company',
    'Corp', 'Corporation', 'Inc', 'Incorporated',
    'Co', 'Company', 'Ltd', 'Limited'
  ];
  
  const hasReservedSuffix = useMemo(() => {
    const name = companyNameBase.trim().toUpperCase();
    if (!name) return false;
    
    return RESERVED_SUFFIXES.some(suffix => {
      const upperSuffix = suffix.toUpperCase();
      // Check if name ends with the suffix (with optional period and spaces)
      const pattern = new RegExp(`\\b${upperSuffix.replace(/\./g, '\\.?')}\\s*$`, 'i');
      return pattern.test(name);
    });
  }, [companyNameBase]);

  // ====== Toggles ======
  const hasUsaAddress = watch("company.hasUsaAddress");
  const hasUsPhone = watch("company.hasUsPhone");
  const forwardPhoneE164 = watch("company.forwardPhoneE164") as string | undefined;

  // Watch address fields so they update when setValue() is called from autocomplete
  const addressLine1 = watch("company.addressLine1") as string | undefined;
  const addressLine2 = watch("company.addressLine2") as string | undefined;
  const addressCity = watch("company.city") as string | undefined;
  const addressState = watch("company.state") as string | undefined;
  const addressPostalCode = watch("company.postalCode") as string | undefined;


  // ====== Phone helpers (+1 XXX XXX XXXX) ======
  const PHONE_PREFIX = "+1 ";
  const phoneRef = useRef<HTMLInputElement | null>(null);

  // Ensure default value so conditional UI shows correctly on first render
  useEffect(() => {
    if (!hasUsPhone) {
      setValue("company.hasUsPhone", "No", { shouldValidate: true });
    }
  }, [hasUsPhone, setValue]);

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

  // ====== Refs for form elements ======
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="space-y-6">
      {/* HERO */}
      <HeroMiami2 title="Crea una empresa en Estados Unidos" />

      {/* CARD */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Datos de la empresa</h2>

        {/* Estado / Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-6">
          <div>
            <div className="label-lg mb-2 flex items-center gap-2">
              Estado donde desea formar su empresa
              <InfoTooltip
                title="Estado"
                body={`¿No sabes cual es el mejor estado para tu nueva empresa?\nLee nuestro artículo:`}
                linkUrl="https://avenidalegal.com/todo-lo-que-debes-saber-para-elegir-el-mejor-estado-para-abrir-tu-llc/"
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
                linkUrl="https://avenidalegal.com/llc-vs-c-corp-cual-te-conviene-mas-y-por-que/"
              />
            </div>
            <Controller
              name="company.entityType"
              control={control}
              render={({ field }) => {
                // Store field.onChange in ref so we can use it in cancel handler
                entityTypeFieldRef.current = field.onChange;
                return (
                  <div className="w-fit">
                    <SegmentedToggle
                      value={(field.value as string) ?? "LLC"}
                      onChange={(v) => {
                        if (v === "S-Corp") {
                          // Don't update form value yet - wait for modal confirmation
                          handleEntityTypeChange(v);
                        } else {
                          // For LLC and C-Corp, update immediately
                          handleEntityTypeChange(v);
                          field.onChange(v);
                        }
                      }}
                      options={entityTypes.map((v) => ({ value: v, label: v }))}
                      ariaLabel="Tipo de entidad"
                      name={field.name}
                    />
                  </div>
                );
              }}
            />
          </div>
        </div>

        {/* Nombre + sufijo + botón revisar */}
        <div className="mt-12 pt-10 border-t border-gray-100">
          <div className="label-lg mb-2">Nombre de la empresa</div>
          <div className="flex items-center gap-[10px]">
            <div className="w-[37.5%]">
              <Controller
                name="company.companyNameBase"
                control={control}
                render={({ field }) => (
                  <div>
                    <input
                      ref={nameInputRef}
                      className={`input uppercase w-full ${hasReservedSuffix ? 'border-2 border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="Nombre de la empresa"
                      value={field.value?.toString().toUpperCase() ?? ""}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                    {hasReservedSuffix && (
                      <p className="mt-1 text-sm text-red-600">
                        Agrega la terminación de la empresa en el siguiente menú a la derecha
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
            <div className="min-w-[140px]">
              <Controller
                name="company.entitySuffix"
                control={control}
                render={({ field }) => (
                  <select
                    className="input w-full"
                    value={field.value || ""}
                    onChange={field.onChange}
                    disabled={!entityType}
                  >
                    <option value="">Seleccionar</option>
                    {entitySuffixOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <CompanyNameCheckButton
              getName={() => getValues("company.companyName") as string}
              formationState={formationState}
              entityType={entityType as "LLC" | "C-Corp" | undefined}
            />
          </div>
          <input type="hidden" {...register("company.companyName")} />
          <p className="help">
            {(errors.company?.companyName?.message as unknown as string) || ""}
          </p>
        </div>

        {/* Dirección */}
        <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
          <div>
            <div className="label-lg mb-1">¿Cuenta con una dirección en USA para su empresa?</div>
            <p className="text-sm text-gray-600">
              No puede ser P.O. BOX. Si no cuenta con una nosotros le podemos proveer una por $600
              usd al año.
            </p>
          </div>
          <div className="md:col-start-2 md:justify-self-end">
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
                      // Do not autofill state from formationState; leave blank for Google Autocomplete to set
                      setValue("company.state", "", { shouldDirty: true });
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
                setValue("company.addressLine1", addr.line1, { shouldDirty: true });
                setValue("company.addressLine2", "", { shouldDirty: true });
                setValue("company.city", addr.city, { shouldDirty: true });
                setValue("company.state", addr.state, { shouldDirty: true });
                setValue("company.postalCode", addr.postalCode, { shouldDirty: true });
                setValue("company.country", "Estados Unidos de América", { shouldDirty: true });
                // Re-validate the whole company section so superRefine clears errors
                void trigger("company");
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Dirección línea 1
                  {hasUsaAddress === "Yes" && (
                    <span className="ml-1 text-red-600 text-xs">(requerido)</span>
                  )}
                </label>
                <input
                  className={`input ${errors.company?.addressLine1 ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' : ''}`}
                  value={addressLine1 ?? ""}
                  onChange={(e) => setValue("company.addressLine1", e.target.value, { shouldDirty: true, shouldValidate: true })}
                />
                {errors.company?.addressLine1 && (
                  <p className="mt-1 text-sm text-red-600">
                    {(errors.company?.addressLine1?.message as string) || 'Campo requerido'}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Dirección línea 2</label>
                <input
                  className="input"
                  value={addressLine2 ?? ""}
                  onChange={(e) => setValue("company.addressLine2", e.target.value, { shouldDirty: true })}
                />
              </div>
              <div>
                <label className="label">
                  Ciudad
                  {hasUsaAddress === "Yes" && (
                    <span className="ml-1 text-red-600 text-xs">(requerido)</span>
                  )}
                </label>
                <input
                  className={`input ${errors.company?.city ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' : ''}`}
                  value={addressCity ?? ""}
                  onChange={(e) => setValue("company.city", e.target.value, { shouldDirty: true, shouldValidate: true })}
                />
                {errors.company?.city && (
                  <p className="mt-1 text-sm text-red-600">
                    {(errors.company?.city?.message as string) || 'Campo requerido'}
                  </p>
                )}
              </div>
              <div>
                <label className="label">
                  Estado/Provincia
                  {hasUsaAddress === "Yes" && (
                    <span className="ml-1 text-red-600 text-xs">(requerido)</span>
                  )}
                </label>
                <input
                  className={`input ${errors.company?.state ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' : ''}`}
                  value={addressState ?? ""}
                  onChange={(e) => setValue("company.state", e.target.value, { shouldDirty: true, shouldValidate: true })}
                />
                {errors.company?.state && (
                  <p className="mt-1 text-sm text-red-600">
                    {(errors.company?.state?.message as string) || 'Campo requerido'}
                  </p>
                )}
              </div>
              <div>
                <label className="label">
                  Código postal
                  {hasUsaAddress === "Yes" && (
                    <span className="ml-1 text-red-600 text-xs">(requerido)</span>
                  )}
                </label>
                <input
                  className={`input ${errors.company?.postalCode ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' : ''}`}
                  value={addressPostalCode ?? ""}
                  onChange={(e) => setValue("company.postalCode", e.target.value, { shouldDirty: true, shouldValidate: true })}
                />
                {errors.company?.postalCode && (
                  <p className="mt-1 text-sm text-red-600">
                    {(errors.company?.postalCode?.message as string) || 'Campo requerido'}
                  </p>
                )}
              </div>
              <div>
                <label className="label">País</label>
                <input className="input" value="Estados Unidos de América" readOnly />
              </div>
            </div>
          </div>
        )}

        {/* Teléfono */}
        <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
          <div>
            <div className="label-lg mb-1">¿Cuenta con número de teléfono de USA de su empresa?</div>
            <p className="text-sm text-gray-600">
              Si no cuenta con uno, nosotros se lo podemos proveer por $180 usd al año.
            </p>
          </div>
          <div className="md:col-start-2 md:justify-self-end">
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

        {hasUsPhone === "No" && (
          <div className="mt-4">
            <div className="mb-4 p-6 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                <strong>Nosotros le brindaremos un número telefónico en USA de la ciudad de Miami</strong> desde donde podrá recibir y hacer llamadas.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Cuando le lleguen llamadas a su nuevo número, nuestro servicio va a <strong>re-dirigir automáticamente las llamadas entrantes</strong> a otro número telefónico que nos especifique.
              </p>
            </div>
            <label className="label text-base font-semibold">Ingresar número para re-dirigir automáticamente las llamadas entrantes:</label>
            <div className="mt-2">
              <InternationalPhoneInput
                value={forwardPhoneE164}
                onChange={(val) => setValue("company.forwardPhoneE164", val || "", { shouldDirty: true, shouldValidate: true })}
                placeholder="Ingresa número internacional"
              />
            </div>
            <p className="help mt-2">Este número puede ser de cualquier país (México, España, etc.)</p>
          </div>
        )}

        {/* A qué se dedica la empresa */}
        <div className="mt-12 pt-10 border-t border-gray-100">
          <div className="label-lg mb-2">¿A qué se dedica la empresa?</div>
          <textarea
            className="input min-h-[120px]"
            placeholder="Describe brevemente el objeto o giro de la empresa…"
            {...register("company.businessPurpose")}
          />
        </div>

        {/* Número de acciones */}
        {(entityType === "C-Corp" || entityType === "S-Corp") && (
          <div className="mt-12 pt-10 border-t border-gray-100">
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
        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <div />
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-base underline text-blue-600 hover:text-blue-700"
              onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}
            >
              Guardar y continuar más tarde
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (onNext ? void onNext() : setStep(3))}
              disabled={hasReservedSuffix}
              title={hasReservedSuffix ? 'Elimina la terminación del nombre de la empresa' : ''}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>

      {/* S-Corp Requirements Modal */}
      {showSCorpModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/80 z-[9998]" 
            onClick={handleSCorpModalCancel}
          />
          <div 
            className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 z-[9999]"
            role="dialog"
            aria-modal="true"
          >
            {/* Close button */}
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none"
              onClick={handleSCorpModalCancel}
            >
              ×
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Requisitos para S-Corp</h3>
            </div>

            {/* Content */}
            <div className="mb-6">
              <p className="text-base font-semibold text-gray-900 mb-3">
                Las S-Corps solo pueden ser formadas por:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li className="pl-2">
                  <strong>Personas naturales.</strong> Es decir los accionistas no pueden ser empresas.
                </li>
                <li className="pl-2">
                  Que tengan <strong>residencia permanente de USA</strong> o sean <strong>ciudadanos estadounidenses</strong> con <strong>Social Security Number (SSN)</strong>.
                </li>
              </ol>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-4 justify-end">
              <button
                type="button"
                onClick={handleSCorpModalCancel}
                className="btn text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSCorpModalOK}
                className="btn btn-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}