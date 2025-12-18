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
  const [uploadingPassport, setUploadingPassport] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  // State for nested owners count input values
  const [nestedInputValues, setNestedInputValues] = useState<Record<number, string>>({});
  
  console.log("Current ownersCount:", ownersCount);

  // Sync input value when form value changes
  useEffect(() => {
    setInputValue(ownersCount.toString());
  }, [ownersCount]);

  // Sync nested input values when nested owners count changes
  useEffect(() => {
    Array.from({ length: ownersCount }).forEach((_, i) => {
      const nestedCount = w(`owners.${i}.nestedOwnersCount`) as number | undefined;
      if (nestedCount) {
        setNestedInputValues(prev => {
          if (prev[i] !== nestedCount.toString()) {
            return { ...prev, [i]: nestedCount.toString() };
          }
          return prev;
        });
      }
    });
  }, [ownersCount, w]);

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

  // Handle passport file upload (supports both regular owners and nested owners)
  const handlePassportUpload = async (ownerIndex: number, file: File, nestedIndex?: number) => {
    try {
      const uploadKey = nestedIndex !== undefined ? `${ownerIndex}-${nestedIndex}` : ownerIndex;
      setUploadingPassport(prev => ({ ...prev, [uploadKey]: true }));
      setUploadError(prev => ({ ...prev, [uploadKey]: '' }));

      // Get owner name and company name for the S3 path
      let ownerName: string;
      if (nestedIndex !== undefined) {
        ownerName = w(`owners.${ownerIndex}.nestedOwners.${nestedIndex}.fullName`) as string || `Nested-Owner-${nestedIndex + 1}`;
      } else {
        ownerName = w(`owners.${ownerIndex}.fullName`) as string || `Owner-${ownerIndex + 1}`;
      }
      const companyName = w('company.companyName') as string || 'Company';
      
      // Generate a temporary vault path (will be replaced with actual vault path after payment)
      // Format: company-name-slug
      const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const vaultPath = `temp-${companySlug}-${Date.now()}`;

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ownerIndex', ownerIndex.toString());
      if (nestedIndex !== undefined) {
        formData.append('nestedIndex', nestedIndex.toString());
      }
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
      if (nestedIndex !== undefined) {
        setValue(`owners.${ownerIndex}.nestedOwners.${nestedIndex}.passportS3Key` as never, result.s3Key as never);
        setValue(`owners.${ownerIndex}.nestedOwners.${nestedIndex}.passportImage` as never, result.fileName as never);
      } else {
        setValue(`owners.${ownerIndex}.passportS3Key` as never, result.s3Key as never);
        setValue(`owners.${ownerIndex}.passportImage` as never, result.fileName as never);
      }
      
      console.log(`✅ Passport uploaded for ${nestedIndex !== undefined ? `nested owner ${nestedIndex}` : `owner ${ownerIndex}`}:`, result.s3Key);
      
    } catch (error: any) {
      console.error('❌ Passport upload failed:', error);
      const uploadKey = nestedIndex !== undefined ? `${ownerIndex}-${nestedIndex}` : ownerIndex;
      setUploadError(prev => ({ ...prev, [uploadKey]: error.message }));
    } finally {
      const uploadKey = nestedIndex !== undefined ? `${ownerIndex}-${nestedIndex}` : ownerIndex;
      setUploadingPassport(prev => ({ ...prev, [uploadKey]: false }));
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
            const ownerType = w(`${base}.ownerType`) as "persona" | "empresa" | undefined;
            const isEmpresa = ownerType === "empresa";
            const nestedOwnersCount = (w(`${base}.nestedOwnersCount`) as number | undefined) ?? 1;

            return (
              <div key={i} className="rounded-2xl border p-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {singleLabel} {i + 1}
                </h3>

                {/* Persona / Empresa Toggle - Only for LLC and C-Corp (not S-Corp) */}
                {!isSCorp && (
                  <div className="mt-4">
                    <div className="label-lg mb-2">
                      ¿Es una persona o una empresa?
                    </div>
                    <Controller
                      name={`${base}.ownerType` as never}
                      control={control}
                      render={({ field }) => (
                        <div className="w-fit">
                          <SegmentedToggle
                            value={(field.value as string) ?? "persona"}
                            onChange={field.onChange}
                            options={[
                              { value: "persona", label: "Persona" },
                              { value: "empresa", label: "Empresa" },
                            ]}
                            ariaLabel="Tipo de propietario"
                            name={field.name}
                          />
                        </div>
                      )}
                    />
                  </div>
                )}

                {/* Ownership percentage - shown for both persona and empresa */}
                <div className="mt-4">
                  <label className="label">Porcentaje de propiedad (%)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`input w-full max-w-xs ${totalPercentage > 100 ? 'border-red-500 bg-red-50' : ''}`}
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

                {/* Persona fields */}
                {!isEmpresa && (
                  <>
                {/* Name - Split into First and Last */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre(s)</label>
                    <input className="input" {...reg(`${base}.firstName`)} placeholder="Ej: Juan Carlos" />
                  </div>
                  <div>
                    <label className="label">Apellido(s)</label>
                    <input className="input" {...reg(`${base}.lastName`)} placeholder="Ej: García López" />
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
                  </>
                )}

                {/* Empresa fields */}
                {isEmpresa && (
                  <div className="mt-4 space-y-6">
                    {/* Company Name */}
                    <div>
                      <label className="label">Nombre completo de la empresa (incluye si es LLC, Inc, etc)</label>
                      <input className="input" {...reg(`${base}.companyName`)} />
                    </div>

                    {/* Company Address */}
                    <div>
                      <label className="label">Dirección de la empresa</label>
                      <Controller
                        name={`${base}.companyAddress` as never}
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

                    {/* Number of nested owners */}
                    <div>
                      <label className="label">
                        Selecciona el número de socios con más de 15% de participación en la empresa:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        className={`input w-full max-w-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          nestedInputValues[i] !== undefined && 
                          (() => {
                            const numValue = Number(nestedInputValues[i]);
                            return isNaN(numValue) || numValue < 1 || numValue > 6;
                          })()
                            ? 'border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500' 
                            : ''
                        }`}
                        value={nestedInputValues[i] ?? nestedOwnersCount.toString()}
                        placeholder="Ingrese número (1-6)"
                        onInput={(e) => {
                          const input = e.target as HTMLInputElement;
                          const value = Number(input.value);
                          // Prevent values greater than 6
                          if (!isNaN(value) && value > 6) {
                            input.value = '6';
                            setNestedInputValues(prev => ({ ...prev, [i]: "6" }));
                            setValue(`${base}.nestedOwnersCount` as never, 6 as never);
                            // Initialize nested owners array if needed
                            const currentNested = w(`${base}.nestedOwners`) as any[] | undefined;
                            if (!currentNested || currentNested.length < 6) {
                              const newNested = Array.from({ length: 6 }).map((_, idx) => 
                                currentNested?.[idx] || {}
                              );
                              setValue(`${base}.nestedOwners` as never, newNested as never);
                            }
                            return;
                          }
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only allow numeric characters
                          const numericValue = value.replace(/[^0-9]/g, '');
                          setNestedInputValues(prev => ({ ...prev, [i]: numericValue }));
                          
                          if (numericValue === "") {
                            return;
                          }
                          
                          const numValue = Number(numericValue);
                          if (!isNaN(numValue) && numValue >= 1 && numValue <= 6) {
                            setValue(`${base}.nestedOwnersCount` as never, numValue as never);
                            // Initialize nested owners array if needed
                            const currentNested = w(`${base}.nestedOwners`) as any[] | undefined;
                            if (!currentNested || currentNested.length < numValue) {
                              const newNested = Array.from({ length: numValue }).map((_, idx) => 
                                currentNested?.[idx] || {}
                              );
                              setValue(`${base}.nestedOwners` as never, newNested as never);
                            }
                          }
                        }}
                        onBlur={() => {
                          const currentValue = nestedInputValues[i];
                          if (!currentValue || currentValue === "") {
                            setNestedInputValues(prev => ({ ...prev, [i]: "1" }));
                            setValue(`${base}.nestedOwnersCount` as never, 1 as never);
                            return;
                          }
                          
                          const numValue = Number(currentValue);
                          if (isNaN(numValue) || numValue < 1) {
                            setNestedInputValues(prev => ({ ...prev, [i]: "1" }));
                            setValue(`${base}.nestedOwnersCount` as never, 1 as never);
                          } else if (numValue > 6) {
                            setNestedInputValues(prev => ({ ...prev, [i]: "6" }));
                            setValue(`${base}.nestedOwnersCount` as never, 6 as never);
                            // Initialize nested owners array if needed
                            const currentNested = w(`${base}.nestedOwners`) as any[] | undefined;
                            if (!currentNested || currentNested.length < 6) {
                              const newNested = Array.from({ length: 6 }).map((_, idx) => 
                                currentNested?.[idx] || {}
                              );
                              setValue(`${base}.nestedOwners` as never, newNested as never);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          // Prevent non-numeric characters
                          if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-' || e.key === '.' || 
                              (e.key.length === 1 && !/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key))) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pastedText = e.clipboardData.getData('text');
                          const numericValue = pastedText.replace(/[^0-9]/g, '');
                          if (numericValue) {
                            const numValue = Number(numericValue);
                            if (!isNaN(numValue) && numValue >= 1 && numValue <= 6) {
                              setNestedInputValues(prev => ({ ...prev, [i]: numValue.toString() }));
                              setValue(`${base}.nestedOwnersCount` as never, numValue as never);
                              // Initialize nested owners array if needed
                              const currentNested = w(`${base}.nestedOwners`) as any[] | undefined;
                              if (!currentNested || currentNested.length < numValue) {
                                const newNested = Array.from({ length: numValue }).map((_, idx) => 
                                  currentNested?.[idx] || {}
                                );
                                setValue(`${base}.nestedOwners` as never, newNested as never);
                              }
                            } else if (!isNaN(numValue) && numValue > 6) {
                              setNestedInputValues(prev => ({ ...prev, [i]: "6" }));
                              setValue(`${base}.nestedOwnersCount` as never, 6 as never);
                              // Initialize nested owners array if needed
                              const currentNested = w(`${base}.nestedOwners`) as any[] | undefined;
                              if (!currentNested || currentNested.length < 6) {
                                const newNested = Array.from({ length: 6 }).map((_, idx) => 
                                  currentNested?.[idx] || {}
                                );
                                setValue(`${base}.nestedOwners` as never, newNested as never);
                              }
                            }
                          }
                        }}
                      />
                      {nestedInputValues[i] !== undefined && 
                       (() => {
                         const numValue = Number(nestedInputValues[i]);
                         return isNaN(numValue) || numValue < 1 || numValue > 6;
                       })() && (
                        <p className="mt-1 text-sm text-red-600">
                          {(() => {
                            const numValue = Number(nestedInputValues[i]);
                            if (isNaN(numValue)) {
                              return "Por favor ingrese un número válido.";
                            }
                            if (numValue > 6) {
                              return "El número máximo de socios es 6.";
                            }
                            if (numValue < 1) {
                              return "El número mínimo de socios es 1.";
                            }
                            return "Por favor ingrese un número válido (entre 1 y 6).";
                          })()}
                        </p>
                      )}
                      <p className="help">Define cuántos socios se muestran debajo (1 a 6).</p>
                    </div>

                    {/* Nested Owners */}
                    <div className="mt-6 space-y-6 border-t pt-6">
                      {Array.from({ length: nestedOwnersCount }).map((_, nestedIdx) => {
                        const nestedBase = `${base}.nestedOwners.${nestedIdx}`;
                        const nestedResidentKey = `${nestedBase}.isUsCitizen`;
                        const nestedResident = w(nestedResidentKey) as "Yes" | "No" | undefined;

                        return (
                          <div key={nestedIdx} className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                            <h4 className="text-base font-semibold text-gray-800 mb-4">
                              Socio {nestedIdx + 1} de la empresa
                            </h4>

                            {/* Nested Owner Name - Split into First and Last */}
                            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="label">Nombre(s) del socio {nestedIdx + 1}</label>
                                <input className="input" {...reg(`${nestedBase}.firstName`)} placeholder="Ej: Juan Carlos" />
                              </div>
                              <div>
                                <label className="label">Apellido(s) del socio {nestedIdx + 1}</label>
                                <input className="input" {...reg(`${nestedBase}.lastName`)} placeholder="Ej: García López" />
                              </div>
                            </div>

                            {/* Nested Owner Address */}
                            <div className="mb-4">
                              <label className="label">Dirección</label>
                              <Controller
                                name={`${nestedBase}.address` as never}
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

                            {/* Citizenship/Residency Toggle */}
                            <div className="mb-4">
                              <div className="label-lg mb-2">
                                ¿El accionista es ciudadano o residente de los Estados Unidos?
                              </div>
                              <Controller
                                name={nestedResidentKey as never}
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

                            {/* SSN or Passport */}
                            {nestedResident === "Yes" ? (
                              <div>
                                <Controller
                                  name={`${nestedBase}.tin` as never}
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
                              <div>
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
                                      handlePassportUpload(i, file, nestedIdx);
                                    }
                                  }}
                                  disabled={uploadingPassport[`${i}-${nestedIdx}`]}
                                />
                                {uploadingPassport[`${i}-${nestedIdx}`] && (
                                  <p className="mt-2 text-sm text-blue-600">
                                    ⏳ Subiendo pasaporte...
                                  </p>
                                )}
                                {uploadError[`${i}-${nestedIdx}`] && (
                                  <p className="mt-2 text-sm text-red-600">
                                    ❌ Error: {uploadError[`${i}-${nestedIdx}`]}
                                  </p>
                                )}
                                {!!w(`${nestedBase}.passportS3Key`) && !uploadingPassport[`${i}-${nestedIdx}`] && !uploadError[`${i}-${nestedIdx}`] && (
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