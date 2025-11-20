"use client";

import { Controller } from "react-hook-form";
import HeroVideo from "@/components/HeroVideo";
import CurrencyInput from "@/components/CurrencyInput";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

interface Step6Agreement1Props extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step6Agreement1({ form, setStep, onSave, onNext, session, anonymousId }: Step6Agreement1Props) {
  const { register, watch, control } = form;
  const entityType = watch("company.entityType");
  const isCorp = entityType === "C-Corp";
  
  // Get owners data
  const ownersData = watch("owners") || [];
  const ownersCount = watch("ownersCount") || 1;

  return (
    <section className="space-y-6">
      <HeroVideo title="Dueños & Roles" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Dueños & Roles</h2>
        <div className="mt-6 space-y-10 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-5 max-w-prose">¿Cuánto capital ha invertido cada dueño?
                  <InfoTooltip
                    title="Capital Invertido"
                    body="Monto de dinero que cada dueño ha aportado inicialmente a la compañía. Sirve para documentar la inversión de cada parte."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px] space-y-3">
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
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">¿Habrán responsabilidades específicas para cada dueño?
                  <InfoTooltip
                    title="Responsabilidades Específicas"
                    body="Funciones o cargos de cada dueño (por ejemplo, CEO, CTO, finanzas). Ayuda a aclarar expectativas y autoridad."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_hasSpecificResponsibilities"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Has specific responsibilities"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.corp_hasSpecificResponsibilities") === "Yes" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px] space-y-3">
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
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-5 max-w-prose">Aportaciones de capital: ¿Cuánto dinero está contribuyendo cada dueño al negocio?
                  <InfoTooltip
                    title="Aportaciones de Capital"
                    body="Monto que cada socio aporta al inicio. Se utiliza para definir la inversión de cada socio y, en algunos casos, su porcentaje de participación."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px] space-y-3">
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
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Ambos dueños van a operar el negocio como miembros administradores (con derecho a firmar y tomar decisiones)?
                  <InfoTooltip
                    title="Miembros Administradores"
                    body="Los miembros administradores tienen derecho a firmar documentos y tomar decisiones operativas. Si no todos los miembros son administradores, solo los seleccionados tendrán estos poderes."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                <Controller
                  name="agreement.llc_managingMembers"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Yes"}
                      onChange={field.onChange}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Managing members"
                      name={field.name}
                    />
                  )}
                />
                </div>
                {watch("agreement.llc_managingMembers") === "No" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label">Seleccionar miembros administradores:</label>
                    <div className="space-y-2">
                      {Array.from({ length: ownersCount }).map((_, idx) => {
                        const ownerName = ownersData[idx]?.fullName || `Socio ${idx + 1}`;
                        return (
                          <label key={idx} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              {...register(`agreement.llc_managingMember_${idx}` as never)}
                            />
                            <span className="text-sm text-gray-700">{ownerName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">¿Habrá roles específicos para cada parte? (Ej. uno a cargo de marketing, otro de asuntos legales)
                  <InfoTooltip
                    title="Roles Específicos"
                    body="Funciones o áreas de responsabilidad asignadas a cada socio para organizar la operación del negocio."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_hasSpecificRoles"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Has specific roles"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.llc_hasSpecificRoles") === "Yes" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px] space-y-3">
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
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(4)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-base underline text-blue-600" onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


