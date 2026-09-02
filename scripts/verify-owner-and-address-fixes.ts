/**
 * Regression check for two defects Antonio's review surfaced:
 *
 *  1. An "empresa" owner reached the agreement as the literal placeholder
 *     "Owner 2", because every name lookup read only the person fields.
 *  2. company.addressLine2 (the suite/unit) was never written to Airtable, so
 *     it vanished from SS-4 / 2848 / 8821.
 *
 * Both are checked against real output -- the rendered document paragraphs and
 * the actual Airtable record object -- not against the source.
 */
import PizZip from "pizzip";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
import { mapQuestionnaireToAirtable } from "../src/lib/airtable";

function paragraphs(buf: Buffer): string[] {
  const xml = new PizZip(buf).file("word/document.xml")!.asText();
  return xml
    .split(/<w:p[ >]/)
    .slice(1)
    .map((p) => p.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${ok ? "" : `\n        ${detail}`}`);
  if (!ok) failures++;
};

async function ownerTest() {
  console.log("\n[1] empresa owner renders its company name, not \"Owner 2\"");
  const form = {
    entityType: "LLC",
    company: { companyName: "MIXED OWNERS LLC", formationState: "Florida" },
    ownersCount: 2,
    owners: {
      0: { ownerType: "persona", firstName: "Ana", lastName: "Uno", ownership: 40 },
      1: {
        ownerType: "empresa",
        companyName: "HOLDCO INTERNACIONAL LLC",
        companyAddress: "9 Brickell Ave, Miami, FL 33131",
        ownership: 60,
      },
    },
    admin: { wantAgreement: "Yes", managersAllOwners: "Yes", managersCount: 2 },
    agreement: {},
  };

  const answers: any = await mapFormToDocgenAnswers(form as any);
  const names = (answers.owners_list || []).map((o: any) => o.full_name);
  check(
    "mapper names the entity owner",
    names.includes("HOLDCO INTERNACIONAL LLC"),
    `owners_list names = ${JSON.stringify(names)}`
  );
  check(
    "no positional placeholder survives",
    !names.some((n: string) => /^Owner \d+$/.test(n)),
    `owners_list names = ${JSON.stringify(names)}`
  );

  const mgrs = (answers.directors_managers || []).map((m: any) => m.name);
  check(
    "entity owner is not dropped from the manager list",
    mgrs.includes("HOLDCO INTERNACIONAL LLC"),
    `managers = ${JSON.stringify(mgrs)}`
  );

  const doc = await generateDocument(answers as any);
  const text = paragraphs(doc.buffer).join("\n");
  check(
    "rendered document contains the entity name",
    text.includes("HOLDCO INTERNACIONAL LLC"),
    "entity name absent from the generated agreement"
  );
  check(
    "rendered document contains no \"Owner N\" placeholder",
    !/\bOwner \d\b/.test(text),
    `found: ${(text.match(/\bOwner \d\b/g) || []).join(", ")}`
  );
}

function addressTest() {
  console.log("\n[2] company.addressLine2 (suite) survives into the Airtable record");
  const stripeSession = {
    id: "cs_test_verify",
    amount_total: 100,
    customer_details: { email: "qa@example.com", name: "QA" },
    metadata: {},
  };
  const base = {
    entityType: "LLC",
    company: {
      companyName: "SUITE TEST LLC",
      formationState: "Florida",
      hasUsaAddress: "Yes",
      addressLine1: "1200 Brickell Ave",
      addressLine2: "Ste 405",
      city: "Miami",
      state: "FL",
      postalCode: "33131",
    },
    ownersCount: 1,
    // This path iterates owners with forEach, so it wants the array form.
    owners: [{ fullName: "Ana Uno", ownership: 100 }],
  };

  const rec: any = mapQuestionnaireToAirtable(base as any, stripeSession as any);
  check(
    "suite present in Company Address",
    String(rec["Company Address"]).includes("Ste 405"),
    `got: ${JSON.stringify(rec["Company Address"])}`
  );

  // The pre-existing fullAddress shortcut is what used to swallow line 2.
  const withFull = {
    ...base,
    company: { ...base.company, fullAddress: "1200 Brickell Ave, Miami FL 33131" },
  };
  const rec2: any = mapQuestionnaireToAirtable(withFull as any, stripeSession as any);
  check(
    "suite survives even when fullAddress is already set",
    String(rec2["Company Address"]).includes("Ste 405"),
    `got: ${JSON.stringify(rec2["Company Address"])}`
  );

  // And a company with no suite must not gain a stray separator.
  const noSuite = { ...base, company: { ...base.company, addressLine2: "" } };
  const rec3: any = mapQuestionnaireToAirtable(noSuite as any, stripeSession as any);
  check(
    "no suite -> address unchanged, no double comma",
    !/,\s*,/.test(String(rec3["Company Address"])),
    `got: ${JSON.stringify(rec3["Company Address"])}`
  );
  console.log(`        address rendered as: ${JSON.stringify(rec["Company Address"])}`);
}

async function main() {
  await ownerTest();
  addressTest();
  console.log(failures ? `\n${failures} FAILING CHECK(S)\n` : "\nall checks pass\n");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
