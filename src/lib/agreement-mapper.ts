/**
 * Maps the existing formation questionnaire form data (React Hook Form)
 * to the QuestionnaireAnswers interface expected by agreement-docgen.ts.
 */

import type { QuestionnaireAnswers } from "./agreement-docgen";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = Record<string, any>;

/** Convert Spanish voting label to docgen code */
function votingCode(label: string | undefined): string {
  if (!label) return "majority";
  if (label === "Decisión Unánime") return "unanimous";
  if (label === "Supermayoría") return "supermajority";
  return "majority";
}

/** Parse a currency string like "5,000" or "10000" to a number */
function parseCurrency(val: string | number | undefined): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  return parseFloat(String(val).replace(/[,$]/g, "")) || 0;
}

/** Build owners list from the indexed owners fields */
function buildOwnersList(
  data: FormData,
  ownerCount: number,
  isCorp: boolean
): QuestionnaireAnswers["owners_list"] {
  const owners: QuestionnaireAnswers["owners_list"] = [];
  for (let i = 0; i < ownerCount; i++) {
    const owner = data.owners?.[i] || {};
    const fullName =
      owner.fullName ||
      [owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
      `Owner ${i + 1}`;

    // Capital contribution from agreement step (indexed field)
    const capitalKey = isCorp
      ? `corp_capitalPerOwner_${i}`
      : `llc_capitalContributions_${i}`;
    const capital = parseCurrency(data.agreement?.[capitalKey]);

    owners.push({
      full_name: fullName,
      shares_or_percentage: Number(owner.ownership || 0),
      capital_contribution: capital,
    });
  }
  return owners;
}

/** Build directors/managers list */
function buildDirectorsManagers(
  data: FormData,
  isCorp: boolean
): QuestionnaireAnswers["directors_managers"] {
  const list: { name: string }[] = [];

  if (isCorp) {
    const count = data.admin?.directorsCount || 0;
    const allOwners = data.admin?.directorsAllOwners === "Yes";
    if (allOwners) {
      const ownerCount = data.ownersCount || 1;
      for (let i = 0; i < ownerCount; i++) {
        const o = data.owners?.[i];
        const name =
          o?.fullName ||
          [o?.firstName, o?.lastName].filter(Boolean).join(" ") ||
          "";
        if (name) list.push({ name });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        const name = data.admin?.[`director${i}Name`] || "";
        if (name) list.push({ name });
      }
    }
  } else {
    // LLC managers
    const count = data.admin?.managersCount || 0;
    const allOwners = data.admin?.managersAllOwners === "Yes";
    if (allOwners) {
      const ownerCount = data.ownersCount || 1;
      for (let i = 0; i < ownerCount; i++) {
        const o = data.owners?.[i];
        const name =
          o?.fullName ||
          [o?.firstName, o?.lastName].filter(Boolean).join(" ") ||
          "";
        if (name) list.push({ name });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        const first = data.admin?.[`manager${i}FirstName`] || "";
        const last = data.admin?.[`manager${i}LastName`] || "";
        const name = [first, last].filter(Boolean).join(" ");
        if (name) list.push({ name });
      }
    }
  }
  return list;
}

/** Build officers list (Corp only) */
function buildOfficers(data: FormData): QuestionnaireAnswers["officers"] {
  const list: { name: string; title: string }[] = [];
  const count = data.admin?.officersCount || 0;
  const allOwners = data.admin?.officersAllOwners === "Yes";

  if (allOwners) {
    const ownerCount = data.ownersCount || 1;
    for (let i = 0; i < ownerCount; i++) {
      const o = data.owners?.[i];
      const name =
        o?.fullName ||
        [o?.firstName, o?.lastName].filter(Boolean).join(" ") ||
        "";
      if (name) list.push({ name, title: "" });
    }
  } else {
    for (let i = 1; i <= count; i++) {
      const name = data.admin?.[`officer${i}Name`] || "";
      const role = data.admin?.[`officer${i}Role`] || "";
      if (name) list.push({ name, title: role });
    }
  }
  return list;
}

/** Map family transfer from Spanish dropdown to docgen code */
function mapFamilyTransfer(val: string | undefined): string {
  if (!val) return "free";
  if (val.includes("libremente")) return "free";
  if (val.includes("unánime")) return "unanimous";
  if (val.includes("mayoría") || val.includes("Mayoría")) return "majority";
  return "free";
}

/**
 * Main mapping function: converts the full form data object
 * (as stored by React Hook Form / AllStepsSchema)
 * to the QuestionnaireAnswers interface for document generation.
 */
export function mapFormToDocgenAnswers(data: FormData): QuestionnaireAnswers {
  const entityType = data.company?.entityType;
  const isCorp = entityType === "C-Corp" || entityType === "S-Corp";
  const agreement = data.agreement || {};
  const ownerCount = data.ownersCount || 1;

  // Build company name — avoid double suffix (e.g., "ACME LLC LLC")
  const companyNameBase = (data.company?.companyNameBase || "").trim();
  const suffix = (data.company?.entitySuffix || "").trim();
  // If the base name already ends with the suffix, don't append it again
  const baseEndsWithSuffix = suffix && companyNameBase.toUpperCase().endsWith(suffix.toUpperCase());
  const entityName = baseEndsWithSuffix
    ? companyNameBase
    : `${companyNameBase} ${suffix}`.trim();

  // Build address
  const addr = data.company || {};
  const principalAddress = [
    addr.addressLine1,
    addr.addressLine2,
    addr.city,
    addr.state,
    addr.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    entity_type: isCorp ? "CORP" : "LLC",
    entity_name: entityName,
    state_of_formation: data.company?.formationState || "Florida",
    date_of_formation: new Date().toISOString(),
    principal_address: principalAddress,
    county: agreement.litigationCounty || data.company?.litigationCounty || "",
    business_purpose: data.company?.businessPurpose || "Any lawful purpose",

    // Owners
    owners_list: buildOwnersList(data, ownerCount, isCorp),

    // Capital structure (Corp)
    total_authorized_shares: Number(data.company?.numberOfShares || 1000),
    par_value: 0.01,

    // Management
    management_type: agreement.llc_managingMembers === "Yes" ? "member" : "manager",
    directors_managers: buildDirectorsManagers(data, isCorp),
    officers: buildOfficers(data),
    tax_matters_partner: isCorp
      ? agreement.corp_taxOwner || ""
      : agreement.llc_taxPartner || "",

    // Capital & Loans voting
    additional_capital_voting: isCorp
      ? votingCode(agreement.corp_moreCapitalDecision)
      : votingCode(agreement.llc_additionalContributionsDecision),
    shareholder_loans_voting: isCorp
      ? votingCode(agreement.corp_shareholderLoansVoting)
      : votingCode(agreement.llc_memberLoansVoting),

    // Distributions
    distribution_frequency: (() => {
      const freq = agreement.distributionFrequency;
      if (freq === "Semestral") return "semi_annual";
      if (freq === "Anual") return "annual";
      if (freq === "Discreción de la Junta") return "discretion";
      return "quarterly";
    })(),
    min_tax_distribution: agreement.llc_minTaxDistribution || 30,

    // Governance
    majority_threshold: agreement.majorityThreshold || 50,
    supermajority_threshold: agreement.supermajorityThreshold || undefined,
    sale_of_company_voting: isCorp
      ? votingCode(agreement.corp_saleDecisionThreshold)
      : votingCode(agreement.llc_companySaleDecision),
    major_decisions_voting: isCorp
      ? votingCode(agreement.corp_majorDecisionThreshold)
      : votingCode(agreement.llc_majorDecisions),
    major_spending_threshold: isCorp
      ? parseCurrency(agreement.corp_majorSpendingThreshold) || 5000
      : parseCurrency(agreement.llc_majorSpendingThreshold) || 10000,
    bank_signees: (() => {
      const val = isCorp
        ? agreement.corp_bankSigners
        : agreement.llc_bankSigners;
      return val === "Dos firmantes" ? "two" : "one";
    })(),
    new_member_admission_voting: isCorp
      ? votingCode(agreement.corp_newShareholdersAdmission)
      : votingCode(agreement.llc_newMembersAdmission),
    dissolution_voting: isCorp
      ? "majority" // Corp doesn't have a separate dissolution field; defaults to majority
      : votingCode(agreement.llc_dissolutionDecision),
    officer_removal_voting: isCorp
      ? votingCode(agreement.corp_officerRemovalVoting)
      : votingCode(agreement.llc_officerRemovalVoting),

    // Transfer restrictions
    family_transfer: isCorp
      ? mapFamilyTransfer(agreement.corp_transferToRelatives)
      : mapFamilyTransfer(agreement.llc_transferToRelatives),
    right_of_first_refusal: isCorp
      ? agreement.corp_rofr === "Yes"
      : agreement.llc_rofr === "Yes",
    rofr_offer_period: isCorp
      ? agreement.corp_rofrOfferPeriod || 180
      : agreement.llc_rofrOfferPeriod || 180,
    death_incapacity_forced_sale: isCorp
      ? agreement.corp_incapacityHeirsPolicy === "Yes"
      : agreement.llc_incapacityHeirsPolicy === "Yes",
    drag_along: isCorp
      ? agreement.corp_tagDragRights === "Yes"
      : agreement.llc_tagDragRights === "Yes",
    tag_along: isCorp
      ? agreement.corp_tagDragRights === "Yes"
      : agreement.llc_tagDragRights === "Yes",

    // Non-compete & confidentiality
    include_noncompete: isCorp
      ? agreement.corp_nonCompete === "Yes"
      : agreement.llc_nonCompete === "Yes",
    noncompete_duration: isCorp
      ? agreement.corp_nonCompeteDuration || 2
      : agreement.llc_nonCompeteDuration || 2,
    noncompete_scope: isCorp
      ? agreement.corp_nonCompeteScope || ""
      : agreement.llc_nonCompeteScope || "",
    include_nonsolicitation: isCorp
      ? agreement.corp_nonSolicitation !== "No"
      : agreement.llc_nonSolicitation !== "No",
    include_confidentiality: isCorp
      ? agreement.corp_confidentiality !== "No"
      : agreement.llc_confidentiality !== "No",
  };
}
