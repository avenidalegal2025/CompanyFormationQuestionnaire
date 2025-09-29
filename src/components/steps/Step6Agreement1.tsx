"use client";

import type { StepProps } from "./types";

export default function Step6Agreement1({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch } = form;
  const entityType = watch("company.entityType");
  const isCorp = entityType === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Dueños & Roles</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">¿Cuánto capital ha invertido cada dueño?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_capitalPerOwner")} />
              </div>
              <div>
                <label className="label">¿Habrán responsabilidades específicas para cada dueño?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_specificResponsibilities")} />
              </div>
              <div>
                <label className="label">¿Hay cierta cantidad de horas que el accionista esté comprometido a trabajar?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_hoursCommitment")} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Aportaciones de capital: ¿Cuánto dinero aporta cada dueño?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_capitalContributions")} />
              </div>
              <div>
                <label className="label">¿Ambos serán miembros administradores (firmar/decidir)?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_managingMembers")} />
              </div>
              <div>
                <label className="label">¿Habrá roles específicos para cada parte?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_specificRoles")} />
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


