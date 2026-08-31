import { generateDocument, QuestionnaireAnswers } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";
const base = (st: string, county: string): QuestionnaireAnswers => ({
  entity_type: "CORP", entity_name: "Testco", state_of_formation: st,
  date_of_formation: "2026-01-01", principal_address: "1 Main St", county,
  owners_list: [
    { full_name: "Ana Ruiz", shares_or_percentage: 50, capital_contribution: 1000 },
    { full_name: "Luis Paz", shares_or_percentage: 50, capital_contribution: 1000 }],
  total_authorized_shares: 1000, par_value: 0.001,
  directors_managers: [{ name: "Ana Ruiz" }], officers: [{ name: "Ana Ruiz", title: "President" }],
  additional_capital_voting: "Majority", shareholder_loans_voting: "Majority",
  distribution_frequency: "quarterly", majority_threshold: 51,
  sale_of_company_voting: "Majority", major_decisions_voting: "Majority",
  major_spending_threshold: 10000, bank_signees: "one",
  new_member_admission_voting: "Majority", dissolution_voting: "Majority",
  officer_removal_voting: "Majority", family_transfer: "allowed",
  right_of_first_refusal: true, death_incapacity_forced_sale: true,
  divorce_forced_buyout: true, drag_along: true, tag_along: true,
  include_noncompete: true, include_nonsolicitation: true, include_confidentiality: true,
} as QuestionnaireAnswers);
(async () => {
  for (const [st, c] of [["Florida", "Miami-Dade"], ["Delaware", "New Castle"], ["Wyoming", ""]] as const) {
    const { buffer } = await generateDocument(base(st, c));
    const t = new PizZip(buffer).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
    const i = t.indexOf("Sole and proper venue");
    console.log(`${st}: ...${t.slice(i - 150, i + 130).replace(/\s+/g, " ")}\n`);
  }
})();
