// src/components/steps/Step4Summary.tsx
"use client";

import { useMemo } from "react";
import HeroBanner from "@/components/HeroBanner";
import type { StepProps } from "./types";

export default function Step4Summary({ form, setStep, onSave, onNext }: StepProps) {
  const { watch } = form;

  // Get all form data
  const companyData = watch("company");
  const ownersData = watch("owners") || [];
  const ownersCount = watch("ownersCount") || 1;
  const adminData = watch("admin");

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
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Información de la Empresa</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-gray-700">Estado de formación:</span>
                <p className="text-gray-900">{companyData?.formationState || "No especificado"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Tipo de entidad:</span>
                <p className="text-gray-900">{companyData?.entityType || "No especificado"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Nombre de la empresa:</span>
                <p className="text-gray-900">{companyData?.companyName || "No especificado"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Propósito del negocio:</span>
                <p className="text-gray-900">{companyData?.businessPurpose || "No especificado"}</p>
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
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Información de los {groupLabel} ({ownersCount})
          </h3>
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
                      <p className="text-gray-900">{owner?.fullName || "No especificado"}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Porcentaje de propiedad:</span>
                      <p className="text-gray-900">{owner?.ownership || 0}%</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Dirección:</span>
                      <p className="text-gray-900">{owner?.address || "No especificado"}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Ciudadano/Residente de EE.UU.:</span>
                      <p className="text-gray-900">{owner?.isUsCitizen === "Yes" ? "Sí" : "No"}</p>
                    </div>
                    {owner?.isUsCitizen === "Yes" ? (
                      <div>
                        <span className="font-medium text-gray-700">SSN/EIN:</span>
                        <p className="text-gray-900">{owner?.tin || "No especificado"}</p>
                      </div>
                    ) : (
                      <div>
                        <span className="font-medium text-gray-700">Pasaporte:</span>
                        <p className="text-gray-900">{owner?.passportImage ? "Archivo subido" : "No especificado"}</p>
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

        {/* Admin Information */}
        {adminData && Object.keys(adminData).length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Información Administrativa</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-600">Los datos administrativos se configurarán en el siguiente paso.</p>
            </div>
          </div>
        )}

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
              onClick={() => (onNext ? void onNext() : setStep(5))}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
