// src/components/steps/Step4Summary.tsx
"use client";

import { useMemo, useState } from "react";
import SSNEINInput from "@/components/SSNEINInput";
import { Controller } from "react-hook-form";
import HeroMiami1 from "@/components/HeroMiami1";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SegmentedToggle from "@/components/SegmentedToggle";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

// Edit button component
const EditButton = ({ 
  onClick, 
  label, 
  isEditing, 
  onSave, 
  onCancel 
}: { 
  onClick: () => void; 
  label: string; 
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <div className="flex gap-2">
    {isEditing ? (
      <>
        <button
          type="button"
          onClick={onSave}
          className="btn btn-primary text-sm px-3 py-1"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary text-sm px-3 py-1"
        >
          Cancelar
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={onClick}
        className="btn btn-secondary text-sm px-3 py-1"
      >
        Editar {label}
      </button>
    )}
  </div>
);

interface Step4SummaryProps extends StepProps {
  setWantsAgreement: (w: boolean) => void;
  session: Session | null;
  anonymousId: string;
}

export default function Step4Summary({ form, setStep, onSave, onNext, setWantsAgreement, session, anonymousId }: Step4SummaryProps) {
  const { watch, control, setValue } = form;

  // Get all form data
  const companyData = watch("company");
  const ownersData = useMemo(() => watch("owners") || [], [watch]);
  const ownersCount = watch("ownersCount") || 1;
  const adminData = watch("admin") || {};

  // Edit state management
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  // Edit functionality
  const handleEdit = (section: string) => {
    setEditingSection(section);
  };

  const handleSave = () => {
    // If editing owners, require exactly 100%
    if (editingSection === "owners") {
      const owners = (form.getValues("owners") as Array<{ ownership?: number | string }>) || [];
      const count = (form.getValues("ownersCount") as number | undefined) ?? owners.length;
      const freshTotal = owners
        .slice(0, Math.max(0, count || 0))
        .reduce((sum, o) => sum + (isNaN(Number(o?.ownership)) ? 0 : Number(o?.ownership)), 0);
      if (freshTotal !== 100) {
        alert("El total debe ser 100% para guardar los propietarios.");
        return; // keep editing mode
      }
    }

    // Trigger form validation and update
    form.trigger();
    setEditingSection(null);
  };

  const handleCancel = () => {
    setEditingSection(null);
  };

  // Obfuscate SSN/EIN
  // When isSSN is true, mask as ***-**-1234 (show last 4 only)
  // Otherwise, keep EIN formatting XX-XXXXXXX
  const obfuscateSSNEIN = (value: unknown, isSSN: boolean) => {
    const raw = typeof value === "string" ? value : value == null ? "" : String(value);
    if (!raw) return "No especificado";
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 9) return value;
    if (isSSN) {
      // Show only last 4
      return `***-**-${digits.slice(5, 9)}`;
    }
    // EIN formatting (unmasked formatting)
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  };

  // Calculate total ownership percentage
  const totalOwnership = useMemo(() => {
    if (!ownersData || ownersData.length === 0) return 0;
    const activeOwners = ownersData.slice(0, ownersCount);
    return activeOwners.reduce((total: number, owner: { 
      ownership?: number | string;
      isUsCitizen?: string;
      tin?: string;
      passportImage?: string;
    }) => {
      const ownership = Number(owner?.ownership);
      return total + (isNaN(ownership) ? 0 : ownership);
    }, 0);
  }, [ownersData, ownersCount]);

  const entityType = companyData?.entityType;
  const isCorp = entityType === "C-Corp" || entityType === "S-Corp";
  const groupLabel = isCorp ? "accionistas" : "socios";

  const agreementName = entityType === "LLC" ? "Operating Agreement" : "Shareholder Agreement";
  
  // Debug logging
  console.log('Step4Summary - entityType:', entityType);
  console.log('Step4Summary - isCorp:', isCorp);
  console.log('Step4Summary - agreementName:', agreementName);

  return (
    <section className="space-y-6">
      <HeroMiami1 title="Resumen de la Información" />

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Revise toda la información antes de continuar</h2>

        {/* Company Information */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Información de la Empresa</h3>
            <EditButton 
              onClick={() => handleEdit("company")} 
              label="Empresa" 
              isEditing={editingSection === "company"}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-bold text-gray-700">Estado de formación:</span>
                {editingSection === "company" ? (
                  <Controller
                    name="company.formationState"
                    control={control}
                    render={({ field }) => (
                      <select className="input mt-1" {...field}>
                        <option value="Florida">Florida</option>
                        <option value="Delaware">Delaware</option>
                        <option value="Wyoming">Wyoming</option>
                        <option value="Texas">Texas</option>
                        <option value="Nevada">Nevada</option>
                        <option value="New Mexico">New Mexico</option>
                        <option value="Georgia">Georgia</option>
                        <option value="California">California</option>
                        <option value="Arizona">Arizona</option>
                      </select>
                    )}
                  />
                ) : (
                  <p className="text-gray-900">{companyData?.formationState || "No especificado"}</p>
                )}
              </div>
              <div>
                <span className="font-bold text-gray-700">Tipo de entidad:</span>
                {editingSection === "company" ? (
                  <Controller
                    name="company.entityType"
                    control={control}
                    render={({ field }) => (
                      <select className="input mt-1" {...field}>
                        <option value="LLC">LLC</option>
                        <option value="C-Corp">C-Corp</option>
                        <option value="S-Corp">S-Corp</option>
                      </select>
                    )}
                  />
                ) : (
                  <p className="text-gray-900">{companyData?.entityType || "No especificado"}</p>
                )}
              </div>
              <div>
                <span className="font-bold text-gray-700">Nombre de la empresa:</span>
                {editingSection === "company" ? (
                  <Controller
                    name="company.companyName"
                    control={control}
                    render={({ field }) => (
                      <input className="input mt-1" {...field} />
                    )}
                  />
                ) : (
                  <p className="text-gray-900">{companyData?.companyName || "No especificado"}</p>
                )}
              </div>
              <div>
                <span className="font-bold text-gray-700">Propósito del negocio:</span>
                {editingSection === "company" ? (
                  <Controller
                    name="company.businessPurpose"
                    control={control}
                    render={({ field }) => (
                      <textarea className="input mt-1 min-h-[80px]" {...field} />
                    )}
                  />
                ) : (
                  <p className="text-gray-900">{companyData?.businessPurpose || "No especificado"}</p>
                )}
              </div>
            </div>
            
            <div className="mt-4">
              <span className="font-bold text-gray-700">Dirección:</span>
              {editingSection === "company" ? (
                <AddressAutocomplete
                  country="us"
                  placeholder="1600 Pennsylvania Ave NW, Washington"
                  onSelect={(addr) => {
                    setValue("company.addressLine1", addr.line1, { shouldDirty: true, shouldValidate: true });
                    setValue("company.addressLine2", "", { shouldDirty: true });
                    setValue("company.city", addr.city, { shouldDirty: true, shouldValidate: true });
                    setValue("company.state", addr.state, { shouldDirty: true, shouldValidate: true });
                    setValue("company.postalCode", addr.postalCode, { shouldDirty: true, shouldValidate: true });
                    setValue("company.country", "Estados Unidos de América", { shouldDirty: true, shouldValidate: true });
                  }}
                />
              ) : (
                <p className="text-gray-900">
                  {[companyData?.addressLine1, companyData?.addressLine2, companyData?.city, companyData?.state, companyData?.postalCode, companyData?.country]
                    .filter(Boolean)
                    .join(", ") || "No especificado"}
                </p>
              )}
            </div>

            {companyData?.hasUsPhone === "Yes" && (
              <div>
                <span className="font-bold text-gray-700">Teléfono:</span>
                <p className="text-gray-900">{companyData?.usPhoneNumber || "No especificado"}</p>
              </div>
            )}

            {isCorp && companyData?.numberOfShares && (
              <div>
                <span className="font-bold text-gray-700">Número de acciones:</span>
                <p className="text-gray-900">{companyData.numberOfShares.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Owners Information */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Información de los {groupLabel} ({ownersCount})
            </h3>
            <EditButton 
              onClick={() => handleEdit("owners")} 
              label={groupLabel} 
              isEditing={editingSection === "owners"}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
          {editingSection === "owners" && (
            <div className="mb-4">
              <label className="label">Número de {groupLabel}</label>
              <Controller
                name={"ownersCount" as never}
                control={control}
                render={({ field }) => (
                  <div className="w-1/6 min-w-[120px]">
                    <input
                      type="number"
                      min={1}
                      max={6}
                      className="input mt-1 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="(1-6)"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!isNaN(v) && v >= 1 && v <= 6) field.onChange(v);
                        if (e.target.value === "") field.onChange(undefined);
                      }}
                    />
                  </div>
                )}
              />
            </div>
          )}
          <div className="space-y-4">
            {Array.from({ length: ownersCount }).map((_, i) => {
              const owner = (ownersData[i] || {}) as {
                ownerType?: "persona" | "empresa";
                fullName?: string;
                firstName?: string;
                lastName?: string;
                ownership?: number | string;
                address?: string;
                isUsCitizen?: string;
                tin?: string;
                passportImage?: string;
                companyName?: string;
                companyAddress?: string;
                nestedOwnersCount?: number;
                nestedOwners?: Array<{
                  fullName?: string;
                  firstName?: string;
                  lastName?: string;
                  address?: string;
                  isUsCitizen?: string;
                  tin?: string;
                  passportImage?: string;
                  passportS3Key?: string;
                }>;
              };
              const ownerType = owner?.ownerType || "persona";
              const isEmpresa = ownerType === "empresa";
              const nestedOwners = owner?.nestedOwners || [];
              const nestedOwnersCount = owner?.nestedOwnersCount || 0;
              const entityType = watch("company.entityType") as "LLC" | "C-Corp" | "S-Corp" | undefined;
              const isSCorp = entityType === "S-Corp";
              
              return (
                <div key={i} className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-lg font-bold text-gray-900 mb-3">
                    {isCorp ? "Accionista" : "Socio"} {i + 1}
                  </h4>
                  
                  {/* Persona / Empresa Toggle - Only for LLC and C-Corp (not S-Corp) */}
                  {!isSCorp && (
                    <div className="mb-4">
                      <span className="font-bold text-gray-700">Tipo:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.ownerType` as never}
                          control={control}
                          render={({ field }) => (
                            <div className="mt-2 w-fit">
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
                      ) : (
                        <p className="text-gray-900">{ownerType === "empresa" ? "Empresa" : "Persona"}</p>
                      )}
                    </div>
                  )}
                  
                  {/* Ownership percentage - shown for both persona and empresa */}
                  <div className="mb-4">
                      <span className="font-bold text-gray-700">Porcentaje de propiedad:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.ownership` as never}
                          control={control}
                          render={({ field }) => {
                            const currentTotal = Array.from({ length: ownersCount }).reduce((total: number, _, idx) => {
                            if (idx === i) return total;
                              const percentage = Number(watch(`owners.${idx}.ownership`));
                              return total + (isNaN(percentage) ? 0 : percentage);
                            }, 0);
                            const currentValue = Number(field.value);
                            const validCurrentValue = isNaN(currentValue) ? 0 : currentValue;
                            const newTotal = currentTotal + validCurrentValue;
                            const remaining = 100 - newTotal;
                            return (
                              <>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100" 
                                className="input mt-1 w-full max-w-xs" 
                                  {...field} 
                                />
                                <div className="mt-1 text-sm">
                                  {remaining > 0 ? (
                                    <span className="text-blue-600">
                                      Faltan {remaining}% para completar 100%
                                    </span>
                                  ) : remaining < 0 ? (
                                    <span className="text-red-600">
                                      Excede 100% por {Math.abs(remaining)}%
                                    </span>
                                  ) : (
                                    <span className="text-green-600">✓ Total: 100%</span>
                                  )}
                                </div>
                              </>
                            );
                          }}
                        />
                      ) : (
                          <p className="text-gray-900">{owner?.ownership || 0}%</p>
                            )}
                          </div>
                  
                  {/* Persona fields */}
                  {!isEmpresa && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-bold text-gray-700">Nombre(s):</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.firstName` as never}
                          control={control}
                          render={({ field }) => (
                            <input className="input mt-1" placeholder="Ej: Juan Carlos" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.firstName || owner?.fullName?.split(' ')[0] || "No especificado"}</p>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-gray-700">Apellido(s):</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.lastName` as never}
                          control={control}
                          render={({ field }) => (
                            <input className="input mt-1" placeholder="Ej: García López" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.lastName || owner?.fullName?.split(' ').slice(1).join(' ') || "No especificado"}</p>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-gray-700">Dirección:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.address` as never}
                          control={control}
                          render={({ field }) => (
                            <AddressAutocomplete
                              placeholder="Escriba y seleccione la dirección"
                              value={(field.value as string) ?? ""}
                              onChangeText={field.onChange}
                              onSelect={(addr) => field.onChange(addr.fullAddress)}
                            />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.address || "No especificado"}</p>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-gray-700">Ciudadano/Residente de EE.UU.:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.isUsCitizen` as never}
                          control={control}
                          render={({ field }) => (
                            <select
                              className="input mt-1"
                              value={(field.value as string) || "No"}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val);
                                // initialize counterpart fields to safe defaults
                                if (val === "Yes") {
                                  form.setValue(`owners.${i}.tin` as any, (form.getValues(`owners.${i}.tin` as any) as string) || "");
                                } else {
                                  form.setValue(`owners.${i}.passportImage` as any, (form.getValues(`owners.${i}.passportImage` as any) as string) || "");
                                }
                              }}
                            >
                              <option value="No">No</option>
                              <option value="Yes">Sí</option>
                            </select>
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.isUsCitizen === "Yes" ? "Sí" : "No"}</p>
                      )}
                    </div>
                    {(owner?.isUsCitizen ?? "No") === "Yes" ? (
                      <div>
                        <span className="font-bold text-gray-700">SSN/EIN:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.tin` as never}
                            control={control}
                            render={({ field }) => (
                              <SSNEINInput
                                value={(field.value as string) ?? ""}
                                onChange={(digits) => field.onChange(digits)}
                                label="SSN / EIN"
                                showLabel={false}
                              />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{String(obfuscateSSNEIN(owner?.tin, true))}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold text-gray-700">Pasaporte:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.passportImage` as never}
                            control={control}
                            render={({ field }) => (
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="input mt-1" 
                                onChange={(e) => field.onChange(e.target.files?.[0]?.name || "")}
                              />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{owner?.passportImage ? "Archivo subido" : "No especificado"}</p>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                  )}
                  
                  {/* Empresa fields */}
                  {isEmpresa && (
                    <div className="space-y-4 mt-4">
                      <div>
                        <span className="font-bold text-gray-700">Nombre completo de la empresa:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.companyName` as never}
                            control={control}
                            render={({ field }) => (
                              <input className="input mt-1" {...field} />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{owner?.companyName || "No especificado"}</p>
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-gray-700">Dirección de la empresa:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.companyAddress` as never}
                            control={control}
                            render={({ field }) => (
                              <AddressAutocomplete
                                placeholder="Escriba y seleccione la dirección"
                                value={(field.value as string) ?? ""}
                                onChangeText={field.onChange}
                                onSelect={(addr) => field.onChange(addr.fullAddress)}
                              />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{owner?.companyAddress || "No especificado"}</p>
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-gray-700">Número de socios con más de 15% de participación:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.nestedOwnersCount` as never}
                            control={control}
                            render={({ field }) => (
                              <input 
                                type="number" 
                                min={1} 
                                max={6} 
                                className="input mt-1 w-24" 
                                value={field.value ?? 1}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (!isNaN(val) && val >= 1 && val <= 6) {
                                    field.onChange(val);
                                    // Initialize nested owners array if needed
                                    const currentNested = watch(`owners.${i}.nestedOwners`) as any[] | undefined;
                                    if (!currentNested || currentNested.length < val) {
                                      const newNested = Array.from({ length: val }).map((_, idx) => 
                                        currentNested?.[idx] || {}
                                      );
                                      setValue(`owners.${i}.nestedOwners` as never, newNested as never);
                                    }
                                  }
                                }}
                              />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{nestedOwnersCount || 0}</p>
                        )}
                      </div>
                      
                      {/* Nested Owners */}
                      {nestedOwnersCount > 0 && (
                        <div className="mt-4 space-y-4 border-t pt-4">
                          <h5 className="text-md font-semibold text-gray-800">Socios de la empresa:</h5>
                          {Array.from({ length: nestedOwnersCount }).map((_, nestedIdx) => {
                            const nestedOwner = nestedOwners[nestedIdx] || {};
                            return (
                              <div key={nestedIdx} className="bg-white rounded-lg p-4 border border-gray-200">
                                <h6 className="text-sm font-semibold text-gray-700 mb-3">Socio {nestedIdx + 1}</h6>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <span className="font-bold text-gray-700 text-sm">Nombre completo:</span>
                                    {editingSection === "owners" ? (
                                      <Controller
                                        name={`owners.${i}.nestedOwners.${nestedIdx}.fullName` as never}
                                        control={control}
                                        render={({ field }) => (
                                          <input className="input mt-1" {...field} />
                                        )}
                                      />
                                    ) : (
                                      <p className="text-gray-900 text-sm">{nestedOwner?.fullName || "No especificado"}</p>
                                    )}
                                  </div>
                                  <div>
                                    <span className="font-bold text-gray-700 text-sm">Dirección:</span>
                                    {editingSection === "owners" ? (
                                      <Controller
                                        name={`owners.${i}.nestedOwners.${nestedIdx}.address` as never}
                                        control={control}
                                        render={({ field }) => (
                                          <AddressAutocomplete
                                            placeholder="Escriba y seleccione la dirección"
                                            value={(field.value as string) ?? ""}
                                            onChangeText={field.onChange}
                                            onSelect={(addr) => field.onChange(addr.fullAddress)}
                                          />
                                        )}
                                      />
                                    ) : (
                                      <p className="text-gray-900 text-sm">{nestedOwner?.address || "No especificado"}</p>
                                    )}
                                  </div>
                                  <div>
                                    <span className="font-bold text-gray-700 text-sm">Ciudadano/Residente de EE.UU.:</span>
                                    {editingSection === "owners" ? (
                                      <Controller
                                        name={`owners.${i}.nestedOwners.${nestedIdx}.isUsCitizen` as never}
                                        control={control}
                                        render={({ field }) => (
                                          <select
                                            className="input mt-1"
                                            value={(field.value as string) || "No"}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              field.onChange(val);
                                              if (val === "Yes") {
                                                setValue(`owners.${i}.nestedOwners.${nestedIdx}.tin` as never, "" as never);
                                              } else {
                                                setValue(`owners.${i}.nestedOwners.${nestedIdx}.passportImage` as never, "" as never);
                                              }
                                            }}
                                          >
                                            <option value="No">No</option>
                                            <option value="Yes">Sí</option>
                                          </select>
                                        )}
                                      />
                                    ) : (
                                      <p className="text-gray-900 text-sm">{nestedOwner?.isUsCitizen === "Yes" ? "Sí" : "No"}</p>
                                    )}
                                  </div>
                                  {(nestedOwner?.isUsCitizen ?? "No") === "Yes" ? (
                                    <div>
                                      <span className="font-bold text-gray-700 text-sm">SSN/EIN:</span>
                                      {editingSection === "owners" ? (
                                        <Controller
                                          name={`owners.${i}.nestedOwners.${nestedIdx}.tin` as never}
                                          control={control}
                                          render={({ field }) => (
                                            <SSNEINInput
                                              value={(field.value as string) ?? ""}
                                              onChange={(digits) => field.onChange(digits)}
                                              label="SSN / EIN"
                                              showLabel={false}
                                            />
                                          )}
                                        />
                                      ) : (
                                        <p className="text-gray-900 text-sm">{String(obfuscateSSNEIN(nestedOwner?.tin, true))}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="font-bold text-gray-700 text-sm">Pasaporte:</span>
                                      {editingSection === "owners" ? (
                                        <Controller
                                          name={`owners.${i}.nestedOwners.${nestedIdx}.passportImage` as never}
                                          control={control}
                                          render={({ field }) => (
                                            <input 
                                              type="file" 
                                              accept="image/*" 
                                              className="input mt-1" 
                                              onChange={(e) => field.onChange(e.target.files?.[0]?.name || "")}
                                            />
                                          )}
                                        />
                                      ) : (
                                        <p className="text-gray-900 text-sm">{nestedOwner?.passportImage ? "Archivo subido" : "No especificado"}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Ownership Summary */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-700">Total de propiedad:</span>
              <span className={`text-lg font-semibold ${totalOwnership === 100 ? "text-green-600" : totalOwnership > 100 ? "text-red-600" : "text-blue-600"}`}>
                {totalOwnership}%
              </span>
            </div>
            {totalOwnership !== 100 && (
              <p className="text-sm text-gray-600 mt-1">
                {totalOwnership < 100 
                  ? `Faltan ${100 - totalOwnership}% para completar 100%`
                  : `Excede 100% por ${totalOwnership - 100}%`
                }
              </p>
            )}
          </div>
        </div>

        {/* Administrative Information */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Información Administrativa</h3>
            <EditButton 
              onClick={() => handleEdit("admin")} 
              label="Administrativo" 
              isEditing={editingSection === "admin"}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            {entityType === "LLC" ? (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-bold text-gray-700">¿Todos los socios son gerentes?</span>
                  {editingSection === "admin" ? (
                    <Controller
                      name={"admin.managersAllOwners"}
                      control={control}
                      render={({ field }) => (
                        <select className="input mt-1" {...field}>
                          <option value="Yes">Sí</option>
                          <option value="No">No</option>
                        </select>
                      )}
                    />
                  ) : (
                    <p className="text-gray-900">{adminData?.managersAllOwners === "Yes" ? "Sí" : "No"}</p>
                  )}
                </div>
                <div>
                  <span className="font-bold text-gray-700">Número de gerentes:</span>
                  {editingSection === "admin" ? (
                    <Controller
                      name={"admin.managersCount"}
                      control={control}
                      render={({ field }) => (
                        <input type="number" min={1} className="input mt-1 w-24" {...field} />
                      )}
                    />
                  ) : (
                    <p className="text-gray-900">{adminData?.managersCount ?? 1}</p>
                  )}
                </div>
              </div>
                
                {/* Manager Details - Always show when managersAllOwners is "Yes", or when "No" and managersCount is set */}
                {((adminData?.managersAllOwners === "Yes" && ownersCount > 0) || (adminData?.managersAllOwners === "No" && adminData?.managersCount)) && (
                  <div className="mt-4 space-y-4">
                    <h4 className="text-md font-semibold text-gray-800">Detalles de los Gerentes</h4>
                    {Array.from({ length: Math.min(
                      adminData?.managersAllOwners === "Yes" 
                        ? ownersCount 
                        : (adminData?.managersCount || 1), 
                      6
                    ) }).map((_, i) => {
                      const managerName = (adminData as any)?.[`manager${i + 1}Name`] as string | undefined;
                      const managerAddress = (adminData as any)?.[`manager${i + 1}Address`] as string | undefined;
                      // Get owner data directly from watch to ensure we have the latest data
                      // Watch the specific owner fields to get real-time updates
                      const ownerFullName = (watch(`owners.${i}.fullName` as never) as unknown) as string | undefined;
                      const ownerAddress = (watch(`owners.${i}.address` as never) as unknown) as string | undefined;
                      // Fallback to ownersData if watch doesn't return a value
                      const currentOwners = (watch("owners") || ownersData || []) as Array<{
                        fullName?: string;
                        address?: string;
                      }>;
                      const ownerFromData = (currentOwners[i] || {}) as {
                        fullName?: string;
                        address?: string;
                      };
                      
                      // If managersAllOwners is "Yes", use owner data (since managers = owners)
                      // If managersAllOwners is "No", use manager data from adminData
                      const displayName = adminData?.managersAllOwners === "Yes" 
                        ? (ownerFullName || ownerFromData?.fullName || "")
                        : (managerName || "");
                      const displayAddress = adminData?.managersAllOwners === "Yes"
                        ? (ownerAddress || ownerFromData?.address || "")
                        : (managerAddress || "");
                      
                      return (
                        <div key={i} className="bg-white rounded-lg p-4 border border-gray-200">
                          <h5 className="text-sm font-semibold text-gray-700 mb-2">Gerente {i + 1}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <span className="font-bold text-gray-700 text-sm">Nombre completo:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.manager${i + 1}Name` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <input className="input mt-1" {...field} />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900 text-sm">{displayName || "No especificado"}</p>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-gray-700 text-sm">Dirección:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.manager${i + 1}Address` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <input className="input mt-1" {...field} />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900 text-sm">{displayAddress || "No especificado"}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-gray-700">¿Todos los accionistas son directores?</span>
                    {editingSection === "admin" ? (
                      <Controller
                        name={"admin.directorsAllOwners"}
                        control={control}
                        render={({ field }) => (
                          <select className="input mt-1" {...field}>
                            <option value="Yes">Sí</option>
                            <option value="No">No</option>
                          </select>
                        )}
                      />
                    ) : (
                      <p className="text-gray-900">{adminData?.directorsAllOwners === "Yes" ? "Sí" : "No"}</p>
                    )}
                  </div>
                  {adminData?.directorsAllOwners === "No" && (
                    <div>
                      <span className="font-bold text-gray-700">Número de directores:</span>
                      {editingSection === "admin" ? (
                        <Controller
                          name={"admin.directorsCount"}
                          control={control}
                          render={({ field }) => (
                            <input type="number" min={1} className="input mt-1 w-24" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{adminData?.directorsCount ?? 1}</p>
                      )}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-gray-700">¿Todos los accionistas son oficiales?</span>
                    {editingSection === "admin" ? (
                      <Controller
                        name={"admin.officersAllOwners"}
                        control={control}
                        render={({ field }) => (
                          <select className="input mt-1" {...field}>
                            <option value="Yes">Sí</option>
                            <option value="No">No</option>
                          </select>
                        )}
                      />
                    ) : (
                      <p className="text-gray-900">{adminData?.officersAllOwners === "Yes" ? "Sí" : "No"}</p>
                    )}
                  </div>
                  {adminData?.officersAllOwners === "No" && (
                    <div>
                      <span className="font-bold text-gray-700">Número de oficiales:</span>
                      {editingSection === "admin" ? (
                        <Controller
                          name={"admin.officersCount"}
                          control={control}
                          render={({ field }) => (
                            <input type="number" min={1} className="input mt-1 w-24" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{adminData?.officersCount ?? 1}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Officer roles (when all owners are officers) */}
                {(adminData?.officersAllOwners === "Yes" || watch("admin.officersAllOwners") === "Yes") && (
                  <div className="mt-6 space-y-4">
                    <h4 className="text-md font-bold text-gray-900">Roles de Oficiales</h4>
                    <div className="space-y-3">
                      {Array.from({ length: watch("ownersCount") || 1 }).map((_, idx) => {
                        const ownerName = watch(`owners.${idx}.fullName`) as string;
                        const officerRole = watch(`admin.shareholderOfficer${idx + 1}Role`) as string;
                        const nameStr = ownerName || `Accionista ${idx + 1}`;
                        const roleStr = officerRole || "Sin asignar";
                        return (
                          <div key={idx} className="rounded-lg border border-gray-100 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <span className="font-bold text-gray-700">Accionista:</span>
                                <p className="text-gray-900">{nameStr}</p>
                              </div>
                              <div>
                                <span className="font-bold text-gray-700">Rol:</span>
                                {editingSection === "admin" ? (
                                  <Controller
                                    name={`admin.shareholderOfficer${idx + 1}Role` as never}
                                    control={control}
                                    render={({ field }) => (
                                      <select className="input mt-1" {...field}>
                                        <option value="">Seleccionar rol</option>
                                        <option value="President">President</option>
                                        <option value="Vice-President">Vice-President</option>
                                        <option value="Treasurer">Treasurer</option>
                                        <option value="Secretary">Secretary</option>
                                      </select>
                                    )}
                                  />
                                ) : (
                                  <p className="text-gray-900">{roleStr}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Directors list (when not all owners) */}
                {adminData?.directorsAllOwners === "No" && (adminData?.directorsCount ?? 0) > 0 && (
                  <div className="mt-6 space-y-4">
                    <h4 className="text-md font-bold text-gray-900">Directores</h4>
                    {Array.from({ length: adminData?.directorsCount || 0 }).map((_, idx) => {
                      const name = watch(`admin.director${idx + 1}Name`);
                      const address = watch(`admin.director${idx + 1}Address`);
                      const nameStr = (name as string | undefined) || "No especificado";
                      const addressStr = (address as string | undefined) || "No especificado";
                      return (
                        <div key={idx} className="rounded-lg border border-gray-100 p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <span className="font-bold text-gray-700">Nombre:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.director${idx + 1}Name` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <input className="input mt-1" {...field} />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900">{nameStr}</p>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-gray-700">Dirección:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.director${idx + 1}Address` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <AddressAutocomplete
                                      placeholder="Escriba y seleccione la dirección"
                                      value={(field.value as string) ?? ""}
                                      onChangeText={field.onChange}
                                      onSelect={(addr) => field.onChange(addr.fullAddress)}
                                    />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900">{addressStr}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Officers list (when not all owners) */}
                {adminData?.officersAllOwners === "No" && (adminData?.officersCount ?? 0) > 0 && (
                  <div className="mt-6 space-y-4">
                    <h4 className="text-md font-bold text-gray-900">Oficiales</h4>
                    {Array.from({ length: adminData?.officersCount || 0 }).map((_, idx) => {
                      const name = watch(`admin.officer${idx + 1}Name`);
                      const role = watch(`admin.officer${idx + 1}Role`);
                      const address = watch(`admin.officer${idx + 1}Address`);
                      const nameStr = (name as string | undefined) || "No especificado";
                      const roleStr = (role as string | undefined) || "No especificado";
                      const addressStr = (address as string | undefined) || "No especificado";
                      return (
                        <div key={idx} className="rounded-lg border border-gray-100 p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <span className="font-bold text-gray-700">Nombre:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.officer${idx + 1}Name` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <input className="input mt-1" {...field} />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900">{nameStr}</p>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-gray-700">Rol:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.officer${idx + 1}Role` as never}
                                  control={control}
                                  render={({ field }) => {
                                    // Get all officer roles to track exclusivity
                                    const allOfficerRoles = Array.from({ length: adminData?.officersCount || 0 }).map((_, otherIdx) => 
                                      watch(`admin.officer${otherIdx + 1}Role`) as string
                                    ).filter(role => role && role !== "");
                                    
                                    const currentRole = field.value as string;
                                    const otherSelectedRoles = allOfficerRoles.filter((_, roleIdx) => roleIdx !== idx);
                                    const availableRoles = ["President", "Vice-President", "Treasurer", "Secretary"];
                                    const availableOptions = availableRoles.filter(role => 
                                      !otherSelectedRoles.includes(role)
                                    );
                                    
                                    return (
                                      <select
                                        className="input mt-1"
                                        value={currentRole || ""}
                                        onChange={(e) => {
                                          field.onChange(e);
                                          // If the new role was previously selected by another officer, clear it
                                          const newRole = e.target.value;
                                          if (newRole && newRole !== "") {
                                            Array.from({ length: adminData?.officersCount || 0 }).forEach((_, otherIdx) => {
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
                              ) : (
                                <p className="text-gray-900">{roleStr}</p>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-gray-700">Dirección:</span>
                              {editingSection === "admin" ? (
                                <Controller
                                  name={`admin.officer${idx + 1}Address` as never}
                                  control={control}
                                  render={({ field }) => (
                                    <AddressAutocomplete
                                      placeholder="Escriba y seleccione la dirección"
                                      value={(field.value as string) ?? ""}
                                      onChangeText={field.onChange}
                                      onSelect={(addr) => field.onChange(addr.fullAddress)}
                                    />
                                  )}
                                />
                              ) : (
                                <p className="text-gray-900">{addressStr}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Managers list (LLC, when not all owners) */}
            {entityType === "LLC" && adminData?.managersAllOwners === "No" && (adminData?.managersCount ?? 0) > 0 && (
              <div className="mt-6 space-y-4">
                <h4 className="text-md font-bold text-gray-900">Gerentes</h4>
                {Array.from({ length: adminData?.managersCount || 0 }).map((_, idx) => {
                  const name = watch(`admin.manager${idx + 1}Name`);
                  const address = watch(`admin.manager${idx + 1}Address`);
                  const nameStr = (name as string | undefined) || "No especificado";
                  const addressStr = (address as string | undefined) || "No especificado";
                  return (
                    <div key={idx} className="rounded-lg border border-gray-100 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="font-bold text-gray-700">Nombre:</span>
                          {editingSection === "admin" ? (
                            <Controller
                              name={`admin.manager${idx + 1}Name` as never}
                              control={control}
                              render={({ field }) => (
                                <input className="input mt-1" {...field} />
                              )}
                            />
                          ) : (
                            <p className="text-gray-900">{nameStr}</p>
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-gray-700">Dirección:</span>
                          {editingSection === "admin" ? (
                            <Controller
                              name={`admin.manager${idx + 1}Address` as never}
                              control={control}
                              render={({ field }) => (
                                <AddressAutocomplete
                                  placeholder="Escriba y seleccione la dirección"
                                  value={(field.value as string) ?? ""}
                                  onChangeText={field.onChange}
                                  onSelect={(addr) => field.onChange(addr.fullAddress)}
                                />
                              )}
                            />
                          ) : (
                            <p className="text-gray-900">{addressStr}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <button
            type="button"
            className="btn"
            onClick={() => setStep(3)}
          >
            Atrás
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-sm underline text-blue-600 hover:text-blue-700"
              onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}
            >
              Guardar y continuar más tarde
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAgreementModal(true)}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* Agreement Recommendation Modal */}
      {showAgreementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowAgreementModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6">
            {/* Close button */}
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl leading-none"
              onClick={() => setShowAgreementModal(false)}
            >
              ×
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">A</div>
              <div className="text-lg font-semibold text-gray-900">Avenida Legal</div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Antes de continuar, te recomendamos altamente que también tengas un {agreementName}.
            </h3>
            <p className="text-sm text-gray-600 mb-4">¿Por qué es tan importante?</p>
            <p className="text-gray-800 mb-4">
              Podría salvar tu empresa si las cosas no quedan bien claras desde el principio, ahorrar cientos de miles de dólares en litigios entre socios.{' '}
              <a
                href="https://avenidalegal.com/blog/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-700 hover:text-blue-800"
              >
                Leer nuestro artículo que te explica al detalle
              </a>
            </p>
            <p className="text-gray-900 font-medium mb-6">Inversión asociada: $600 USD.</p>

            {/* Primary action on top */}
            <button
              type="button"
              className="btn btn-primary w-full mb-4"
              onClick={() => {
                try {
                  setValue("admin.wantAgreement", "Yes" as never);
                } catch {}
                setWantsAgreement(true);
                setShowAgreementModal(false);
                setStep(5);
              }}
            >
              Lo quiero
            </button>

            {/* Link at bottom */}
            <div className="text-center">
              <button
                type="button"
                className="text-sm underline text-gray-600 hover:text-gray-800"
                onClick={() => {
                  try {
                    setValue("admin.wantAgreement", "No" as never);
                  } catch {}
                  setWantsAgreement(false);
                  setShowAgreementModal(false);
                  setStep(9); // Go directly to checkout when skipping agreement
                }}
              >
                Quiero continuar con el alto riesgo que esto conlleva
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
