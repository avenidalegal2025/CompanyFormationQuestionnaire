"use client";

import { useEffect } from "react";
import { Controller } from "react-hook-form";
import HeroMiami3 from "@/components/HeroMiami3";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

interface Step8Agreement3Props extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step8Agreement3({ form, setStep, onSave, onNext, session, anonymousId }: Step8Agreement3Props) {
  const { register, watch, control, setValue } = form;
  const isCorp = watch("company.entityType") === "C-Corp" || watch("company.entityType") === "S-Corp";

  // TODO #1 + #2 (client video review): when the user enables non-compete,
  // auto-fill duration (2 years) and geographic scope ("Estado de <formation state>")
  // if they haven't typed anything. The fields stay editable — we just remove
  // the burden of typing a sensible default the lawyer expects.
  const corpNC = watch("agreement.corp_nonCompete");
  const llcNC = watch("agreement.llc_nonCompete");
  const formationState = watch("company.formationState") || "Florida";
  const corpNCDuration = watch("agreement.corp_nonCompeteDuration");
  const corpNCScope = watch("agreement.corp_nonCompeteScope");
  const llcNCDuration = watch("agreement.llc_nonCompeteDuration");
  const llcNCScope = watch("agreement.llc_nonCompeteScope");

  useEffect(() => {
    if (corpNC === "Yes") {
      if (corpNCDuration === undefined || corpNCDuration === null) {
        setValue("agreement.corp_nonCompeteDuration", 2, { shouldDirty: false });
      }
      if (!corpNCScope) {
        setValue("agreement.corp_nonCompeteScope", `Estado de ${formationState}`, { shouldDirty: false });
      }
    }
  }, [corpNC, formationState, corpNCDuration, corpNCScope, setValue]);

  useEffect(() => {
    if (llcNC === "Yes") {
      if (llcNCDuration === undefined || llcNCDuration === null) {
        setValue("agreement.llc_nonCompeteDuration", 2, { shouldDirty: false });
      }
      if (!llcNCScope) {
        setValue("agreement.llc_nonCompeteScope", `Estado de ${formationState}`, { shouldDirty: false });
      }
    }
  }, [llcNC, formationState, llcNCDuration, llcNCScope, setValue]);

  const handleContinue = async () => {
    await onNext?.();
  };

  return (
    <section className="space-y-6">
      <HeroMiami3 title="Gobierno & Decisiones" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Gobierno & Decisiones</h2>
        <div className="mt-6 space-y-16 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
              <div>
                  <label className="label flex items-center gap-2">Si hubiese una oferta de compra o si usted quisiese vender la compañía, ¿quisiera que esta decisión se tome unánimemente o por mayoría?
                  <InfoTooltip
                    title="Decisión de Venta de la Compañía"
                    body="Esta cláusula establece el proceso para decidir si vender la compañía. Puede requerir decisión unánime (todos los accionistas deben estar de acuerdo) o mayoría (un porcentaje específico de accionistas)."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.corp_saleDecisionThreshold"
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
                      ariaLabel="Sale decision threshold"
                      name={field.name}
                    />
                  )}
                />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Para la cuenta de banco de la compañía, ¿quiere que haya un o dos firmantes?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
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
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Si hubiese que hacer una decisión importante (como decisiones que cuesten un monto importante de dinero, despedir un empleado, pedir un préstamo, etc.) ¿quisiera que esta decisión se tome unánimemente o por mayoría?
                  <InfoTooltip
                    title="Decisiones Importantes"
                    body="Esta cláusula establece el proceso para tomar decisiones importantes de la corporación. Puede requerir decisión unánime (todos los accionistas deben estar de acuerdo) o mayoría (un porcentaje específico de accionistas)."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.corp_majorDecisionThreshold"
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
                      ariaLabel="Major decision threshold"
                      name={field.name}
                    />
                  )}
                />
                </div>
              </div>
              {/* Tax Owner removed for C-Corp per attorney review — only applies to LLC */}
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">¿Quieren una cláusula de no competencia? Para impedir competencia por alguien involucrado en la compañía.
                  <InfoTooltip
                    title="Cláusula de No Competencia"
                    body="Un covenant de no competencia impide que los accionistas, ejecutivos o directores compitan con la corporación durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
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
                {watch("agreement.corp_nonCompete") === "Yes" && (
                  <>
                    <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                      <label className="label flex items-center gap-2">
                        Duración de no competencia (años después de salir)
                        <InfoTooltip title="Duración" body="Período de tiempo tras dejar la compañía durante el cual el accionista no podrá competir directamente. Los tribunales de Florida suelen considerar razonables plazos de 2 años; plazos más largos pueden ser difíciles de hacer cumplir." />
                      </label>
                      <div className="md:col-start-2 md:justify-self-end">
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max="5" className="input w-24"
                            {...register("agreement.corp_nonCompeteDuration", { valueAsNumber: true })} />
                          <span className="text-sm text-gray-500">años</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                      <label className="label flex items-center gap-2">
                        Alcance geográfico de la no competencia
                        <InfoTooltip title="Alcance geográfico" body="Territorio donde se aplicará la restricción. Por defecto usamos el estado de formación. Un alcance más amplio (e.g., EE.UU. completo) es más difícil de defender ante un tribunal." />
                      </label>
                      <div className="md:col-start-2 md:justify-self-end">
                        <input type="text" className="input w-full" placeholder="ej. Estado de Florida"
                          {...register("agreement.corp_nonCompeteScope")} />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">Monto umbral para gastos importantes ($)
                    <InfoTooltip title="Umbral de Gastos" body="Decisiones que involucren montos iguales o superiores a esta cantidad requieren aprobación de la Junta. Por debajo, los oficiales pueden decidir independientemente." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
                    <Controller name="agreement.corp_majorSpendingThreshold" control={control}
                      render={({ field }) => (
                        <input type="text" className="input w-40" placeholder="5,000"
                          value={field.value ? Number(String(field.value).replace(/,/g, '')).toLocaleString('en-US') : ''}
                          onChange={(e) => { const raw = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(raw)) field.onChange(raw); }} />
                      )} />
                  </div>
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">Remoción de oficiales/directores requiere:
                    <InfoTooltip title="Remoción de Oficiales" body="Establece qué tipo de aprobación se requiere para remover a un oficial o director de la corporación." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.corp_officerRemovalVoting" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Mayoría"} onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Supermayoría", label: "Supermayoría" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="Officer removal voting" name={field.name} />
                    )} />
                </div>
              </div>
              {watch("agreement.corp_nonCompete") !== "Yes" && (
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">¿Incluir cláusula de no solicitud?
                    <InfoTooltip title="No Solicitud" body="Impide que las partes recluten empleados o clientes de la compañía después de su salida. Se oculta cuando ya se incluye cláusula de no competencia (que es más amplia)." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.corp_nonSolicitation" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Yes"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="Non solicitation" name={field.name} />
                    )} />
                </div>
              </div>
              )}
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">¿Incluir cláusula de confidencialidad / NDA?
                    <InfoTooltip title="Confidencialidad" body="Protege la información confidencial de la compañía durante y después de la participación de los socios." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.corp_confidentiality" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Yes"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="Confidentiality NDA" name={field.name} />
                    )} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
              <div>
                  <label className="label flex items-center gap-2">Si hubiese una oferta de compra o si usted quisiese vender la compañía, ¿quisiera que esta decisión se tome unánimemente o por mayoría?
                  <InfoTooltip
                    title="Decisión de Venta de la Compañía (LLC)"
                    body="Esta cláusula establece el proceso para decidir si vender la compañía. Puede requerir decisión unánime (todos los miembros deben estar de acuerdo) o mayoría (un porcentaje específico de miembros)."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.llc_companySaleDecision"
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
                      ariaLabel="LLC sale decision"
                      name={field.name}
                    />
                  )}
                />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">¿Quién será el socio responsable de impuestos (Tax Partner)?
                  <InfoTooltip
                    title="Tax Partner"
                    body="El socio responsable de impuestos es quien se encarga de presentar las declaraciones de impuestos de la LLC y mantener los registros fiscales. Debe ser un miembro de la LLC."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.llc_taxPartner"
                  control={control}
                  render={({ field }) => {
                    const ownersData = watch("owners") || {};
                    const ownersCount = watch("ownersCount") || 1;
                    const people = Array.from({ length: ownersCount }).map((_, idx) => {
                      const owner = (ownersData as Record<string, Record<string, string>>)?.[String(idx)] || {};
                      return owner.fullName || [owner.firstName, owner.lastName].filter(Boolean).join(' ') || `Socio ${idx + 1}`;
                    });
                    // Auto-select if only 1 person
                    if (people.length === 1 && !field.value) field.onChange(people[0]);
                    return (
                      <select className="input mt-1" {...field}>
                        <option value="">Seleccionar socio</option>
                        {people.map((name, idx) => (
                          <option key={idx} value={name}>{name}</option>
                        ))}
                      </select>
                    );
                  }}
                />
              </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">¿Quieren una cláusula de no competencia? Para impedir competencia por alguien involucrado en la compañía.
                  <InfoTooltip
                    title="Covenant de No Competencia"
                    body="Un covenant de no competencia impide que los socios compitan con la LLC durante y después de su participación. Esto puede incluir restricciones geográficas, temporales y de industria."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
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
                {watch("agreement.llc_nonCompete") === "Yes" && (
                  <>
                    <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                      <label className="label flex items-center gap-2">
                        Duración de no competencia (años después de salir)
                        <InfoTooltip title="Duración" body="Período de tiempo tras dejar la compañía durante el cual el miembro no podrá competir directamente. Los tribunales de Florida suelen considerar razonables plazos de 2 años; plazos más largos pueden ser difíciles de hacer cumplir." />
                      </label>
                      <div className="md:col-start-2 md:justify-self-end">
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max="5" className="input w-24"
                            {...register("agreement.llc_nonCompeteDuration", { valueAsNumber: true })} />
                          <span className="text-sm text-gray-500">años</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                      <label className="label flex items-center gap-2">
                        Alcance geográfico de la no competencia
                        <InfoTooltip title="Alcance geográfico" body="Territorio donde se aplicará la restricción. Por defecto usamos el estado de formación. Un alcance más amplio (e.g., EE.UU. completo) es más difícil de defender ante un tribunal." />
                      </label>
                      <div className="md:col-start-2 md:justify-self-end">
                        <input type="text" className="input w-full" placeholder="ej. Estado de Florida"
                          {...register("agreement.llc_nonCompeteScope")} />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Cuenta bancaria: ¿Uno o dos firmantes para retirar dinero?
                  <InfoTooltip
                    title="Firmantes Bancarios"
                    body="Determina cuántas firmas se requieren para realizar transacciones bancarias. Un firmante permite mayor agilidad, dos firmantes proporciona mayor control y seguridad."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
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
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Decisiones mayores (ej. &gt; $10,000):
                    <InfoTooltip
                      title="Decisiones Mayores"
                      body="Decisiones de alto impacto financiero u operativo (por ejemplo, gastos superiores a un umbral, contratación/despido clave, endeudamiento). Especifique si requieren unanimidad o mayoría y, de ser mayoría, el porcentaje requerido."
                    />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.llc_majorDecisions"
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
                        ariaLabel="LLC major decisions"
                        name={field.name}
                      />
                  )}
                />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Decisiones menores (&lt; $10,000):
                    <InfoTooltip
                      title="Decisiones Menores"
                      body="Asuntos operativos cotidianos con menor impacto económico. Especifique si requieren unanimidad o mayoría y, de ser mayoría, el porcentaje requerido."
                    />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.llc_minorDecisions"
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
                        ariaLabel="LLC minor decisions"
                        name={field.name}
                      />
                  )}
                />
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">Monto umbral para gastos importantes ($)
                    <InfoTooltip title="Umbral de Gastos" body="Decisiones que involucren montos iguales o superiores a esta cantidad requieren aprobación de los miembros. Por debajo, el gerente puede decidir independientemente." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
                    <Controller name="agreement.llc_majorSpendingThreshold" control={control}
                      render={({ field }) => (
                        <input type="text" className="input w-40" placeholder="15,000"
                          value={field.value ? Number(String(field.value).replace(/,/g, '')).toLocaleString('en-US') : ''}
                          onChange={(e) => { const raw = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(raw)) field.onChange(raw); }} />
                      )} />
                  </div>
                </div>
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">Remoción de oficiales/gerentes requiere:
                    <InfoTooltip title="Remoción de Oficiales" body="Establece qué tipo de aprobación se requiere para remover a un oficial o gerente de la LLC." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.llc_officerRemovalVoting" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Mayoría"} onChange={field.onChange}
                        options={[
                          { value: "Decisión Unánime", label: "Unánime" },
                          { value: "Supermayoría", label: "Supermayoría" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC officer removal voting" name={field.name} />
                    )} />
                </div>
              </div>
              {watch("agreement.llc_nonCompete") !== "Yes" && (
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">¿Incluir cláusula de no solicitud?
                    <InfoTooltip title="No Solicitud" body="Impide que las partes recluten empleados o clientes de la compañía después de su salida. Se oculta cuando ya se incluye cláusula de no competencia (que es más amplia)." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.llc_nonSolicitation" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Yes"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="LLC non solicitation" name={field.name} />
                    )} />
                </div>
              </div>
              )}
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
                <div>
                  <label className="label flex items-center gap-2">¿Incluir cláusula de confidencialidad / NDA?
                    <InfoTooltip title="Confidencialidad" body="Protege la información confidencial de la compañía durante y después de la participación de los socios." />
                  </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                  <Controller name="agreement.llc_confidentiality" control={control}
                    render={({ field }) => (
                      <SegmentedToggle value={field.value || "Yes"} onChange={field.onChange}
                        options={[{ value: "Yes", label: "Sí" }, { value: "No", label: "No" }]}
                        ariaLabel="LLC confidentiality NDA" name={field.name} />
                    )} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(6)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-base underline text-blue-600" onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={handleContinue}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


