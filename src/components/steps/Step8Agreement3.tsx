"use client";

import { Controller } from "react-hook-form";
import HeroVideo from "@/components/HeroVideo";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step8Agreement3({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control, formState: { errors } } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <HeroVideo title="Acciones & Sucesión" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Gobierno & Decisiones</h2>
        <div className="mt-6 space-y-10 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Si hubiese una oferta de compra o si usted quisiese vender la compañía, ¿quisiera que esta decisión se tome unánimemente o por mayoría?
                  <InfoTooltip
                    title="Decisión de Venta de la Compañía"
                    body="Esta cláusula establece el proceso para decidir si vender la compañía. Puede requerir decisión unánime (todos los accionistas deben estar de acuerdo) o mayoría (un porcentaje específico de accionistas)."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_saleDecisionThreshold"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="Sale decision threshold"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.corp_saleDecisionThreshold") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-5">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Porcentaje mínimo necesario para aprobar la venta de la compañía por mayoría (por ejemplo, 66.67%)."
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <input
                          type="number"
                          min="50.01"
                          max="99.99"
                          step="0.01"
                          className="input w-full"
                          {...register("agreement.corp_saleDecisionMajority", { 
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99
                          })}
                          onBlur={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              if (value < 50.01) {
                                e.target.value = "50.01";
                              } else if (value > 99.99) {
                                e.target.value = "99.99";
                              }
                            }
                            register("agreement.corp_saleDecisionMajority").onChange(e);
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                  </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Para la cuenta de banco de la compañía, ¿quiere que haya un o dos firmantes?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Si hubiese que hacer una decisión importante (como decisiones que cuesten $….., despedir un empleado, pedir un préstamo, etc.) ¿quisiera que esta decisión se tome unánimemente o por mayoría?
                  <InfoTooltip
                    title="Decisiones Importantes"
                    body="Esta cláusula establece el proceso para tomar decisiones importantes de la corporación. Puede requerir decisión unánime (todos los accionistas deben estar de acuerdo) o mayoría (un porcentaje específico de accionistas)."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_majorDecisionThreshold"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="Major decision threshold"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.corp_majorDecisionThreshold") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-5">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Porcentaje mínimo necesario para aprobar decisiones importantes por mayoría (por ejemplo, 60% o 75%)."
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <input
                          type="number"
                          min="50.01"
                          max="99.99"
                          step="0.01"
                          className="input w-full"
                          {...register("agreement.corp_majorDecisionMajority", { 
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99
                          })}
                          onBlur={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              if (value < 50.01) {
                                e.target.value = "50.01";
                              } else if (value > 99.99) {
                                e.target.value = "99.99";
                              }
                            }
                            register("agreement.corp_majorDecisionMajority").onChange(e);
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
              </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
              </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quieren una cláusula de no competencia? Esto es algo que debe considerar con mucho cuidado. Se puede redactar una cláusula muy estricta para impedir competencia por alguien involucrado en la compañía
                  <InfoTooltip
                    title="Cláusula de No Competencia"
                    body="Un covenant de no competencia impide que los accionistas, ejecutivos o directores compitan con la corporación durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
            </>
          ) : (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Venta de la compañía: ¿Decisión unánime o por mayoría?
                  <InfoTooltip
                    title="Decisión de Venta de la Compañía (LLC)"
                    body="Esta cláusula establece el proceso para decidir si vender la compañía. Puede requerir decisión unánime (todos los miembros deben estar de acuerdo) o mayoría (un porcentaje específico de miembros)."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_companySaleDecision"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC sale decision"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.llc_companySaleDecision") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label">Porcentaje requerido para mayoría</label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <input
                          type="number"
                          min="50.01"
                          max="99.99"
                          step="0.01"
                          className="input w-full"
                          {...register("agreement.llc_companySaleDecisionMajority", {
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99,
                          })}
                          onBlur={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              if (value < 50.01) {
                                e.target.value = "50.01";
                              } else if (value > 99.99) {
                                e.target.value = "99.99";
                              }
                            }
                            register("agreement.llc_companySaleDecisionMajority").onChange(e);
                          }}
                        />
              </div>
                      <span className="text-sm text-gray-500">%</span>
              </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
              </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quién será el socio responsable de impuestos (Tax Partner)?
                  <InfoTooltip
                    title="Tax Partner"
                    body="El socio responsable de impuestos es quien se encarga de presentar las declaraciones de impuestos de la LLC y mantener los registros fiscales. Debe ser un miembro de la LLC."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Non Compete: ¿Covenant de no competencia entre los dueños?
                  <InfoTooltip
                    title="Covenant de No Competencia"
                    body="Un covenant de no competencia impide que los socios compitan con la LLC durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-6 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  Cuenta bancaria: ¿Uno o dos firmantes para retirar dinero?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
              <div>
                <label className="label flex items-center gap-2">Decisiones mayores (ej. &gt; $10,000):
                  <InfoTooltip
                    title="Decisiones Mayores"
                    body="Decisiones de alto impacto financiero u operativo (por ejemplo, gastos superiores a un umbral, contratación/despido clave, endeudamiento). Especifique quién debe aprobarlas."
                  />
                </label>
                <Controller
                  name="agreement.llc_majorDecisions"
                  control={control}
                  render={({ field }) => (
                    <div className="w-[43%] min-w-[320px]">
                      <SegmentedToggle
                        value={field.value || "Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Unánime", label: "Unánime" },
                          { value: "Cualquiera de los dueños", label: "Cualquiera de los dueños" },
                        ]}
                        ariaLabel="LLC major decisions"
                        name={field.name}
                      />
                    </div>
                  )}
                />
              </div>
              <div>
                <label className="label flex items-center gap-2">Decisiones menores (&lt; $10,000):
                  <InfoTooltip
                    title="Decisiones Menores"
                    body="Asuntos operativos cotidianos con menor impacto económico. Especifique si requieren unanimidad o si cualquiera de los dueños puede decidir."
                  />
                </label>
                <Controller
                  name="agreement.llc_minorDecisions"
                  control={control}
                  render={({ field }) => (
                    <div className="w-[43%] min-w-[320px]">
                      <SegmentedToggle
                        value={field.value || "Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Unánime", label: "Unánime" },
                          { value: "Cualquiera de los dueños", label: "Cualquiera de los dueños" },
                        ]}
                        ariaLabel="LLC minor decisions"
                        name={field.name}
                      />
              </div>
                  )}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(6)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-base underline text-blue-600" onClick={() => void onSave?.()}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={() => void onNext?.()}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


