/**
 * Checks for the third batch of Antonio-review defects:
 *
 *  1. "La admisión de nuevos socios" (Step 9) and "Adición de nuevos socios"
 *     (Step 7) were the same question in different words. Only Step 7's answer
 *     reached the agreement; Step 9's was collected and discarded.
 *  2. agreement.distributionFrequency drives four hardcoded "quarterly"
 *     phrasings in the Corp template but no step ever asked for it, so every
 *     Corp agreement said quarterly.
 *  3. agreement.llc_minTaxDistribution was defaulted to 30 and written to
 *     Airtable even though no template has a tax-distribution clause.
 */
import { readFileSync } from "fs";
import PizZip from "pizzip";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

function docText(buf: Buffer): string {
  const xml = new PizZip(buf).file("word/document.xml")!.asText();
  return xml
    .split(/<w:p[ >]/)
    .slice(1)
    .map((p) => p.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${ok ? "" : `\n        ${detail}`}`);
  if (!ok) failures++;
};

function corpForm(agreement: Record<string, unknown>) {
  return {
    // entityType is read from company.entityType, not the top level.
    company: {
      entityType: "C-Corp",
      companyName: "DIVIDEND TEST INC",
      formationState: "Florida",
      numberOfShares: 1000,
    },
    ownersCount: 2,
    owners: {
      0: { ownerType: "persona", fullName: "Ana Uno", ownership: 50 },
      1: { ownerType: "persona", fullName: "Beto Dos", ownership: 50 },
    },
    admin: {
      wantAgreement: "Yes",
      directorsAllOwners: "Yes",
      directorsCount: 2,
      shareholderOfficer1Role: "President",
      shareholderOfficer2Role: "Secretary",
    },
    agreement,
  };
}

async function duplicateTest() {
  console.log("\n[1] the duplicate new-partners question is gone from the form");
  const step9 = readFileSync("src/components/steps/Step9Agreement4.tsx", "utf8");
  const step7 = readFileSync("src/components/steps/Step7Agreement2.tsx", "utf8");
  check("Step 9 no longer asks it", !step9.includes("llc_newPartnersAdmission"));
  check("Step 7 still asks it once", step7.includes("llc_newMembersAdmission"));

  // The surviving answer must still be what drives the clause.
  const a: any = await mapFormToDocgenAnswers({
    entityType: "LLC",
    company: { companyName: "DUP TEST LLC", formationState: "Florida" },
    ownersCount: 2,
    owners: { 0: { fullName: "Ana Uno", ownership: 50 }, 1: { fullName: "Beto Dos", ownership: 50 } },
    admin: { wantAgreement: "Yes", managersAllOwners: "Yes", managersCount: 2 },
    agreement: { llc_newMembersAdmission: "Mayoría" },
  } as any);
  check(
    "Step 7 answer still drives new_member_admission_voting",
    a.new_member_admission_voting === "majority",
    `got ${JSON.stringify(a.new_member_admission_voting)}`
  );
}

async function frequencyTest() {
  console.log("\n[2] dividend frequency actually changes the Corp agreement");
  // Assert on the §11.6 meeting cadence sentence: it is the one phrasing that
  // exists verbatim for all four choices, so the same check works across cases.
  const cases: Array<[string, string, RegExp]> = [
    ["Trimestral", "quarterly", /Board of Directors shall meet quarterly/],
    ["Semestral", "semi_annual", /Board of Directors shall meet semi-annually/],
    ["Anual", "annual", /Board of Directors shall meet annually/],
    [
      "Discreción de la Junta",
      "discretion",
      /shall meet at the discretion of the Board of Directors/,
    ],
  ];
  for (const [spanish, code, phrase] of cases) {
    const a: any = await mapFormToDocgenAnswers(
      corpForm({ distributionFrequency: spanish }) as any
    );
    check(`${spanish} maps to ${code}`, a.distribution_frequency === code, `got ${a.distribution_frequency}`);
    const text = docText((await generateDocument(a as any)).buffer);
    check(`${spanish} reaches the document`, phrase.test(text), `no match for ${phrase}`);
    if (code !== "quarterly") {
      check(
        `${spanish} leaves no stray "quarterly" cadence`,
        !/shall meet quarterly|declared on a quarterly basis/.test(text),
        "the default phrasing survived"
      );
    }
  }
}

async function taxDefaultTest() {
  console.log("\n[3] no fabricated tax-distribution percentage");
  const unanswered: any = await mapFormToDocgenAnswers(
    corpForm({}) as any
  );
  check(
    "unanswered -> undefined, not an invented 30",
    unanswered.min_tax_distribution === undefined,
    `got ${JSON.stringify(unanswered.min_tax_distribution)}`
  );
  const answered: any = await mapFormToDocgenAnswers(
    corpForm({ llc_minTaxDistribution: 45 }) as any
  );
  check("an explicit value still passes through", answered.min_tax_distribution === 45,
    `got ${JSON.stringify(answered.min_tax_distribution)}`);
}

async function main() {
  await duplicateTest();
  await frequencyTest();
  await taxDefaultTest();
  console.log(failures ? `\n${failures} FAILING CHECK(S)\n` : "\nall checks pass\n");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
