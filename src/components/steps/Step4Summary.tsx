// src/components/steps/Step4Summary.tsx
"use client";

import { useMemo, useState } from "react";
import { Controller } from "react-hook-form";
import HeroBanner from "@/components/HeroBanner";
import type { StepProps } from "./types";

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

export default function Step4Summary({ form, setStep, onSave, onNext }: StepProps) {
  const { watch, control } = form;

  // Get all form data
  const companyData = watch("company");
  const ownersData = useMemo(() => watch("owners") || [], [watch]);
  const ownersCount = watch("ownersCount") || 1;

  // Edit state management
  const [editingSection, setEditingSection] = useState<string | null>(null);

  // Edit functionality
  const handleEdit = (section: string) => {
    setEditingSection(section);
  };

  const handleSave = () => {
    setEditingSection(null);
  };

  const handleCancel = () => {
    setEditingSection(null);
  };

  // Obfuscate SSN/EIN with dashes
  const obfuscateSSNEIN = (value: string | undefined) => {
    if (!value) return "No especificado";
    const digits = value.replace(/\D/g, "");
    if (digits.length === 9) {
      // SSN format: XXX-XX-XXXX
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    } else if (digits.length === 9) {
      // EIN format: XX-XXXXXXX
      return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
    }
    return value;
  };

  // Calculate total ownership percentage
  const totalOwnership = useMemo(() => {
    return ownersData.reduce((total: number, owner: { 
      ownership?: number | string;
      isUsCitizen?: string;
      tin?: string;
      passportImage?: string;
    }) => {
      return total + (Number(owner?.ownership) || 0);
    }, 0);
  }, [ownersData]);

  const entityType = companyData?.entityType;
  const isCorp = entityType === "C-Corp";
  const groupLabel = isCorp ? "accionistas" : "socios";

  return (
    <section className="space-y-6">
      <HeroBanner title="Resumen de la Información" />

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
                <span className="font-medium text-gray-700">Estado de formación:</span>
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
                <span className="font-medium text-gray-700">Tipo de entidad:</span>
                {editingSection === "company" ? (
                  <Controller
                    name="company.entityType"
                    control={control}
                    render={({ field }) => (
                      <select className="input mt-1" {...field}>
                        <option value="LLC">LLC</option>
                        <option value="C-Corp">C-Corp</option>
                      </select>
                    )}
                  />
                ) : (
                  <p className="text-gray-900">{companyData?.entityType || "No especificado"}</p>
                )}
              </div>
              <div>
                <span className="font-medium text-gray-700">Nombre de la empresa:</span>
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
                <span className="font-medium text-gray-700">Propósito del negocio:</span>
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
            
            {companyData?.hasUsaAddress === "Yes" && (
              <div className="mt-4">
                <span className="font-medium text-gray-700">Dirección:</span>
                <p className="text-gray-900">
                  {[companyData?.addressLine1, companyData?.addressLine2, companyData?.city, companyData?.state, companyData?.postalCode, companyData?.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}

            {companyData?.hasUsPhone === "Yes" && (
              <div>
                <span className="font-medium text-gray-700">Teléfono:</span>
                <p className="text-gray-900">{companyData?.usPhoneNumber || "No especificado"}</p>
              </div>
            )}

            {isCorp && companyData?.numberOfShares && (
              <div>
                <span className="font-medium text-gray-700">Número de acciones:</span>
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
          <div className="space-y-4">
            {Array.from({ length: ownersCount }).map((_, i) => {
              const owner = (ownersData[i] || {}) as {
                fullName?: string;
                ownership?: number | string;
                address?: string;
                isUsCitizen?: string;
                tin?: string;
                passportImage?: string;
              };
              return (
                <div key={i} className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-3">
                    {isCorp ? "Accionista" : "Socio"} {i + 1}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-700">Nombre completo:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.fullName` as never}
                          control={control}
                          render={({ field }) => (
                            <input className="input mt-1" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.fullName || "No especificado"}</p>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Porcentaje de propiedad:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.ownership` as never}
                          control={control}
                          render={({ field }) => (
                            <input 
                              type="number" 
                              min="0" 
                              max="100" 
                              className="input mt-1" 
                              {...field} 
                            />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.ownership || 0}%</p>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Dirección:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.address` as never}
                          control={control}
                          render={({ field }) => (
                            <input className="input mt-1" {...field} />
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.address || "No especificado"}</p>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Ciudadano/Residente de EE.UU.:</span>
                      {editingSection === "owners" ? (
                        <Controller
                          name={`owners.${i}.isUsCitizen` as never}
                          control={control}
                          render={({ field }) => (
                            <select className="input mt-1" {...field}>
                              <option value="No">No</option>
                              <option value="Yes">Sí</option>
                            </select>
                          )}
                        />
                      ) : (
                        <p className="text-gray-900">{owner?.isUsCitizen === "Yes" ? "Sí" : "No"}</p>
                      )}
                    </div>
                    {owner?.isUsCitizen === "Yes" ? (
                      <div>
                        <span className="font-medium text-gray-700">SSN/EIN:</span>
                        {editingSection === "owners" ? (
                          <Controller
                            name={`owners.${i}.tin` as never}
                            control={control}
                            render={({ field }) => (
                              <input className="input mt-1" {...field} />
                            )}
                          />
                        ) : (
                          <p className="text-gray-900">{obfuscateSSNEIN(owner?.tin)}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span className="font-medium text-gray-700">Pasaporte:</span>
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
                </div>
              );
            })}
          </div>
          
          {/* Ownership Summary */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Total de propiedad:</span>
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
              onClick={() => void onSave?.()}
            >
              Guardar y continuar más tarde
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (onNext ? void onNext() : alert("Formulario enviado exitosamente!"))}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
