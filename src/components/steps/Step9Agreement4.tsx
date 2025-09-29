"use client";

import type { StepProps } from "./types";

export default function Step9Agreement4({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Acciones & Sucesión</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">Derecho de preferencia (ROFR)</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_rofr")} />
              </div>
              <div>
                <label className="label">Transferencias a parientes</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_transferToRelatives")} />
              </div>
              <div>
                <label className="label">Incapacidad o muerte: política</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_incapacityHeirsPolicy")} />
              </div>
              <div>
                <label className="label">Divorcio y compra de acciones</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_divorceBuyoutPolicy")} />
              </div>
              <div>
                <label className="label">Tag along / Drag along</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_tagDragRights")} />
              </div>
              <div>
                <label className="label">Otros comentarios / cláusulas adicionales</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_additionalClauses")} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Derecho de preferencia (ROFR)</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_rofr")} />
              </div>
              <div>
                <label className="label">Incapacidad o muerte: política</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_incapacityHeirsPolicy")} />
              </div>
              <div>
                <label className="label">Admisión de nuevos socios</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_newPartnersAdmission")} />
              </div>
              <div>
                <label className="label">Disolución de la LLC</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_dissolutionDecision")} />
              </div>
              <div>
                <label className="label">Términos específicos acordados</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_specificTerms")} />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(7)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-sm underline text-blue-600" onClick={() => void onSave?.()}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Finalizar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


