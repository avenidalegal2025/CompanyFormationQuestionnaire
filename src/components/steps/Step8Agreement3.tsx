"use client";

import type { StepProps } from "./types";

export default function Step8Agreement3({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Gobierno & Decisiones</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">Venta de la compañía / umbral de decisión</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_saleDecisionThreshold")} />
              </div>
              <div>
                <label className="label">Firmantes de la cuenta bancaria</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_bankSigners")} />
              </div>
              <div>
                <label className="label">Decisiones importantes: umbral</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_majorDecisionThreshold")} />
              </div>
              <div>
                <label className="label">Restricciones en accionistas/ejecutivos/directores</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_restrictions")} />
              </div>
              <div>
                <label className="label">Cláusula de no competencia</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_nonCompete")} />
              </div>
              <div>
                <label className="label">Empates en votaciones / desempate</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_voteTieBreaker")} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Venta de la compañía: umbral de decisión</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_companySaleDecision")} />
              </div>
              <div>
                <label className="label">Socio responsable de impuestos (Tax Partner)</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_taxPartner")} />
              </div>
              <div>
                <label className="label">Firmantes de la cuenta bancaria</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_bankSigners")} />
              </div>
              <div>
                <label className="label">Decisiones mayores</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_majorDecisions")} />
              </div>
              <div>
                <label className="label">Decisiones menores</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_minorDecisions")} />
              </div>
              <div>
                <label className="label">Restricciones a miembros administradores</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_managerRestrictions")} />
              </div>
              <div>
                <label className="label">Covenant de no competencia</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_nonCompete")} />
              </div>
              <div>
                <label className="label">Empate (deadlock): resolución</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_deadlockResolution")} />
              </div>
              <div>
                <label className="label">Seguro "Key Man"</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_keyManInsurance")} />
              </div>
              <div>
                <label className="label">Resolución de disputas</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_disputeResolution")} />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(6)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-sm underline text-blue-600" onClick={() => void onSave?.()}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


