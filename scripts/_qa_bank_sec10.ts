import { generateDocument, QuestionnaireAnswers } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";

function base(): QuestionnaireAnswers {
  return {
    entity_type: "LLC",
    entity_name: "Testco",
    state_of_formation: "Florida",
    date_of_formation: "2026-01-01",
    principal_address: "1 Main St, Miami, FL 33101",
    county: "Miami-Dade",
    owners_list: [],
    management_type: "manager",
    directors_managers: [],
    officers: [],
    additional_capital_voting: "Majority",
    shareholder_loans_voting: "Majority",
    distribution_frequency: "quarterly",
    majority_threshold: 51,
    sale_of_company_voting: "Majority",
    major_decisions_voting: "Majority",
    major_spending_threshold: 10000,
    bank_signees: "one",
    new_member_admission_voting: "Majority",
    dissolution_voting: "Majority",
    officer_removal_voting: "Majority",
    family_transfer: "allowed",
    right_of_first_refusal: true,
    death_incapacity_forced_sale: true,
    divorce_forced_buyout: true,
    drag_along: true,
    tag_along: true,
    include_noncompete: true,
    include_nonsolicitation: true,
    include_confidentiality: true,
  } as QuestionnaireAnswers;
}

function owner(n: string, pct: number) {
  return { full_name: n, shares_or_percentage: pct, capital_contribution: 1000 };
}

async function sec10(a: QuestionnaireAnswers) {
  const { buffer } = await generateDocument(a);
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  const t = xml.replace(/<[^>]+>/g, "");
  const i = t.indexOf("Bank Accounts");
  const j = t.indexOf("Management of the Limited Liability Company");
  return t.slice(i, j > i ? j : i + 700).replace(/\s+/g, " ").trim();
}

(async () => {
  const single = base();
  single.owners_list = [owner("Ana Ruiz", 100)];
  single.directors_managers = [{ name: "Ana Ruiz" }];

  const singleMemberMgd = base();
  singleMemberMgd.management_type = "member";
  singleMemberMgd.owners_list = [owner("Ana Ruiz", 100)];
  singleMemberMgd.directors_managers = [];

  const multi = base();
  multi.owners_list = [owner("Ana Ruiz", 50), owner("Luis Paz", 50)];
  multi.directors_managers = [{ name: "Ana Ruiz" }, { name: "Luis Paz" }];

  console.log("=== 1 owner, manager-managed ===\n" + (await sec10(single)) + "\n");
  console.log("=== 1 owner, member-managed ===\n" + (await sec10(singleMemberMgd)) + "\n");
  console.log("=== 2 owners (regression: must be UNCHANGED) ===\n" + (await sec10(multi)) + "\n");
})();
