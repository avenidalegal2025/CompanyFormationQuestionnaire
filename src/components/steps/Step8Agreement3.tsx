"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step8Agreement3({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Gobierno & Decisiones</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label">Si hubiese una oferta de compra o si usted quisiese vender la compañía, ¿quisiera que esta decisión se tome unánimemente, por mayoría o con un 65.1% de los accionistas?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_saleDecisionThreshold")} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  Para la cuenta de banco de la compañía, ¿quiere que haya un o dos firmantes?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                <Controller
                  name="agreement.corp_bankSigners"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Un firmante"}
                      onChange={field.onChange}
                      options={[
                        { value: "Un firmante", label: "Un firmante" },
                        { value: "Dos firmantes", label: "Dos firmantes" },
                      ]}
                      ariaLabel="Bank signers"
                      name={field.name}
                    />
                  )}
                />
              </div>
              <div>
                <label className="label">Si hubiese que hacer una decisión importante (como decisiones que cuesten $….., despedir un empleado, pedir un préstamo, etc.), ¿quisiera que esta decisión fuese tomada por mayoría, unanimidad o un 65.1% de los miembros?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_majorDecisionThreshold")} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  ¿Quieren una cláusula de no competencia? Esto es algo que debe considerar con mucho cuidado. Se puede redactar una cláusula muy estricta para impedir competencia por alguien involucrado en la compañía
                  <InfoTooltip
                    title="Cláusula de No Competencia"
                    body="Un covenant de no competencia impide que los accionistas, ejecutivos o directores compitan con la corporación durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                <Controller
                  name="agreement.corp_nonCompete"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "No"}
                      onChange={field.onChange}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Non compete covenant"
                      name={field.name}
                    />
                  )}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Venta de la compañía: ¿Decisión unánime?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_companySaleDecision")} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  ¿Quién será el socio responsable de impuestos (Tax Partner)?
                  <InfoTooltip
                    title="Tax Partner"
                    body="El socio responsable de impuestos es quien se encarga de presentar las declaraciones de impuestos de la LLC y mantener los registros fiscales. Debe ser un miembro de la LLC."
                  />
                </label>
                <Controller
                  name="agreement.llc_taxPartner"
                  control={control}
                  render={({ field }) => (
                    <select className="input mt-1" {...field}>
                      <option value="">Seleccionar socio</option>
                      {Array.from({ length: watch("ownersCount") || 1 }).map((_, idx) => {
                        const ownerName = watch(`owners.${idx}.fullName`) || `Socio ${idx + 1}`;
                        return (
                          <option key={idx} value={ownerName}>
                            {ownerName}
                          </option>
                        );
                      })}
                    </select>
                  )}
                />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  Non Compete: ¿Covenant de no competencia entre los dueños?
                  <InfoTooltip
                    title="Covenant de No Competencia"
                    body="Un covenant de no competencia impide que los socios compitan con la LLC durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                <Controller
                  name="agreement.llc_nonCompete"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "No"}
                      onChange={field.onChange}
                      options={[
                        { value: "Yes", label: "Sí" },
                        { value: "No", label: "No" },
                      ]}
                      ariaLabel="Non compete covenant"
                      name={field.name}
                    />
                  )}
                />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  Cuenta bancaria: ¿Uno o dos firmantes para retirar dinero?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                <Controller
                  name="agreement.llc_bankSigners"
                  control={control}
                  render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Un firmante"}
                      onChange={field.onChange}
                      options={[
                        { value: "Un firmante", label: "Un firmante" },
                        { value: "Dos firmantes", label: "Dos firmantes" },
                      ]}
                      ariaLabel="Bank signers"
                      name={field.name}
                    />
                  )}
                />
              </div>
              <div>
                <label className="label">Decisiones mayores (ej. &gt; $10,000): ¿Unánimes o cualquiera de los dueños?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_majorDecisions")} />
              </div>
              <div>
                <label className="label">Decisiones menores (&lt; $10,000): ¿Unánimes o cualquiera de los dueños?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_minorDecisions")} />
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


