"use client";

import { Controller } from "react-hook-form";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";

export default function Step7Agreement2({ form, setStep, onSave, onNext }: StepProps) {
  const { register, watch, control, formState: { errors } } = form;
  const isCorp = watch("company.entityType") === "C-Corp";

  return (
    <section className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Capital & Préstamos</h2>
        <div className="mt-6 space-y-10 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start first:mt-0 first:pt-0 first:border-0">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  ¿Cómo se añadirán nuevos accionistas, por decisión unánime?, mayoría?
                  <InfoTooltip
                    title="Admisión de Nuevos Accionistas"
                    body="Esta cláusula establece el proceso para añadir nuevos accionistas a la corporación. Puede requerir decisión unánime (todos los accionistas deben estar de acuerdo) o mayoría (un porcentaje específico de accionistas)."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_newShareholdersAdmission"
                    control={control}
                    render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Decisión Unánime"}
                      onChange={field.onChange}
                      options={[
                        { value: "Decisión Unánime", label: "Unánime" },
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="New shareholders admission"
                      name={field.name}
                    />
                    )}
                  />
                </div>
                {watch("agreement.corp_newShareholdersAdmission") === "Mayoría" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-2">Porcentaje requerido para mayoría
                      <InfoTooltip
                        title="Porcentaje de Mayoría"
                        body="Define el porcentaje mínimo de votos necesario para aprobar una decisión por mayoría. Por ejemplo, 60% o 75%."
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-1/6 min-w-[120px]">
                        <input
                          type="number"
                          min="50.01"
                          max="99.99"
                          step="0.01"
                          className={`input w-full ${errors.agreement?.corp_newShareholdersMajority ? 'border-red-500 focus:ring-red-500' : ''}`}
                          {...register("agreement.corp_newShareholdersMajority", { 
                            valueAsNumber: true,
                            min: {
                              value: 50.01,
                              message: "El valor debe ser mayor o igual a 50.01"
                            },
                            max: {
                              value: 99.99,
                              message: "El valor debe ser menor o igual a 99.99"
                            }
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
                            register("agreement.corp_newShareholdersMajority").onChange(e);
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                    {errors.agreement?.corp_newShareholdersMajority && (
                      <p className="text-red-500 text-sm mt-1">{errors.agreement.corp_newShareholdersMajority.message}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  Si la corporación necesitara más capital, ¿Se haría en el mismo porcentaje a su participación accionaria, Pro-Rata? Ejemplo: Si se necesitara $100 mil más en capital, un dueño con el 50% de acciones necesitaría invertir unos 50 mil más.
                  <InfoTooltip
                    title="Aportaciones de Capital Pro-Rata"
                    body="Pro-Rata significa que cada accionista debe aportar capital adicional en la misma proporción que su participación accionaria. Si no es Pro-Rata, se puede establecer un proceso diferente para decidir las aportaciones."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_moreCapitalProcess"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Sí, Pro-Rata"}
                        onChange={field.onChange}
                        options={[
                          { value: "Sí, Pro-Rata", label: "Sí, Pro-Rata" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="More capital process"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.corp_moreCapitalProcess") === "No" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-2">¿Cómo se decidiría la proporción de las aportaciones?
                      <InfoTooltip
                        title="Decisión sobre Aportaciones"
                        body="Si no es Pro-Rata, especifique si las aportaciones adicionales se deciden por unanimidad o por mayoría y, de ser mayoría, el porcentaje requerido."
                      />
                    </label>
                    <Controller
                      name="agreement.corp_moreCapitalDecision"
                      control={control}
                      render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Decisión Unánime"}
                      onChange={field.onChange}
                      options={[
                        { value: "Decisión Unánime", label: "Unánime" },
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="More capital decision"
                      name={field.name}
                    />
                      )}
                    />
                    {watch("agreement.corp_moreCapitalDecision") === "Mayoría" && (
                      <div className="mt-3">
                        <label className="label flex items-center gap-3">Porcentaje requerido para mayoría
                          <InfoTooltip
                            title="Porcentaje de Mayoría"
                            body="Porcentaje mínimo de aprobación para decisiones tomadas por mayoría (p. ej., 66.67%)."
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="w-1/6 min-w-[120px]">
                            <input
                              type="number"
                              min="50.01"
                              max="99.99"
                              step="0.01"
                              className={`input w-full ${errors.agreement?.corp_moreCapitalMajority ? 'border-red-500 focus:ring-red-500' : ''}`}
                              {...register("agreement.corp_moreCapitalMajority", { 
                                valueAsNumber: true,
                                min: {
                                  value: 50.01,
                                  message: "El valor debe ser mayor o igual a 50.01"
                                },
                                max: {
                                  value: 99.99,
                                  message: "El valor debe ser menor o igual a 99.99"
                                }
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
                                register("agreement.corp_moreCapitalMajority").onChange(e);
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                        <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  ¿Algún accionista podrá prestarle a la compañía? En un futuro podría haber préstamos de accionistas a la compañía
                  <InfoTooltip
                    title="Préstamos de Accionistas"
                    body="Los préstamos de accionistas a la compañía pueden ser una fuente de financiamiento flexible. Esta cláusula establece si los accionistas pueden prestar dinero a la corporación y bajo qué términos."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.corp_shareholderLoans"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "No"}
                        onChange={field.onChange}
                        options={[
                          { value: "Yes", label: "Sí" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Shareholder loans"
                        name={field.name}
                      />
                    )}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  Adición de nuevos miembros a la LLC: ¿Cómo se añadirán?
                  <InfoTooltip
                    title="Admisión de Nuevos Miembros"
                    body="Esta cláusula establece el proceso para añadir nuevos miembros a la LLC. Puede requerir decisión unánime (todos los miembros deben estar de acuerdo) o mayoría (un porcentaje específico de miembros)."
                  />
                </label>
                <div className="flex items-center gap-4 flex-wrap md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_newMembersAdmission"
                    control={control}
                    render={({ field }) => (
                    <SegmentedToggle
                      value={field.value || "Decisión Unánime"}
                      onChange={field.onChange}
                      options={[
                        { value: "Decisión Unánime", label: "Unánime" },
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="New members admission"
                      name={field.name}
                    />
                    )}
                  />
                  {watch("agreement.llc_newMembersAdmission") === "Mayoría" && (
                    <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                      <label className="label flex items-center gap-2">Porcentaje requerido para mayoría
                        <InfoTooltip
                          title="Porcentaje de Mayoría"
                          body="Define el porcentaje mínimo de votos necesario para aprobar una decisión por mayoría. Por ejemplo, 60% o 75%."
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="w-1/6 min-w-[120px]">
                          <input
                            type="number"
                            min="50.01"
                            max="99.99"
                            step="0.01"
                            className={`input w-full ${errors.agreement?.llc_newMembersMajority ? 'border-red-500 focus:ring-red-500' : ''}`}
                            {...register("agreement.llc_newMembersMajority", { 
                              valueAsNumber: true,
                              min: {
                                value: 50.01,
                                message: "El valor debe ser mayor o igual a 50.01"
                              },
                              max: {
                                value: 99.99,
                                message: "El valor debe ser menor o igual a 99.99"
                              }
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
                              register("agreement.llc_newMembersMajority").onChange(e);
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                      <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                      {errors.agreement?.llc_newMembersMajority && (
                        <p className="text-red-500 text-sm mt-1">{errors.agreement.llc_newMembersMajority.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  Aportaciones de capital adicionales: ¿Se haría en el mismo porcentaje a su participación, Pro-Rata? Ejemplo: Si se necesitara $100 mil más en capital, un socio con el 50% de participación necesitaría invertir unos 50 mil más.
                  <InfoTooltip
                    title="Aportaciones de Capital Pro-Rata"
                    body="Pro-Rata significa que cada socio debe aportar capital adicional en la misma proporción que su participación en la LLC. Si no es Pro-Rata, se puede establecer un proceso diferente para decidir las aportaciones."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                  <Controller
                    name="agreement.llc_additionalContributions"
                    control={control}
                    render={({ field }) => (
                      <SegmentedToggle
                        value={field.value || "Sí, Pro-Rata"}
                        onChange={field.onChange}
                        options={[
                          { value: "Sí, Pro-Rata", label: "Sí, Pro-Rata" },
                          { value: "No", label: "No" },
                        ]}
                        ariaLabel="Additional contributions process"
                        name={field.name}
                      />
                    )}
                  />
                </div>
                {watch("agreement.llc_additionalContributions") === "No" && (
                  <div className="mt-3 md:col-start-2 md:justify-self-end md:w-[420px]">
                    <label className="label flex items-center gap-2">¿Cómo se decidiría la proporción de las aportaciones?
                      <InfoTooltip
                        title="Decisión sobre Aportaciones"
                        body="Si no es Pro-Rata, especifique si las aportaciones adicionales se deciden por unanimidad o por mayoría y, de ser mayoría, el porcentaje requerido."
                      />
                    </label>
                    <Controller
                      name="agreement.llc_additionalContributionsDecision"
                      control={control}
                      render={({ field }) => (
                        <SegmentedToggle
                          value={field.value || "Decisión Unánime"}
                          onChange={field.onChange}
                          options={[
                            { value: "Decisión Unánime", label: "Unánime" },
                            { value: "Mayoría", label: "Mayoría" },
                          ]}
                          ariaLabel="Additional contributions decision"
                          name={field.name}
                        />
                      )}
                    />
                    {watch("agreement.llc_additionalContributionsDecision") === "Mayoría" && (
                      <div className="mt-3">
                        <label className="label flex items-center gap-2">Porcentaje requerido para mayoría
                          <InfoTooltip
                            title="Porcentaje de Mayoría"
                            body="Porcentaje mínimo de aprobación para decisiones tomadas por mayoría (p. ej., 66.67%)."
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="w-1/6 min-w-[120px]">
                            <input
                              type="number"
                              min="50.01"
                              max="99.99"
                              step="0.01"
                              className={`input w-full ${errors.agreement?.llc_additionalContributionsMajority ? 'border-red-500 focus:ring-red-500' : ''}`}
                              {...register("agreement.llc_additionalContributionsMajority", { 
                                valueAsNumber: true,
                                min: {
                                  value: 50.01,
                                  message: "El valor debe ser mayor o igual a 50.01"
                                },
                                max: {
                                  value: 99.99,
                                  message: "El valor debe ser menor o igual a 99.99"
                                }
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
                                register("agreement.llc_additionalContributionsMajority").onChange(e);
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                        <p className="help">Ingrese un porcentaje entre 50.01% y 99.99%</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-8 pt-8 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  ¿Habrá préstamos de miembros a la LLC?
                  <InfoTooltip
                    title="Préstamos de Miembros"
                    body="Los préstamos de miembros a la LLC pueden ser una fuente de financiamiento flexible. Esta cláusula establece si los miembros pueden prestar dinero a la LLC y bajo qué términos."
                  />
                </label>
                <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
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
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
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


