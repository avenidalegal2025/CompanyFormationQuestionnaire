"use client";

import { Controller } from "react-hook-form";
import HeroMiami3 from "@/components/HeroMiami3";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

interface Step9Agreement4Props extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step9Agreement4({ form, setStep, onSave, onNext, session, anonymousId }: Step9Agreement4Props) {
  const { register, watch, control, formState: { errors } } = form;
  const isCorp = watch("company.entityType") === "C-Corp" || watch("company.entityType") === "S-Corp";

  // Helper function to check if input should be red
  const isInputInvalid = () => false;

  // Custom validation for majority percentages
  const validateMajorityPercentages = () => true;

  const handleContinue = async () => {
    if (!validateMajorityPercentages()) {
      return;
    }
    await onNext?.();
  };

  return (
    <section className="space-y-6">
      <HeroMiami3 title="Acciones & Sucesión" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Acciones & Sucesión</h2>
        <div className="mt-6 space-y-16 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quiere que los accionistas tengan el derecho de ser los primeros en rechazar una oferta de venta de la compañía?
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los accionistas existentes tengan la primera oportunidad de comprar las acciones de un accionista que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
                {watch("agreement.corp_rofr") === "Yes" && (
                  <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                    <label className="label flex items-center gap-2">Período de oferta del derecho de preferencia (días)
                      <InfoTooltip title="Período ROFR" body="Número de días que tienen los accionistas existentes para ejercer su derecho de primera oferta antes de que las acciones puedan ser vendidas a terceros." />
                    </label>
                    <div className="mt-3 md:mt-0 md:justify-self-end">
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" className="input w-24" defaultValue={180}
                          {...register("agreement.corp_rofrOfferPeriod", { valueAsNumber: true })} />
                        <span className="text-sm text-gray-500">días</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(500px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Podrán los accionistas libremente transferir sus acciones a sus parientes, o deberá ser esta transferencia sujeta a una decisión unánime o mayoría de los accionistas?
                  <InfoTooltip
                    title="Transferencia de Acciones a Parientes"
                    body="Esta cláusula establece si los accionistas pueden transferir sus acciones a familiares sin restricciones, o si requiere aprobación de otros accionistas. Puede ser libre, requerir decisión unánime, o requerir mayoría."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-full">
                  <Controller
                    name="agreement.corp_transferToRelatives"
                    control={control}
                    render={({ field }) => (
                      <select
                        className="input w-full min-w-0 text-sm"
                        style={{ minWidth: '100%' }}
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
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  En el caso de incapacidad o de la muerte de algún accionista, ¿querrá que los herederos estén obligados a vender las acciones a los accionistas compañía?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un accionista fallecido o incapacitado deben vender sus acciones a la corporación, evitando que personas no deseadas se conviertan en accionistas."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Si en el caso de un divorcio donde las partes no puedan ponerse de acuerdo sobre las acciones de la compañía, ¿quisiera que la compañía tuviera el derecho de comprar a la ex pareja todas las acciones que tengan al precio del mercado?
                  <InfoTooltip
                    title="Política de Divorcio"
                    body="Esta cláusula protege a la corporación de disputas matrimoniales al permitir que la empresa compre las acciones de la ex pareja a precio de mercado, evitando que un cónyuge no deseado se convierta en accionista."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Quiere derechos de "tag along" o un "drag along"?
                  <InfoTooltip
                    title="Tag Along / Drag Along"
                    body="Tag Along: Permite que accionistas minoritarios vendan sus acciones cuando un accionista mayoritario vende. Drag Along: Permite que accionistas mayoritarios obliguen a minoritarios a vender cuando ellos venden."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  Derecho de preferencia en venta de participaciones (Right of First Refusal)
                  <InfoTooltip
                    title="Right of First Refusal"
                    body="El derecho de preferencia permite que los socios existentes tengan la primera oportunidad de comprar las participaciones de un socio que desea vender, antes de que se ofrezcan a terceros."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
                {watch("agreement.llc_rofr") === "Yes" && (
                  <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                    <label className="label flex items-center gap-2">Período de oferta del derecho de preferencia (días)
                      <InfoTooltip title="Período ROFR" body="Número de días que tienen los socios existentes para ejercer su derecho de primera oferta antes de que las participaciones puedan ser vendidas a terceros." />
                    </label>
                    <div className="mt-3 md:mt-0 md:justify-self-end">
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" className="input w-24" defaultValue={180}
                          {...register("agreement.llc_rofrOfferPeriod", { valueAsNumber: true })} />
                        <span className="text-sm text-gray-500">días</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  En caso de muerte o incapacidad de un socio: ¿Los herederos estarán obligados a vender su participación a los otros socios de la LLC?
                  <InfoTooltip
                    title="Política de Herederos"
                    body="Esta cláusula determina si los herederos de un socio fallecido o incapacitado deben vender sus participaciones a la LLC, evitando que personas no deseadas se conviertan en socios."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
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
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Podrán los socios libremente transferir sus participaciones a sus parientes, o deberá ser esta transferencia sujeta a una decisión unánime o mayoría de los socios?
                  <InfoTooltip title="Transferencia a Parientes" body="Esta cláusula establece si los socios pueden transferir sus participaciones a familiares sin restricciones, o si requiere aprobación de otros socios. Puede ser libre, requerir decisión unánime, o requerir mayoría." />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-full">
                  <Controller name="agreement.llc_transferToRelatives" control={control}
                    render={({ field }) => (
                      <select className="input w-full min-w-0 text-sm" style={{ minWidth: '100%' }} {...field}>
                        <option value="">Seleccionar opción</option>
                        <option value="Sí, podrán transferir libremente.">Sí, podrán transferir libremente.</option>
                        <option value="Sí, si la decisión de los socios es unánime.">Sí, si la decisión de los socios es unánime.</option>
                        <option value="Sí, si la decisión de la mayoría de los socios.">Sí, si la decisión de la mayoría de los socios.</option>
                      </select>
                    )} />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  La admisión de nuevos socios: ¿Será por decisión unánime o por mayoría?
                  <InfoTooltip
                    title="Admisión de Nuevos Socios"
                    body="Esta cláusula establece el proceso para añadir nuevos socios a la LLC. Puede requerir decisión unánime o mayoría con un porcentaje específico."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
                  <Controller
                    name="agreement.llc_newPartnersAdmission"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Supermayoría", label: "Supermayoría" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC new partners admission"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  La disolución de la LLC: ¿Será por decisión unánime o por mayoría?
                  <InfoTooltip
                    title="Disolución de la LLC"
                    body="Esta cláusula establece el proceso para cerrar la LLC. Puede requerir decisión unánime o mayoría con un porcentaje específico."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
                  <Controller
                    name="agreement.llc_dissolutionDecision"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Decisión Unánime"}
                        onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Supermayoría", label: "Supermayoría" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC dissolution decision"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  En caso de divorcio, ¿la LLC tendrá derecho a comprar las participaciones del ex cónyuge?
                  <InfoTooltip title="Política de Divorcio" body="Protege a la LLC de disputas matrimoniales al permitir que la empresa compre las participaciones a precio de mercado." />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
                  <Controller name="agreement.llc_divorceBuyoutPolicy" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "No"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="LLC divorce buyout" name={field.name} />
                    )} />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 md:grid md:grid-cols-[560px_minmax(360px,auto)] md:gap-10 md:items-start">
                <label className="label inline-flex items-start gap-5 max-w-prose">
                  ¿Incluir derechos de "tag along" / "drag along"?
                  <InfoTooltip title="Tag Along / Drag Along" body="Tag Along permite a socios minoritarios vender cuando un mayoritario vende. Drag Along permite a mayoritarios obligar a minoritarios a vender." />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[500px]">
                  <Controller name="agreement.llc_tagDragRights" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "No"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="LLC tag drag rights" name={field.name} />
                    )} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(7)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-base underline text-blue-600" onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={handleContinue}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


