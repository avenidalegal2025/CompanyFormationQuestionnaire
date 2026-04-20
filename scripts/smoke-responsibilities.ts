// Smoke test: does the Specific Responsibilities section render into the
// generated agreement when owners have title / responsibilities set?
import { generateDocument } from "../src/lib/agreement-docgen";
import PizZip from "pizzip";
import fs from "node:fs";
import path from "node:path";

async function check(entity: "LLC" | "CORP", label: string) {
  const baseAnswers: any = {
    entity_type: entity,
    entity_name: entity === "LLC" ? "RESP TEST LLC" : "RESP TEST Inc",
    state_of_formation: "Florida",
    date_of_formation: "2026-04-20T00:00:00Z",
    principal_address: "200 S Biscayne Blvd, Miami, FL 33131",
    county: "Miami-Dade",
    owners_list: [
      {
        full_name: "Alice Founder",
        shares_or_percentage: 60,
        capital_contribution: 60000,
        title: "Chief Executive Officer",
        responsibilities: "Overall strategy, fundraising, and external partnerships.",
      },
      {
        full_name: "Bob Co-Founder",
        shares_or_percentage: 40,
        capital_contribution: 40000,
        title: "Chief Technology Officer",
        responsibilities: "Product engineering, hiring, and tech operations.",
      },
    ],
    total_authorized_shares: 10000,
    par_value: 0.01,
    management_type: entity === "LLC" ? "manager" : "manager",
    directors_managers: [{ name: "Alice Founder" }, { name: "Bob Co-Founder" }],
    officers: entity === "LLC"
      ? []
      : [
          { name: "Alice Founder", title: "President" },
          { name: "Bob Co-Founder", title: "VP" },
        ],
    tax_matters_partner: "Alice Founder",
    additional_capital_voting: "majority",
    shareholder_loans_voting: "majority",
    distribution_frequency: "quarterly",
    majority_threshold: 50.01,
    supermajority_threshold: 75,
    sale_of_company_voting: "supermajority",
    major_decisions_voting: "majority",
    major_spending_threshold: 5000,
    bank_signees: "two",
    new_member_admission_voting: "supermajority",
    dissolution_voting: "unanimous",
    officer_removal_voting: "supermajority",
    family_transfer: "free",
    right_of_first_refusal: true,
    rofr_offer_period: 60,
    death_incapacity_forced_sale: false,
    drag_along: false,
    tag_along: false,
    include_noncompete: false,
    include_nonsolicitation: true,
    include_confidentiality: true,
  };

  const { buffer, filename } = await generateDocument(baseAnswers);
  const home = process.env.USERPROFILE || ".";
  const out = path.join(home, "Downloads", `SMOKE_${entity}_responsibilities.docx`);
  fs.writeFileSync(out, buffer);

  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml")!.asText();
  const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");

  const checks = {
    sectionHeading: /Specific Responsibilities of (Shareholders|Members)\./.test(texts),
    aliceTitle: texts.includes("Alice Founder, as Chief Executive Officer"),
    aliceDesc: texts.includes("Overall strategy, fundraising"),
    bobTitle: texts.includes("Bob Co-Founder, as Chief Technology Officer"),
    bobDesc: texts.includes("Product engineering"),
    bulletA: texts.includes("(a)"),
    bulletB: texts.includes("(b)"),
  };

  console.log(`\n=== ${label} (${entity}) ===`);
  console.log(`  filename: ${filename}`);
  console.log(`  saved to: ${out}`);
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? "OK  " : "FAIL"} ${k}`);
  }
  return Object.values(checks).every(Boolean);
}

async function checkNoInject() {
  // If no owner has title/responsibilities, the section should NOT appear.
  const noRespAnswers: any = {
    entity_type: "CORP",
    entity_name: "NORESP Inc",
    state_of_formation: "Florida",
    date_of_formation: "2026-04-20T00:00:00Z",
    principal_address: "200 S Biscayne Blvd, Miami, FL 33131",
    county: "Miami-Dade",
    owners_list: [
      { full_name: "Carol", shares_or_percentage: 50, capital_contribution: 50000 },
      { full_name: "Dave", shares_or_percentage: 50, capital_contribution: 50000 },
    ],
    total_authorized_shares: 10000, par_value: 0.01,
    management_type: "manager",
    directors_managers: [{ name: "Carol" }, { name: "Dave" }],
    officers: [{ name: "Carol", title: "President" }, { name: "Dave", title: "VP" }],
    additional_capital_voting: "majority", shareholder_loans_voting: "majority",
    distribution_frequency: "quarterly", majority_threshold: 50.01, supermajority_threshold: 75,
    sale_of_company_voting: "majority", major_decisions_voting: "majority",
    major_spending_threshold: 5000, bank_signees: "two",
    new_member_admission_voting: "majority", dissolution_voting: "unanimous",
    officer_removal_voting: "majority", family_transfer: "free",
    right_of_first_refusal: false, rofr_offer_period: 60,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  };
  const { buffer } = await generateDocument(noRespAnswers);
  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml")!.asText();
  const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, "")).join("");
  const leaked = /Specific Responsibilities of (Shareholders|Members)\./.test(texts);
  console.log(`\n=== no-inject guard (CORP, no title/desc) ===`);
  console.log(`  ${!leaked ? "OK  " : "FAIL"} section does not appear when fields are empty`);
  return !leaked;
}

async function main() {
  const r1 = await check("CORP", "Corp with responsibilities");
  const r2 = await check("LLC", "LLC with responsibilities");
  const r3 = await checkNoInject();
  const ok = r1 && r2 && r3;
  console.log(`\n${ok ? "ALL PASS" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
