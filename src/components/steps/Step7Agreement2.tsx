"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step7Agreement2({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Capital & Préstamos</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">¿Cómo se añadirán nuevos accionistas, por decisión unánime?, mayoría?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_newShareholdersAdmission")} />
              </div>
              <div>
                <label className="label">Si la corporación necesitara más capital, ¿cómo se haría esto? Típicamente cada accionista es requerido invertir una cantidad en proporción. Si se necesitara $100 mil más en capital, un dueño con el 50% de acciones necesitaría invertir unos 50 mil más.</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_moreCapitalProcess")} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Adición de nuevos miembros a la LLC: ¿Cómo se añadirán? ¿Decisión unánime?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_newMembersAdmission")} />
              </div>
              <div>
                <label className="label">Aportaciones de capital adicionales: ¿Cómo se manejarán si se necesita más dinero? (Ej. $100 mil extra → cada socio aporta según porcentaje)</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_additionalContributions")} />
              </div>
              <div>
                <label className="label">Retiro de aportaciones: ¿Solamente permitido al vender acciones o disolver la compañía?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_withdrawContributions")} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  ¿Habrá préstamos de miembros a la LLC? Si sí, ¿quién y cuánto?
                  <InfoTooltip
                    title="Préstamos de Miembros"
                    body="Los préstamos de miembros a la LLC pueden ser una fuente de financiamiento flexible. Esta cláusula establece si los miembros pueden prestar dinero a la LLC y bajo qué términos."
                  />
                </label>
                <Controller
                  name="agreement.llc_memberLoans"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "No"}
                      onChange={field.onChange}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Member loans"
                      name={field.name}
                    />
                  )}
                />
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


