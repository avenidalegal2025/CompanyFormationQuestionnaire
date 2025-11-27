// src/components/steps/Step3Owners.tsx
"use client";

import { Controller } from "react-hook-form";
import { useState, useEffect } from "react";
import SegmentedToggle from "@/components/SegmentedToggle";
import SSNEINInput from "@/components/SSNEINInput";
import HeroMiami2 from "@/components/HeroMiami2";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

const MAX_OWNERS = 6;

interface Step3OwnersProps extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step3Owners({ form, setStep, onSave, onNext, session, anonymousId }: Step3OwnersProps) {
  const { register, control, watch, setValue } = form;

  // Loosen types ONLY for ad-hoc (non-schema) paths without using `any`
  const w = watch as unknown as (name: string) => unknown;
  const reg = (name: string) => register(name as never);

  // Entity type decides wording
  const entityType = watch("company.entityType") as "LLC" | "C-Corp" | "S-Corp" | undefined;
  const isCorp = entityType === "C-Corp" || entityType === "S-Corp";
  const isSCorp = entityType === "S-Corp";
  const groupLabel = isCorp ? "accionistas" : "socios";
  const singleLabel = isCorp ? "Accionista" : "Socio";
  const heroTitle = isCorp ? "Datos de los accionistas" : "Datos de los socios";

  // How many blocks to render (stored at root as ownersCount)
  const ownersCount = (watch("ownersCount") as number | undefined) ?? 1;
  const [inputValue, setInputValue] = useState(ownersCount.toString());
  
  // State for passport uploads
  const [uploadingPassport, setUploadingPassport] = useState<Record<number, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<number, string>>({});
  
  console.log("Current ownersCount:", ownersCount);

  // Sync input value when form value changes
  useEffect(() => {
    setInputValue(ownersCount.toString());
  }, [ownersCount]);

  // Calculate total percentage owned
  const totalPercentage = Array.from({ length: ownersCount }).reduce((total: number, _, i) => {
    const percentage = Number(w(`owners.${i}.ownership`)) || 0;
    return total + percentage;
  }, 0);

  const remainingPercentage = 100 - totalPercentage;

  // For S-Corp, automatically set all owners as US citizens/residents (required for SSN)
  useEffect(() => {
    if (isSCorp) {
      Array.from({ length: ownersCount }).forEach((_, i) => {
        const currentValue = w(`owners.${i}.isUsCitizen`) as "Yes" | "No" | undefined;
        if (currentValue !== "Yes") {
          setValue(`owners.${i}.isUsCitizen` as never, "Yes" as never);
        }
      });
    }
  }, [isSCorp, ownersCount, w, setValue]);

  // Handle passport file upload
  const handlePassportUpload = async (ownerIndex: number, file: File) => {
    try {
      setUploadingPassport(prev => ({ ...prev, [ownerIndex]: true }));
      setUploadError(prev => ({ ...prev, [ownerIndex]: '' }));

      // Get owner name and company name for the S3 path
      const ownerName = w(`owners.${ownerIndex}.fullName`) as string || `Owner-${ownerIndex + 1}`;
      const companyName = w('company.companyName') as string || 'Company';
      
      // Generate a temporary vault path (will be replaced with actual vault path after payment)
      // Format: company-name-slug
      const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const vaultPath = `temp-${companySlug}-${Date.now()}`;

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ownerIndex', ownerIndex.toString());
      formData.append('ownerName', ownerName);
      formData.append('vaultPath', vaultPath);

      // Upload to S3
      const response = await fetch('/api/upload/passport', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      
      // Save S3 key to form data
      setValue(`owners.${ownerIndex}.passportS3Key` as never, result.s3Key as never);
      setValue(`owners.${ownerIndex}.passportImage` as never, result.fileName as never);
      
      console.log(`✅ Passport uploaded for owner ${ownerIndex}:`, result.s3Key);
      
    } catch (error: any) {
      console.error('❌ Passport upload failed:', error);
      setUploadError(prev => ({ ...prev, [ownerIndex]: error.message }));
    } finally {
      setUploadingPassport(prev => ({ ...prev, [ownerIndex]: false }));
    }
  };

  return (
    <section className="space-y-6">
      {/* Shared hero */}
      <HeroMiami2 title={heroTitle} />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Datos de los {groupLabel}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Indique el número de {groupLabel} y complete sus datos.
        </p>
        
        {totalPercentage > 100 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Total de porcentajes excede 100%
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>El total actual es {totalPercentage}%, excediendo por {Math.abs(remainingPercentage)}%. Ajuste los porcentajes para que sumen exactamente 100% antes de continuar.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Número de accionistas/socios */}
        <div className="mt-6">
          <label className="label">Número de {groupLabel}</label>
          <input
            type="number"
            min={1}
            max={MAX_OWNERS}
            className="input w-full max-w-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={inputValue}
            placeholder="Ingrese número (1-6)"
            onChange={(e) => {
              const value = e.target.value;
              setInputValue(value); // Update local state immediately
              
              // Only update form value if it's a valid number
              if (value === "") {
                // Allow empty field while typing
                return;
              }
              
              const numValue = Number(value);
              if (!isNaN(numValue) && numValue >= 1 && numValue <= MAX_OWNERS) {
                setValue("ownersCount", numValue);
              }
            }}
            onBlur={() => {
              // When user leaves the field, ensure we have a valid value
              if (inputValue === "" || Number(inputValue) < 1 || Number(inputValue) > MAX_OWNERS) {
                setInputValue("1");
                setValue("ownersCount", 1);
              }
            }}
            onKeyDown={(e) => {
              // Prevent typing invalid characters
              if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-' || e.key === '.') {
                e.preventDefault();
              }
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
                      step={1}
                      className={`input ${totalPercentage > 100 ? 'border-red-500 bg-red-50' : ''}`}
                      {...reg(`${base}.ownership`)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        (setValue as (name: string, value: unknown) => void)(`${base}.ownership`, value);
                      }}
                    />
                    <div className="mt-1 text-sm">
                      {remainingPercentage > 0 ? (
                        <span className="text-blue-600">
                          Faltan {remainingPercentage}% para completar 100%
                        </span>
                      ) : remainingPercentage < 0 ? (
                        <span className="text-red-600 font-semibold">
                          ⚠️ Excede 100% por {Math.abs(remainingPercentage)}%
                        </span>
                      ) : (
                        <span className="text-green-600">
                          ✓ Total: 100%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dirección completa (Google Places) */}
                <div className="mt-4">
                  <label className="label">Dirección completa</label>
                  <Controller
                    name={`${base}.address` as never}
                    control={control}
                    render={({ field }) => (
                      <AddressAutocomplete
                        placeholder="Escriba y seleccione la dirección"
                        value={field.value as string}
                        onChangeText={field.onChange}
                        onSelect={(addr) => field.onChange(addr.fullAddress)}
                      />
                    )}
                  />
                </div>

                {/* ¿Es ciudadano/residente de EE.UU.? - Hidden for S-Corp since it's required */}
                {!isSCorp && (
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
                )}

                {/* For S-Corp, always show SSN/EIN (required). For others, conditional based on resident status */}
                {(isSCorp || resident === "Yes") ? (
                  <div className="mt-4">
                    {isSCorp && (
                      <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Requisito S-Corp:</strong> Todos los accionistas deben tener SSN (Social Security Number) ya que las S-Corps solo pueden ser formadas por personas naturales con residencia permanente de USA o ciudadanos estadounidenses.
                        </p>
                      </div>
                    )}
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
                      accept=".png,.jpg,.jpeg,.PNG,.JPG,.JPEG"
                      className="block w-full rounded-xl border border-dashed p-6 text-sm text-gray-600"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handlePassportUpload(i, file);
                        }
                      }}
                      disabled={uploadingPassport[i]}
                    />
                    {uploadingPassport[i] && (
                      <p className="mt-2 text-sm text-blue-600">
                        ⏳ Subiendo pasaporte...
                      </p>
                    )}
                    {uploadError[i] && (
                      <p className="mt-2 text-sm text-red-600">
                        ❌ Error: {uploadError[i]}
                      </p>
                    )}
                    {!!w(`${base}.passportS3Key`) && !uploadingPassport[i] && !uploadError[i] && (
                      <p className="mt-2 text-sm text-green-600">
                        ✅ Pasaporte subido correctamente
                      </p>
                    )}
                    <p className="help">Arrastrar y soltar o buscar archivo.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-8 pt-6 border-t flex items-center justify-between">
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
              className="text-base underline text-blue-600 hover:text-blue-700"
              onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}
            >
              Guardar y continuar más tarde
            </button>

            <button
              type="button"
              className={`btn ${totalPercentage > 100 ? 'btn-disabled opacity-50 cursor-not-allowed' : 'btn-primary'}`}
              onClick={() => {
                if (totalPercentage > 100) {
                  alert(`No puede continuar. El total de porcentajes excede 100% por ${Math.abs(remainingPercentage)}%. Por favor, ajuste los porcentajes para que sumen exactamente 100%.`);
                  return;
                }
                onNext ? void onNext() : setStep(3);
              }}
              disabled={totalPercentage > 100}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}