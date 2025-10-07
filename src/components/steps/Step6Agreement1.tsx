"use client";

import { Controller } from "react-hook-form";
import CurrencyInput from "@/components/CurrencyInput";
import type { StepProps } from "./types";

export default function Step6Agreement1({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control } = form;
  const entityType = watch("company.entityType");
  const isCorp = entityType === "C-Corp";
  
  // Get owners data
  const ownersData = watch("owners") || [];
  const ownersCount = watch("ownersCount") || 1;

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Dueños & Roles</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">¿Cuánto capital ha invertido cada dueño?</label>
                <div className="mt-2 space-y-3">
                  {Array.from({ length: ownersCount }).map((_, idx) => {
                    const ownerName = ownersData[idx]?.fullName || `Accionista ${idx + 1}`;
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                        <div className="text-sm font-medium text-gray-700">
                          {ownerName}:
                        </div>
                        <div>
                          <Controller
                            name={`agreement.corp_capitalPerOwner_${idx}` as never}
                            control={control}
                            render={({ field }) => (
                              <CurrencyInput
                                value={field.value || ""}
                                onChange={field.onChange}
                                placeholder="0.00"
                                className="w-full"
                              />
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">¿Habrán responsabilidades específicas para cada dueño?</label>
                <div className="mt-2 space-y-3">
                  {Array.from({ length: ownersCount }).map((_, idx) => {
                    const ownerName = ownersData[idx]?.fullName || `Accionista ${idx + 1}`;
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                        <div className="text-sm font-medium text-gray-700">
                          {ownerName}:
                        </div>
                        <div>
                          <Controller
                            name={`agreement.corp_specificResponsibilities_${idx}` as never}
                            control={control}
                            render={({ field }) => (
                              <input
                                type="text"
                                className="input w-full"
                                placeholder="CEO, CTO, CFO, etc."
                                value={field.value || ""}
                                onChange={field.onChange}
                              />
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Aportaciones de capital: ¿Cuánto dinero está contribuyendo cada dueño al negocio?</label>
                <div className="mt-2 space-y-3">
                  {Array.from({ length: ownersCount }).map((_, idx) => {
                    const ownerName = ownersData[idx]?.fullName || `Socio ${idx + 1}`;
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                        <div className="text-sm font-medium text-gray-700">
                          {ownerName}:
                        </div>
                        <div>
                          <Controller
                            name={`agreement.llc_capitalContributions_${idx}` as never}
                            control={control}
                            render={({ field }) => (
                              <CurrencyInput
                                value={field.value || ""}
                                onChange={field.onChange}
                                placeholder="0.00"
                                className="w-full"
                              />
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">¿Ambos dueños van a operar el negocio como miembros administradores (con derecho a firmar y tomar decisiones)?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_managingMembers")} />
              </div>
              <div>
                <label className="label">¿Habrá roles específicos para cada parte? (Ej. uno a cargo de marketing, otro de asuntos legales)</label>
                <div className="mt-2 space-y-3">
                  {Array.from({ length: ownersCount }).map((_, idx) => {
                    const ownerName = ownersData[idx]?.fullName || `Socio ${idx + 1}`;
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                        <div className="text-sm font-medium text-gray-700">
                          {ownerName}:
                        </div>
                        <div>
                          <Controller
                            name={`agreement.llc_specificRoles_${idx}` as never}
                            control={control}
                            render={({ field }) => (
                              <input
                                type="text"
                                className="input w-full"
                                placeholder="CEO, CTO, CFO, etc."
                                value={field.value || ""}
                                onChange={field.onChange}
                              />
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(4)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-sm underline text-blue-600" onClick={() => void onSave?.()}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


