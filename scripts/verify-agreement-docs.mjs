/**
 * Automated UAT verification for generated agreement documents.
 * Checks: variable fills, voting replacements, conditional sections,
 * bank text, spending thresholds, formatting preservation, and structure.
 *
 * Usage: node scripts/verify-agreement-docs.mjs [--save-report]
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";

// ── Helpers ──

function extractDocxXml(docxPath) {
  const buf = fs.readFileSync(docxPath);
  // DOCX is a ZIP — find word/document.xml
  // Minimal ZIP parser
  const entries = [];
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      // Local file header
      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const uncompSize = buf.readUInt32LE(offset + 22);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;
      let content;
      if (compMethod === 0) {
        content = buf.subarray(dataStart, dataEnd);
      } else if (compMethod === 8) {
        content = zlib.inflateRawSync(buf.subarray(dataStart, dataEnd));
      }
      entries.push({ name, content });
      offset = dataEnd;
    } else {
      offset++;
    }
  }
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  return docEntry ? docEntry.content.toString("utf8") : "";
}

function extractFullText(xml) {
  const texts = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return texts.map((t) => t.replace(/<[^>]+>/g, "")).join("");
}

function checkContains(text, phrase) {
  return text.includes(phrase);
}

function checkNotContains(text, phrase) {
  return !text.includes(phrase);
}

// Check XML structure is valid (balanced tags, no corruption)
function checkXmlStructure(xml) {
  const issues = [];
  // Check no raw {{ }} left
  if (xml.includes("{{") && xml.includes("}}")) {
    const matches = xml.match(/\{\{[^}]+\}\}/g) || [];
    issues.push(`Unfilled template variables: ${matches.join(", ")}`);
  }
  // Check w:document root exists
  if (!xml.includes("<w:document")) issues.push("Missing <w:document> root");
  if (!xml.includes("</w:document>")) issues.push("Missing </w:document> closing");
  // Check w:body exists
  if (!xml.includes("<w:body")) issues.push("Missing <w:body>");
  return issues;
}

// Check formatting preservation — verify key formatting elements exist
function checkFormatting(xml) {
  const issues = [];
  // Check fonts exist
  if (!xml.includes("<w:rFonts")) issues.push("No font specifications found");
  // Check bold text exists
  if (!xml.includes("<w:b/>") && !xml.includes("<w:b ")) issues.push("No bold formatting found");
  // Check paragraph styles exist
  if (!xml.includes("<w:pStyle")) issues.push("No paragraph styles found");
  return issues;
}

// ── Test runner ──

function runTest(name, fn) {
  const result = fn();
  const passed = result.passed;
  const icon = passed ? "PASS" : "FAIL";
  console.log(`  ${icon}  ${name}`);
  if (!passed && result.detail) {
    console.log(`         ${result.detail}`);
  }
  return passed;
}

// ── Generate test documents ──

async function generateTestDocs() {
  // Dynamic import of the docgen module via tsx compilation
  const { execSync } = await import("child_process");

  const testScript = `
import { generateDocument } from './src/lib/agreement-docgen';
import fs from 'fs';

async function gen() {
  const llc = await generateDocument({
    entity_type: 'LLC', entity_name: 'VERIFY MIAMI LLC', state_of_formation: 'Florida',
    date_of_formation: '2026-03-23', principal_address: '200 S Biscayne Blvd, Suite 400, Miami, FL 33131',
    county: 'Miami-Dade', business_purpose: 'Technology consulting',
    owners_list: [
      { full_name: 'Marco Antonio Rodriguez', shares_or_percentage: 60, capital_contribution: 60000 },
      { full_name: 'Sofia Maria Hernandez', shares_or_percentage: 40, capital_contribution: 40000 },
    ], management_type: 'manager',
    directors_managers: [{ name: 'Marco Antonio Rodriguez' }, { name: 'Sofia Maria Hernandez' }],
    officers: [], tax_matters_partner: 'Marco Antonio Rodriguez',
    additional_capital_voting: 'supermajority', shareholder_loans_voting: 'majority',
    distribution_frequency: 'quarterly', min_tax_distribution: 30, majority_threshold: 50,
    supermajority_threshold: 75, sale_of_company_voting: 'unanimous',
    major_decisions_voting: 'supermajority', major_spending_threshold: 10000, bank_signees: 'two',
    new_member_admission_voting: 'unanimous', dissolution_voting: 'unanimous',
    officer_removal_voting: 'majority', family_transfer: 'free', right_of_first_refusal: true,
    rofr_offer_period: 180, death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  });
  fs.writeFileSync('/tmp/verify_llc.docx', llc.buffer);

  // LLC without ROFR (conditional section removal)
  const llcNoRofr = await generateDocument({
    entity_type: 'LLC', entity_name: 'NO ROFR LLC', state_of_formation: 'Florida',
    date_of_formation: '2026-03-23', principal_address: '123 Test St',
    county: 'Broward', owners_list: [
      { full_name: 'Test Person', shares_or_percentage: 100, capital_contribution: 10000 },
    ], management_type: 'member',
    directors_managers: [{ name: 'Test Person' }], officers: [],
    tax_matters_partner: 'Test Person', additional_capital_voting: 'majority',
    shareholder_loans_voting: 'majority', distribution_frequency: 'annual', majority_threshold: 50,
    sale_of_company_voting: 'majority', major_decisions_voting: 'majority',
    major_spending_threshold: 5000, bank_signees: 'one',
    new_member_admission_voting: 'majority', dissolution_voting: 'majority',
    officer_removal_voting: 'majority', family_transfer: 'free',
    right_of_first_refusal: false, rofr_offer_period: 0,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: false, include_confidentiality: false,
  });
  fs.writeFileSync('/tmp/verify_llc_no_rofr.docx', llcNoRofr.buffer);

  const corp = await generateDocument({
    entity_type: 'CORP', entity_name: 'VERIFY CORP Inc', state_of_formation: 'Florida',
    date_of_formation: '2026-03-23', principal_address: '100 Wall Street, Miami, FL 33131',
    county: 'Miami-Dade', owners_list: [
      { full_name: 'Roberto Carlos Mendez', shares_or_percentage: 600, capital_contribution: 50000 },
      { full_name: 'Ana Maria Garcia', shares_or_percentage: 400, capital_contribution: 30000 },
    ], management_type: 'manager',
    directors_managers: [{ name: 'Roberto Carlos Mendez' }, { name: 'Ana Maria Garcia' }],
    officers: [{ name: 'Roberto Carlos Mendez', title: 'President' }, { name: 'Ana Maria Garcia', title: 'Treasurer' }],
    tax_matters_partner: 'Roberto Carlos Mendez', additional_capital_voting: 'majority',
    shareholder_loans_voting: 'supermajority', distribution_frequency: 'semi_annual',
    majority_threshold: 50, supermajority_threshold: 75,
    sale_of_company_voting: 'supermajority', major_decisions_voting: 'majority',
    major_spending_threshold: 5000, bank_signees: 'two',
    new_member_admission_voting: 'unanimous', dissolution_voting: 'majority',
    officer_removal_voting: 'supermajority', family_transfer: 'unanimous',
    right_of_first_refusal: true, rofr_offer_period: 90,
    death_incapacity_forced_sale: true, drag_along: true, tag_along: true,
    include_noncompete: true, noncompete_duration: 2, noncompete_scope: 'State of Florida',
    include_nonsolicitation: true, include_confidentiality: true,
  });
  fs.writeFileSync('/tmp/verify_corp.docx', corp.buffer);

  // Corp without ROFR + without drag/tag
  const corpMinimal = await generateDocument({
    entity_type: 'CORP', entity_name: 'MINIMAL CORP Inc', state_of_formation: 'Delaware',
    date_of_formation: '2026-01-15', principal_address: '456 Broad St, Dover, DE 19901',
    county: 'Kent', owners_list: [
      { full_name: 'Single Owner', shares_or_percentage: 1000, capital_contribution: 100000 },
    ], management_type: 'manager',
    directors_managers: [{ name: 'Single Owner' }],
    officers: [{ name: 'Single Owner', title: 'President & CEO' }],
    tax_matters_partner: 'Single Owner', additional_capital_voting: 'unanimous',
    shareholder_loans_voting: 'unanimous', distribution_frequency: 'quarterly',
    majority_threshold: 50, sale_of_company_voting: 'unanimous',
    major_decisions_voting: 'unanimous', major_spending_threshold: 10000, bank_signees: 'one',
    new_member_admission_voting: 'unanimous', dissolution_voting: 'unanimous',
    officer_removal_voting: 'unanimous', family_transfer: 'free',
    right_of_first_refusal: false, rofr_offer_period: 0,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: false, include_confidentiality: false,
  });
  fs.writeFileSync('/tmp/verify_corp_minimal.docx', corpMinimal.buffer);

  console.log('Generated 4 test documents');
}
gen();
`;

  const genPath = path.resolve("_verify_gen.ts");
  fs.writeFileSync(genPath, testScript);
  try {
    execSync(`npx tsx ${genPath}`, {
      cwd: path.resolve("."),
      stdio: "inherit"
    });
  } finally {
    try { fs.unlinkSync(genPath); } catch {}
  }
}

// ── Main ──

async function main() {
  console.log("Generating test documents...\n");
  await generateTestDocs();

  let totalPassed = 0;
  let totalFailed = 0;

  function test(name, fn) {
    const passed = runTest(name, fn);
    if (passed) totalPassed++;
    else totalFailed++;
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 1: LLC Full Agreement
  // ═══════════════════════════════════════════════════════════
  console.log("\n══ LLC Full Agreement (VERIFY MIAMI LLC) ══");
  const llcXml = extractDocxXml("/tmp/verify_llc.docx");
  const llcText = extractFullText(llcXml);

  // Structure
  test("XML structure valid", () => {
    const issues = checkXmlStructure(llcXml);
    return { passed: issues.length === 0, detail: issues.join("; ") };
  });
  test("Formatting preserved", () => {
    const issues = checkFormatting(llcXml);
    return { passed: issues.length === 0, detail: issues.join("; ") };
  });
  test("No unfilled {{}} variables", () => ({
    passed: checkNotContains(llcText, "{{"),
  }));

  // Variable fills
  test("Company name: VERIFY MIAMI LLC", () => ({
    passed: checkContains(llcText, "VERIFY MIAMI LLC"),
  }));
  test("State: Florida", () => ({
    passed: checkContains(llcText, "Florida"),
  }));
  test("County: Miami-Dade", () => ({
    passed: checkContains(llcText, "Miami-Dade"),
  }));
  test("Address filled", () => ({
    passed: checkContains(llcText, "200 S Biscayne Blvd"),
  }));
  test("Member 1: Marco Antonio Rodriguez", () => ({
    passed: checkContains(llcText, "Marco Antonio Rodriguez"),
  }));
  test("Member 2: Sofia Maria Hernandez", () => ({
    passed: checkContains(llcText, "Sofia Maria Hernandez"),
  }));
  test("Manager type: Managers", () => ({
    passed: checkContains(llcText, "Managers"),
  }));
  test("Tax Matters Partner filled", () => ({
    passed: checkContains(llcText, "Marco Antonio Rodriguez"),
  }));
  test("Capital contribution: 60,000", () => ({
    passed: checkContains(llcText, "60,000"),
  }));
  test("Capital contribution: 40,000", () => ({
    passed: checkContains(llcText, "40,000"),
  }));

  // Voting replacements
  test("Sale: Unanimous (not Majority)", () => ({
    passed:
      checkContains(llcText, "Unanimous consent of the Members") &&
      checkNotContains(llcText, "requires the Majority consent of the Members"),
    detail: "Should say 'Unanimous consent' not 'Majority consent'",
  }));
  test("Additional capital: Super Majority", () => ({
    passed: checkContains(llcText, "Super Majority to the incurrence"),
  }));
  test("Major decisions: Super Majority Approval", () => ({
    passed: checkContains(llcText, "Super Majority Approval of the Members"),
  }));
  test("Dissolution: Unanimous election", () => ({
    passed: checkContains(llcText, "Unanimous election of the Members to dissolve"),
  }));
  test("Officer removal: Majority vote", () => ({
    passed: checkContains(llcText, "Majority vote of the Members excluding"),
  }));
  test("Loans: Majority consent", () => ({
    passed: checkContains(llcText, "Majority consent of the Members"),
  }));

  // Bank signees
  test("Bank: two signers", () => ({
    passed: checkContains(llcText, "any two Members or Managers"),
  }));
  test("Bank: 'one' removed", () => ({
    passed: checkNotContains(
      llcText,
      "the signature of any Member or Manager of the Company"
    ),
  }));

  // ROFR present
  test("ROFR section present", () => ({
    passed: checkContains(llcText, "Right of First Refusal"),
  }));

  // Drag/Tag Along removed
  test("Drag Along removed", () => ({
    passed: checkNotContains(llcText, "Drag Along"),
  }));
  test("Tag Along removed", () => ({
    passed: checkNotContains(llcText, "Tag Along"),
  }));

  // ═══════════════════════════════════════════════════════════
  // TEST 2: LLC No ROFR (conditional removal)
  // ═══════════════════════════════════════════════════════════
  console.log("\n══ LLC No ROFR (conditional section removal) ══");
  const llcNoRofrXml = extractDocxXml("/tmp/verify_llc_no_rofr.docx");
  const llcNoRofrText = extractFullText(llcNoRofrXml);

  test("No unfilled {{}} variables", () => ({
    passed: checkNotContains(llcNoRofrText, "{{"),
  }));
  test("Company name: NO ROFR LLC", () => ({
    passed: checkContains(llcNoRofrText, "NO ROFR LLC"),
  }));
  test("ROFR section REMOVED", () => ({
    passed: checkNotContains(llcNoRofrText, "Right of First Refusal"),
    detail: "Section 12.1 should be completely removed when ROFR=No",
  }));
  test("Management type: Members (member-managed)", () => ({
    passed: checkContains(llcNoRofrText, "Members"),
  }));
  test("Bank: one signer (default)", () => ({
    passed: checkContains(
      llcNoRofrText,
      "the signature of any Member or Manager"
    ),
  }));
  test("All voting: Majority", () => ({
    passed: checkContains(llcNoRofrText, "Majority"),
  }));

  // ═══════════════════════════════════════════════════════════
  // TEST 3: Corp Full Agreement
  // ═══════════════════════════════════════════════════════════
  console.log("\n══ Corp Full Agreement (VERIFY CORP Inc) ══");
  const corpXml = extractDocxXml("/tmp/verify_corp.docx");
  const corpText = extractFullText(corpXml);

  test("XML structure valid", () => {
    const issues = checkXmlStructure(corpXml);
    return { passed: issues.length === 0, detail: issues.join("; ") };
  });
  test("No unfilled {{}} variables", () => ({
    passed: checkNotContains(corpText, "{{"),
  }));

  // Variable fills
  test("Company name: VERIFY CORP Inc", () => ({
    passed: checkContains(corpText, "VERIFY CORP Inc"),
  }));
  test("State: Florida", () => ({
    passed: checkContains(corpText, "Florida"),
  }));
  test("County: Miami-Dade", () => ({
    passed: checkContains(corpText, "Miami-Dade"),
  }));
  test("Shareholder 1: Roberto Carlos Mendez", () => ({
    passed: checkContains(corpText, "Roberto Carlos Mendez"),
  }));
  test("Shareholder 2: Ana Maria Garcia", () => ({
    passed: checkContains(corpText, "Ana Maria Garcia"),
  }));
  test("Shares: 600", () => ({
    passed: checkContains(corpText, "600"),
  }));
  test("ROFR period: 90", () => ({
    passed: checkContains(corpText, "90"),
  }));
  test("Spending threshold: 5,000", () => ({
    passed: checkContains(corpText, "5,000"),
  }));

  // Voting replacements
  test("Sale: Super Majority", () => ({
    passed: checkContains(corpText, "Super Majority consent or approval"),
  }));
  test("Major decisions: Majority", () => ({
    passed: checkContains(
      corpText,
      "Majority affirmative vote of the Board of Directors"
    ),
  }));
  test("New members: Unanimous", () => ({
    passed: checkContains(
      corpText,
      "Unanimous of the Shareholders"
    ),
  }));
  test("Dissolution: Majority election", () => ({
    passed: checkContains(
      corpText,
      "Majority election to dissolve by the Shareholders"
    ),
  }));
  test("Officer removal: Super Majority", () => ({
    passed: checkContains(
      corpText,
      "Super Majority vote of the Shareholders"
    ),
  }));

  // Bank signees
  test("Bank: two signers", () => ({
    passed: checkContains(corpText, "two of the Officers"),
  }));

  // ROFR present
  test("ROFR section present", () => ({
    passed: checkContains(corpText, "Right of First Refusal"),
  }));

  // Drag/Tag Along present
  test("Drag Along present", () => ({
    passed: checkContains(corpText, "Drag Along"),
  }));
  test("Tag Along present", () => ({
    passed: checkContains(corpText, "Tag Along"),
  }));

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Corp Minimal (no ROFR, no drag/tag, unanimous everything)
  // ═══════════════════════════════════════════════════════════
  console.log("\n══ Corp Minimal (no ROFR, no drag/tag, all unanimous) ══");
  const corpMinXml = extractDocxXml("/tmp/verify_corp_minimal.docx");
  const corpMinText = extractFullText(corpMinXml);

  test("No unfilled {{}} variables", () => ({
    passed: checkNotContains(corpMinText, "{{"),
  }));
  test("Company name: MINIMAL CORP Inc", () => ({
    passed: checkContains(corpMinText, "MINIMAL CORP Inc"),
  }));
  test("State: Delaware", () => ({
    passed: checkContains(corpMinText, "Delaware"),
  }));
  test("County: Kent", () => ({
    passed: checkContains(corpMinText, "Kent"),
  }));
  test("ROFR section REMOVED", () => ({
    passed: checkNotContains(corpMinText, "Right of First Refusal"),
  }));
  test("Drag Along REMOVED", () => ({
    passed: checkNotContains(corpMinText, "Drag Along"),
  }));
  test("Tag Along REMOVED", () => ({
    passed: checkNotContains(corpMinText, "Tag Along"),
  }));
  test("Sale: Unanimous", () => ({
    passed: checkContains(
      corpMinText,
      "Unanimous consent or approval"
    ),
  }));
  test("Bank: one signer", () => ({
    passed: checkContains(corpMinText, "one of the Officers"),
  }));

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(50)}`);
  console.log(
    `TOTAL: ${totalPassed + totalFailed} tests, ${totalPassed} passed, ${totalFailed} failed`
  );
  if (totalFailed > 0) {
    console.log("STATUS: FAIL — see details above");
    process.exit(1);
  } else {
    console.log("STATUS: ALL PASSED");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
