"use client";

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
  const { register, watch, control, formState: { errors } } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  // Helper function to check if input should be red
  const isInputInvalid = (decisionValue: string, majorityValue: number | undefined) => {
    if (decisionValue === "Mayoría") {
      return !majorityValue || majorityValue < 50.01 || majorityValue > 99.99;
    }
    return false;
  };

  // Custom validation for majority percentages
  const validateMajorityPercentages = () => {
    if (isCorp) {
      // Check corp_saleDecisionThreshold
      if (watch("agreement.corp_saleDecisionThreshold") === "Mayoría") {
        const majority = watch("agreement.corp_saleDecisionMajority");
        if (!majority || majority < 50.01 || majority > 99.99) {
          alert("Por favor ingrese un porcentaje válido para la mayoría de decisión de venta (entre 50.01% y 99.99%)");
          return false;
        }
      }

      // Check corp_majorDecisionThreshold
      if (watch("agreement.corp_majorDecisionThreshold") === "Mayoría") {
        const majority = watch("agreement.corp_majorDecisionMajority");
        if (!majority || majority < 50.01 || majority > 99.99) {
          alert("Por favor ingrese un porcentaje válido para la mayoría de decisiones importantes (entre 50.01% y 99.99%)");
          return false;
        }
      }
    } else {
      // Check LLC majority percentages
      if (watch("agreement.llc_companySaleDecision") === "Mayoría") {
        const majority = watch("agreement.llc_companySaleDecisionMajority");
        if (!majority || majority < 50.01 || majority > 99.99) {
          alert("Por favor ingrese un porcentaje válido para la mayoría de decisión de venta de la LLC (entre 50.01% y 99.99%)");
          return false;
        }
      }

      // Check llc_majorDecisions
      if (watch("agreement.llc_majorDecisions") === "Mayoría") {
        const majority = watch("agreement.llc_majorDecisionsMajority");
        if (!majority || majority < 50.01 || majority > 99.99) {
          alert("Por favor ingrese un porcentaje válido para la mayoría de decisiones mayores (entre 50.01% y 99.99%)");
          return false;
        }
      }

      // Check llc_minorDecisions
      if (watch("agreement.llc_minorDecisions") === "Mayoría") {
        const majority = watch("agreement.llc_minorDecisionsMajority");
        if (!majority || majority < 50.01 || majority > 99.99) {
          alert("Por favor ingrese un porcentaje válido para la mayoría de decisiones menores (entre 50.01% y 99.99%)");
          return false;
        }
      }
    }
    return true;
  };

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
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="Sale decision threshold"
                      name={field.name}
                    />
                  )}
                />
                </div>
                {watch("agreement.corp_saleDecisionThreshold") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end">
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
                          className={`input w-full ${
                            isInputInvalid(
                              watch("agreement.corp_saleDecisionThreshold") || "", 
                              watch("agreement.corp_saleDecisionMajority")
                            ) ? 'border-red-500 bg-red-50 focus:ring-red-500' : ''
                          }`}
                          {...register("agreement.corp_saleDecisionMajority", { 
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99
                          })}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                  </div>
                )}
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
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="Major decision threshold"
                      name={field.name}
                    />
                  )}
                />
                </div>
                {watch("agreement.corp_majorDecisionThreshold") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end">
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
                          className={`input w-full ${
                            isInputInvalid(
                              watch("agreement.corp_majorDecisionThreshold") || "", 
                              watch("agreement.corp_majorDecisionMajority")
                            ) ? 'border-red-500 bg-red-50 focus:ring-red-500' : ''
                          }`}
                          {...register("agreement.corp_majorDecisionMajority", { 
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99
                          })}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
              </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
              </div>
                )}
              </div>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">¿Quién será el accionista responsable de impuestos (Tax Owner)?
                  <InfoTooltip
                    title="Tax Owner"
                    body="El accionista responsable de impuestos es quien se encarga de presentar las declaraciones de impuestos de la corporación y mantener los registros fiscales. Debe ser un accionista de la corporación."
                  />
                </label>
                </div>
                <div className="md:col-start-2 md:justify-self-end">
                <Controller
                  name="agreement.corp_taxOwner"
                  control={control}
                  render={({ field }) => (
                    <select className="input mt-1" {...field}>
                      <option value="">Seleccionar accionista</option>
                      {Array.from({ length: watch("ownersCount") || 1 }).map((_, idx) => {
                        const ownerName = watch(`owners.${idx}.fullName`) || `Accionista ${idx + 1}`;
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
              </div>
            </>
          ) : (
            <>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
              <div>
                  <label className="label flex items-center gap-2">Venta de la compañía: ¿Decisión unánime o por mayoría?
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
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="LLC sale decision"
                      name={field.name}
                    />
                  )}
                />
                </div>
                {watch("agreement.llc_companySaleDecision") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end">
                    <label className="label">Porcentaje requerido para mayoría</label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <input
                          type="number"
                          min="50.01"
                          max="99.99"
                          step="0.01"
                          className={`input w-full ${
                            isInputInvalid(
                              watch("agreement.llc_companySaleDecision") || "", 
                              watch("agreement.llc_companySaleDecisionMajority")
                            ) ? 'border-red-500 bg-red-50 focus:ring-red-500' : ''
                          }`}
                          {...register("agreement.llc_companySaleDecisionMajority", {
                            valueAsNumber: true,
                            min: 50.01,
                            max: 99.99,
                          })}
                        />
              </div>
                      <span className="text-sm text-gray-500">%</span>
              </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
              </div>
                )}
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
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(420px,auto)] md:gap-8 md:items-start">
              <div>
                  <label className="label flex items-center gap-2">Non Compete: ¿Covenant de no competencia entre los dueños?
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
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC major decisions"
                        name={field.name}
                      />
                  )}
                />
                </div>
                {watch("agreement.llc_majorDecisions") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end">
                    <label className="label flex items-center gap-5">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Porcentaje mínimo necesario para aprobar decisiones mayores por mayoría (por ejemplo, 60% o 75%)."
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <Controller
                          name="agreement.llc_majorDecisionsMajority"
                          control={control}
                          render={({ field }) => {
                            const currentValue = field.value;
                            const displayValue = currentValue !== undefined && currentValue !== null 
                              ? String(currentValue) 
                              : '';
                            
                            return (
                              <input
                                type="number"
                                min="50.01"
                                max="99.99"
                                step="0.01"
                                className={`input w-full ${
                                  isInputInvalid(
                                    watch("agreement.llc_majorDecisions") || "", 
                                    currentValue
                                  ) ? 'border-red-500 bg-red-50 focus:ring-red-500' : ''
                                }`}
                                value={displayValue}
                                onChange={(e) => {
                                  const inputValue = e.target.value;
                                  // Allow empty input
                                  if (inputValue === '') {
                                    field.onChange(undefined);
                                    return;
                                  }
                                  // Parse as number but preserve precision
                                  const numValue = parseFloat(inputValue);
                                  if (!isNaN(numValue)) {
                                    // Round to 2 decimal places to prevent precision issues
                                    const rounded = Math.round(numValue * 100) / 100;
                                    field.onChange(rounded);
                                  }
                                }}
                                onBlur={(e) => {
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    field.onChange(undefined);
                                    return;
                                  }
                                  const numValue = parseFloat(inputValue);
                                  if (!isNaN(numValue)) {
                                    const rounded = Math.round(numValue * 100) / 100;
                                    field.onChange(rounded);
                                  }
                                }}
                              />
                            );
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                  </div>
                )}
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
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="LLC minor decisions"
                        name={field.name}
                      />
                  )}
                />
                </div>
                {watch("agreement.llc_minorDecisions") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end">
                    <label className="label flex items-center gap-5">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Porcentaje mínimo necesario para aprobar decisiones menores por mayoría (por ejemplo, 60% o 75%)."
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <Controller
                          name="agreement.llc_minorDecisionsMajority"
                          control={control}
                          render={({ field }) => {
                            const currentValue = field.value;
                            const displayValue = currentValue !== undefined && currentValue !== null 
                              ? String(currentValue) 
                              : '';
                            
                            return (
                              <input
                                type="number"
                                min="50.01"
                                max="99.99"
                                step="0.01"
                                className={`input w-full ${
                                  isInputInvalid(
                                    watch("agreement.llc_minorDecisions") || "", 
                                    currentValue
                                  ) ? 'border-red-500 bg-red-50 focus:ring-red-500' : ''
                                }`}
                                value={displayValue}
                                onChange={(e) => {
                                  const inputValue = e.target.value;
                                  // Allow empty input
                                  if (inputValue === '') {
                                    field.onChange(undefined);
                                    return;
                                  }
                                  // Parse as number but preserve precision
                                  const numValue = parseFloat(inputValue);
                                  if (!isNaN(numValue)) {
                                    // Round to 2 decimal places to prevent precision issues
                                    const rounded = Math.round(numValue * 100) / 100;
                                    field.onChange(rounded);
                                  }
                                }}
                                onBlur={(e) => {
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    field.onChange(undefined);
                                    return;
                                  }
                                  const numValue = parseFloat(inputValue);
                                  if (!isNaN(numValue)) {
                                    const rounded = Math.round(numValue * 100) / 100;
                                    field.onChange(rounded);
                                  }
                                }}
                              />
                            );
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


