"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step9Agreement4({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control, formState: { errors } } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Acciones & Sucesión</h2>
        <div className="mt-6 space-y-10 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quiere que los accionistas tengan el derecho de ser los primeros en rechazar una oferta de venta de la compañía?
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los accionistas existentes tengan la primera oportunidad de comprar las acciones de un accionista que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_rofr"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Right of first refusal"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Podrán los accionistas libremente transferir sus acciones a sus parientes, o deberá ser esta transferencia sujeta a una decisión unánime o mayoría de los accionistas?
                  <InfoTooltip
                    title="Transferencia de Acciones a Parientes"
                    body="Esta cláusula establece si los accionistas pueden transferir sus acciones a familiares sin restricciones, o si requiere aprobación de otros accionistas. Puede ser libre, requerir decisión unánime, o requerir mayoría."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_transferToRelatives"
                    control={control}
                    render={({ field }) => (
                      <select
                        className="input"
                        {...field}
                      >
                        <option value="">Seleccionar opción</option>
                        <option value="Sí, podrán transferir libremente sus acciones.">
                          Sí, podrán transferir libremente sus acciones.
                        </option>
                        <option value="Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.">
                          Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.
                        </option>
                        <option value="Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.">
                          Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.
                        </option>
                      </select>
                    )}
                  />
                </div>
                {watch("agreement.corp_transferToRelatives") === "Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas." && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-5">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Porcentaje mínimo necesario para aprobar la transferencia por mayoría (por ejemplo, 66.67%)."
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
                          {...register("agreement.corp_transferToRelativesMajority", { 
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
                            register("agreement.corp_transferToRelativesMajority").onChange(e);
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
                  En el caso de incapacidad o de la muerte de algún accionista, ¿querrá que los herederos estén obligados a vender las acciones a la compañía, o que lo hagan solo si así lo decide la compañía?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un accionista fallecido o incapacitado deben vender sus acciones a la corporación, evitando que personas no deseadas se conviertan en accionistas."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w=[420px] md:w-[420px]">
                  <Controller
                    name="agreement.corp_incapacityHeirsPolicy"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Incapacity heirs policy"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Si en el caso de un divorcio donde las partes no puedan ponerse de acuerdo sobre las acciones de la compañía, ¿quisiera que la compañía tuviera el derecho de comprar a la ex pareja todas las acciones que tengan al precio del mercado?
                  <InfoTooltip
                    title="Política de Divorcio"
                    body="Esta cláusula protege a la corporación de disputas matrimoniales al permitir que la empresa compre las acciones de la ex pareja a precio de mercado, evitando que un cónyuge no deseado se convierta en accionista."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_divorceBuyoutPolicy"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Divorce buyout policy"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quiere derechos de "tag along" o un "drag along"?
                  <InfoTooltip
                    title="Tag Along / Drag Along"
                    body="Tag Along: Permite que accionistas minoritarios vendan sus acciones cuando un accionista mayoritario vende. Drag Along: Permite que accionistas mayoritarios obliguen a minoritarios a vender cuando ellos venden."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_tagDragRights"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Tag along drag along rights"
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
                  Derecho de preferencia en venta de participaciones (Right of First Refusal)
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los socios existentes tengan la primera oportunidad de comprar las participaciones de un socio que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_rofr"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Right of first refusal"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  En caso de muerte o incapacidad de un miembro: ¿Herederos obligados a vender las participaciones a la LLC?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un socio fallecido o incapacitado deben vender sus participaciones a la LLC, evitando que personas no deseadas se conviertan en socios."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_incapacityHeirsPolicy"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Incapacity heirs policy"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Admisión de nuevos socios/partners: ¿Decisión unánime o por mayoría?
                  <InfoTooltip
                    title="Admisión de Nuevos Socios"
                    body="Esta cláusula establece el proceso para añadir nuevos socios a la LLC. Puede requerir decisión unánime o mayoría con un porcentaje específico."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_newPartnersAdmission"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC new partners admission"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.llc_newPartnersAdmission") === "Mayoría" && (
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
                          {...register("agreement.llc_newPartnersMajority", {
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
                            register("agreement.llc_newPartnersMajority").onChange(e);
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
                  Disolución de la LLC: ¿Decisión unánime o por mayoría?
                  <InfoTooltip
                    title="Disolución de la LLC"
                    body="Esta cláusula establece el proceso para cerrar la LLC. Puede requerir decisión unánime o mayoría con un porcentaje específico."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_dissolutionDecision"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC dissolution decision"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.llc_dissolutionDecision") === "Mayoría" && (
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
                          {...register("agreement.llc_dissolutionDecisionMajority", {
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
                            register("agreement.llc_dissolutionDecisionMajority").onChange(e);
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
              </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
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


