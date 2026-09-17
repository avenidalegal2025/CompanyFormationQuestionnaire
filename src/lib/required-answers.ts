// Required answers for the agreement steps.
//
// The agreement questions used to render a pre-selected option
// (`field.value || "Decisión Unánime"`) that was never written to the form, so
// an untouched question saved nothing and the document fell back to a
// different hidden default (usually "Majority"). The questions now start
// empty, and this list is what "Continuar" and checkout require before moving
// on. Keep it in sync with the Controllers in Step6-Step9Agreement*.tsx; a
// question that is only shown conditionally must carry the same condition.

import type { AllSteps } from "./schema";

type Values = AllSteps & Record<string, any>;

export type RequiredAnswer = {
  /** react-hook-form path, e.g. "agreement.llc_majorDecisions" */
  name: string;
  /** Questionnaire step number the question is shown on (see page.tsx). */
  step: number;
  /** Shown only when this returns true. Omit for always-shown questions. */
  when?: (v: Values) => boolean;
};

export const REQUIRED_MESSAGE = "Selecciona una opción";
export const REQUIRED_AMOUNT_MESSAGE = "Ingresa un monto";

export function isCorpEntity(v: Values): boolean {
  const t = v.company?.entityType;
  return t === "C-Corp" || t === "S-Corp";
}

const corp = (v: Values) => isCorpEntity(v);
const llc = (v: Values) => !isCorpEntity(v);
const a = (v: Values) => (v.agreement || {}) as Record<string, any>;

/** Agreement steps: 5 = Dueños & Roles, 6 = Capital, 7 = Gobierno, 8 = Acciones. */
export const AGREEMENT_REQUIRED_ANSWERS: RequiredAnswer[] = [
  // Step 5 — Dueños & Roles
  { name: "agreement.corp_hasSpecificResponsibilities", step: 5, when: corp },
  { name: "agreement.llc_managingMembers", step: 5, when: llc },
  { name: "agreement.llc_hasSpecificRoles", step: 5, when: llc },

  // Step 6 — Capital & Préstamos
  { name: "agreement.corp_newShareholdersAdmission", step: 6, when: corp },
  { name: "agreement.corp_moreCapitalProcess", step: 6, when: corp },
  { name: "agreement.corp_moreCapitalDecision", step: 6, when: corp },
  { name: "agreement.corp_shareholderLoans", step: 6, when: corp },
  { name: "agreement.corp_shareholderLoansVoting", step: 6, when: (v) => corp(v) && a(v).corp_shareholderLoans === "Yes" },
  { name: "agreement.distributionFrequency", step: 6, when: corp },
  { name: "agreement.llc_newMembersAdmission", step: 6, when: llc },
  { name: "agreement.llc_additionalContributions", step: 6, when: llc },
  { name: "agreement.llc_additionalContributionsDecision", step: 6, when: llc },
  { name: "agreement.llc_memberLoans", step: 6, when: llc },
  { name: "agreement.llc_memberLoansVoting", step: 6, when: (v) => llc(v) && a(v).llc_memberLoans === "Yes" },

  // Step 7 — Gobierno & Decisiones
  { name: "agreement.corp_saleDecisionThreshold", step: 7, when: corp },
  { name: "agreement.corp_bankSigners", step: 7, when: corp },
  { name: "agreement.corp_majorDecisionThreshold", step: 7, when: corp },
  { name: "agreement.corp_nonCompete", step: 7, when: corp },
  { name: "agreement.corp_majorSpendingThreshold", step: 7, when: corp },
  { name: "agreement.corp_officerRemovalVoting", step: 7, when: corp },
  { name: "agreement.corp_nonSolicitation", step: 7, when: (v) => corp(v) && a(v).corp_nonCompete !== "Yes" },
  { name: "agreement.llc_companySaleDecision", step: 7, when: llc },
  { name: "agreement.llc_taxPartner", step: 7, when: llc },
  { name: "agreement.llc_nonCompete", step: 7, when: llc },
  { name: "agreement.llc_bankSigners", step: 7, when: llc },
  { name: "agreement.llc_majorSpendingThreshold", step: 7, when: llc },
  { name: "agreement.llc_majorDecisions", step: 7, when: llc },
  { name: "agreement.llc_minorDecisions", step: 7, when: llc },
  { name: "agreement.llc_officerRemovalVoting", step: 7, when: llc },
  { name: "agreement.llc_nonSolicitation", step: 7, when: (v) => llc(v) && a(v).llc_nonCompete !== "Yes" },

  // Step 8 — Acciones & Sucesión
  { name: "agreement.corp_rofr", step: 8, when: corp },
  { name: "agreement.corp_transferToRelatives", step: 8, when: corp },
  { name: "agreement.corp_heirsForcedToSell", step: 8, when: corp },
  { name: "agreement.corp_divorceBuyoutPolicy", step: 8, when: corp },
  { name: "agreement.corp_tagDragRights", step: 8, when: corp },
  { name: "agreement.llc_rofr", step: 8, when: llc },
  { name: "agreement.llc_heirsForcedToSell", step: 8, when: llc },
  { name: "agreement.llc_transferToRelatives", step: 8, when: llc },
  { name: "agreement.llc_dissolutionDecision", step: 8, when: llc },
  { name: "agreement.llc_divorceBuyoutPolicy", step: 8, when: llc },
  { name: "agreement.llc_tagDragRights", step: 8, when: llc },
];

const AMOUNT_FIELDS = new Set([
  "agreement.corp_majorSpendingThreshold",
  "agreement.llc_majorSpendingThreshold",
]);

export function requiredMessageFor(name: string): string {
  return AMOUNT_FIELDS.has(name) ? REQUIRED_AMOUNT_MESSAGE : REQUIRED_MESSAGE;
}

function getPath(obj: any, path: string): unknown {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "number") return Number.isNaN(value);
  return String(value).trim() === "";
}

/** Required agreement answers that are still empty, optionally for one step only. */
export function missingAgreementAnswers(values: Values, step?: number): RequiredAnswer[] {
  return AGREEMENT_REQUIRED_ANSWERS.filter(
    (q) =>
      (step === undefined || q.step === step) &&
      (!q.when || q.when(values)) &&
      isBlank(getPath(values, q.name))
  );
}

/** Company step: a corporation must state its number of shares (no hidden 1,000). */
export function missingCompanyAnswers(values: Values): RequiredAnswer[] {
  if (!isCorpEntity(values)) return [];
  return isBlank(values.company?.numberOfShares)
    ? [{ name: "company.numberOfShares", step: 1 }]
    : [];
}
