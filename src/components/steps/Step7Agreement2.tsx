"use client";

import { Controller } from "react-hook-form";
import HeroVideo from "@/components/HeroVideo";
import SegmentedToggle from "@/components/SegmentedToggle";
import InfoTooltip from "@/components/InfoTooltip";
import type { StepProps } from "./types";
import { Session } from "next-auth";
import { handleSaveWithAuth } from "@/lib/auth-helpers";

interface Step7Agreement2Props extends StepProps {
  session: Session | null;
  anonymousId: string;
}

export default function Step7Agreement2({ form, setStep, onSave, onNext, session, anonymousId }: Step7Agreement2Props) {
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
      <HeroVideo title="Capital & Préstamos" />
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900">Capital & Préstamos</h2>
        <div className="mt-6 space-y-16 md:pl-12">
          {isCorp ? (
            <>
              <div className="mt-16 pt-12 border-t border-gray-200 bg-gray-50/40 rounded-xl p-8 shadow-sm md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start first:mt-0 first:pt-0 first:border-0 first:bg-transparent first:p-0 first:rounded-none first:shadow-none">
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
                        { value: "Supermayoría", label: "Supermayoría" },
                        { value: "Mayoría", label: "Mayoría" },
                      ]}
                      ariaLabel="New shareholders admission"
                      name={field.name}
                    />
                  )}
                />
                </div>
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
                            { value: "Supermayoría", label: "Supermayoría" },
                            { value: "Mayoría", label: "Mayoría" },
                          ]}
                          ariaLabel="More capital decision"
                          name={field.name}
                        />
                      )}
                    />
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
                {watch("agreement.corp_shareholderLoans") === "Yes" && (
                  <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                    <label className="label inline-flex items-start gap-3 max-w-prose">
                      Los préstamos de accionistas requieren aprobación por:
                      <InfoTooltip
                        title="Votación para Préstamos"
                        body="Establece qué tipo de aprobación se requiere para que un accionista pueda prestar dinero a la compañía."
                      />
                    </label>
                    <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                      <Controller
                        name="agreement.corp_shareholderLoansVoting"
                        control={control}
                        render={({ field }) => (
                          <SegmentedToggle
                            value={field.value || "Mayoría"}
                            onChange={field.onChange}
                            options={[
                              { value: "Decisión Unánime", label: "Unánime" },
                              { value: "Supermayoría", label: "Supermayoría" },
                              { value: "Mayoría", label: "Mayoría" },
                            ]}
                            ariaLabel="Shareholder loans voting"
                            name={field.name}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-12 pt-10 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  Adición de nuevos socios a la LLC: ¿Cómo se añadirán?
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
                          { value: "Supermayoría", label: "Supermayoría" },
                          { value: "Mayoría", label: "Mayoría" },
                        ]}
                        ariaLabel="New members admission"
                        name={field.name}
                      />
                    )}
                  />
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
                              { value: "Supermayoría", label: "Supermayoría" },
                              { value: "Mayoría", label: "Mayoría" },
                            ]}
                            ariaLabel="Additional contributions decision"
                            name={field.name}
                          />
                        )}
                      />
              </div>
                )}
              </div>
              <div className="mt-8 pt-8 border-t border-gray-100 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                <label className="label inline-flex items-start gap-3 max-w-prose">
                  ¿Habrá préstamos de socios a la LLC?
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
                {watch("agreement.llc_memberLoans") === "Yes" && (
                  <div className="mt-3 md:col-span-2 md:grid md:grid-cols-[minmax(420px,1fr)_minmax(320px,auto)] md:gap-8 md:items-start">
                    <label className="label inline-flex items-start gap-3 max-w-prose">
                      Los préstamos de socios requieren aprobación por:
                      <InfoTooltip
                        title="Votación para Préstamos"
                        body="Establece qué tipo de aprobación se requiere para que un socio pueda prestar dinero a la LLC."
                      />
                    </label>
                    <div className="mt-3 md:mt-0 md:justify-self-end md:w-[420px]">
                      <Controller
                        name="agreement.llc_memberLoansVoting"
                        control={control}
                        render={({ field }) => (
                          <SegmentedToggle
                            value={field.value || "Mayoría"}
                            onChange={field.onChange}
                            options={[
                              { value: "Decisión Unánime", label: "Unánime" },
                              { value: "Supermayoría", label: "Supermayoría" },
                              { value: "Mayoría", label: "Mayoría" },
                            ]}
                            ariaLabel="Member loans voting"
                            name={field.name}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t flex items-center justify-between">
          <button type="button" className="btn" onClick={() => setStep(5)}>Atrás</button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-base underline text-blue-600" onClick={() => handleSaveWithAuth(session, anonymousId, form, onSave)}>Guardar y continuar más tarde</button>
            <button type="button" className="btn btn-primary" onClick={handleContinue}>Continuar</button>
          </div>
        </div>
      </div>
    </section>
  );
}


