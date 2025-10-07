"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step9Agreement4({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Acciones & Sucesión</h2>
        <div className="mt-4 space-y-4">
          {isCorp ? (
            <>
              <div>
                <label className="label flex items-center gap-2">
                  ¿Quiere que los accionistas tengan el derecho de ser los primeros en rechazar una oferta de venta de la compañía?
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los accionistas existentes tengan la primera oportunidad de comprar las acciones de un accionista que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
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
              <div>
                <label className="label">¿Podrán los accionistas libremente transferir sus acciones a sus parientes, o deberá ser esta transferencia sujeta a una decisión unánime, mayoría o el 65.1% de los accionistas?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.corp_transferToRelatives")} />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  En el caso de incapacidad o de la muerte de algún accionista, ¿querrá que los herederos estén obligados a vender las acciones a la compañía, o que lo hagan solo si así lo decide la compañía?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un accionista fallecido o incapacitado deben vender sus acciones a la corporación, evitando que personas no deseadas se conviertan en accionistas."
                  />
                </label>
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
              <div>
                <label className="label flex items-center gap-2">
                  Si en el caso de un divorcio donde las partes no puedan ponerse de acuerdo sobre las acciones de la compañía, ¿quisiera que la compañía tuviera el derecho de comprar a la ex pareja todas las acciones que tengan al precio del mercado?
                  <InfoTooltip
                    title="Política de Divorcio"
                    body="Esta cláusula protege a la corporación de disputas matrimoniales al permitir que la empresa compre las acciones de la ex pareja a precio de mercado, evitando que un cónyuge no deseado se convierta en accionista."
                  />
                </label>
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
              <div>
                <label className="label flex items-center gap-2">
                  ¿Quiere derechos de "tag along" o un "drag along"?
                  <InfoTooltip
                    title="Tag Along / Drag Along"
                    body="Tag Along: Permite que accionistas minoritarios vendan sus acciones cuando un accionista mayoritario vende. Drag Along: Permite que accionistas mayoritarios obliguen a minoritarios a vender cuando ellos venden."
                  />
                </label>
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
            </>
          ) : (
            <>
              <div>
                <label className="label flex items-center gap-2">
                  Derecho de preferencia en venta de participaciones (Right of First Refusal)
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los socios existentes tengan la primera oportunidad de comprar las participaciones de un socio que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
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
              <div>
                <label className="label flex items-center gap-2">
                  En caso de muerte o incapacidad de un miembro: ¿Herederos obligados a vender las participaciones a la LLC?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un socio fallecido o incapacitado deben vender sus participaciones a la LLC, evitando que personas no deseadas se conviertan en socios."
                  />
                </label>
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
              <div>
                <label className="label">Admisión de nuevos socios/partners: ¿Decisión unánime?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_newPartnersAdmission")} />
              </div>
              <div>
                <label className="label">Disolución de la LLC: ¿Decisión unánime?</label>
                <textarea className="input min-h-[80px]" {...register("agreement.llc_dissolutionDecision")} />
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


