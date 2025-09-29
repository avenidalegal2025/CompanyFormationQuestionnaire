"use client";

import type { StepProps } from "./types";

export default function Step7Agreement2({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Capital & Préstamos</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">¿Cómo se añadirán nuevos accionistas?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_newShareholdersAdmission")} />
              </div>
              <div>
                <label className="label">Si se necesitara más capital, ¿cómo se haría?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_moreCapitalProcess")} />
              </div>
              <div>
                <label className="label">¿Cómo retirar fondos?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_withdrawFundsPolicy")} />
              </div>
              <div>
                <label className="label">¿Accionistas podrán prestar a la compañía?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_shareholderLoans")} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Adición de nuevos miembros a la LLC</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_newMembersAdmission")} />
              </div>
              <div>
                <label className="label">Aportaciones adicionales de capital</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_additionalContributions")} />
              </div>
              <div>
                <label className="label">Retiro de aportaciones</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_withdrawContributions")} />
              </div>
              <div>
                <label className="label">Préstamos de miembros a la LLC</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_memberLoans")} />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(5)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-sm underline text-blue-600" onClick={() => void onSave?.()}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


