import { generateDocument, QuestionnaireAnswers } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";

function base(entity: "LLC" | "CORP"): QuestionnaireAnswers {
  return {
    entity_type: entity, entity_name: "Testco", state_of_formation: "Florida",
    date_of_formation: "2026-01-01", principal_address: "1 Main St, Miami, FL 33101",
    county: "Miami-Dade",
    owners_list: [
      { full_name: "Ana Ruiz", shares_or_percentage: 50, capital_contribution: 1000 },
      { full_name: "Luis Paz", shares_or_percentage: 50, capital_contribution: 1000 },
    ],
    total_authorized_shares: 1000, par_value: 0.001, management_type: "manager",
    directors_managers: [{ name: "Ana Ruiz" }, { name: "Luis Paz" }],
    officers: [{ name: "Ana Ruiz", title: "President" }, { name: "Luis Paz", title: "Secretary" }],
    additional_capital_voting: "Majority", shareholder_loans_voting: "Majority",
    distribution_frequency: "quarterly", majority_threshold: 51,
    sale_of_company_voting: "Majority", major_decisions_voting: "Majority",
    major_spending_threshold: 10000, bank_signees: "one",
    new_member_admission_voting: "Majority", dissolution_voting: "Majority",
    officer_removal_voting: "Majority", family_transfer: "allowed",
    right_of_first_refusal: true, death_incapacity_forced_sale: true,
    divorce_forced_buyout: true, drag_along: true, tag_along: true,
    include_noncompete: true, include_nonsolicitation: true, include_confidentiality: true,
  } as QuestionnaireAnswers;
}

async function scan(a: QuestionnaireAnswers) {
  const { buffer } = await generateDocument(a);
  const t = new PizZip(buffer).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
  const hits = [...t.matchAll(/State of (\w+)|Miami-?Dade|(\w[\w-]*) County/g)].map((m) => m[0]);
  return [...new Set(hits)].join(" | ");
}

(async () => {
  for (const entity of ["LLC", "CORP"] as const) {
    for (const [st, county] of [["Florida", "Miami-Dade"], ["Delaware", "New Castle"], ["Wyoming", ""]] as const) {
      const a = base(entity);
      a.state_of_formation = st;
      a.county = county;
      console.log(`${entity} / ${st} / county="${county}"\n   ${await scan(a)}\n`);
    }
  }
})();
