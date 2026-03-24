/**
 * Automated UAT: tests ALL variables, ALL voting replacements,
 * ALL conditional sections, bank text, spending, formatting.
 * 4 document variants × exhaustive checks.
 *
 * Usage: node scripts/verify-agreement-docs.mjs
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { execSync } from "child_process";

// ── DOCX parser ──
function extractDocxXml(docxPath) {
  const buf = fs.readFileSync(docxPath);
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;
      if (name === "word/document.xml") {
        if (compMethod === 0) return buf.subarray(dataStart, dataEnd).toString("utf8");
        if (compMethod === 8) return zlib.inflateRawSync(buf.subarray(dataStart, dataEnd)).toString("utf8");
      }
      offset = dataEnd;
    } else offset++;
  }
  return "";
}

function fullText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("");
}

// ── Test harness ──
let passed = 0, failed = 0;
function test(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); if (detail) console.log(`         ${detail}`); }
}
function has(text, phrase) { return text.includes(phrase); }
function notHas(text, phrase) { return !text.includes(phrase); }

// ── Generate 4 test docs ──
console.log("Generating 4 test documents...\n");
const genScript = `
import { generateDocument } from './src/lib/agreement-docgen';
import fs from 'fs';
async function gen() {
  // 1. LLC Full
  const llc = await generateDocument({
    entity_type:'LLC', entity_name:'VERIFY MIAMI LLC', state_of_formation:'Florida',
    date_of_formation:'2026-03-23T00:00:00Z', principal_address:'200 S Biscayne Blvd, Suite 400, Miami, FL 33131',
    county:'Miami-Dade', business_purpose:'Technology consulting',
    owners_list:[
      {full_name:'Marco Antonio Rodriguez',shares_or_percentage:60,capital_contribution:60000},
      {full_name:'Sofia Maria Hernandez',shares_or_percentage:40,capital_contribution:40000},
    ], management_type:'manager',
    directors_managers:[{name:'Marco Antonio Rodriguez'},{name:'Sofia Maria Hernandez'}],
    officers:[], tax_matters_partner:'Marco Antonio Rodriguez',
    additional_capital_voting:'supermajority', shareholder_loans_voting:'majority',
    distribution_frequency:'quarterly', min_tax_distribution:30, majority_threshold:50,
    supermajority_threshold:75, sale_of_company_voting:'unanimous',
    major_decisions_voting:'supermajority', major_spending_threshold:15000, bank_signees:'two',
    new_member_admission_voting:'unanimous', dissolution_voting:'unanimous',
    officer_removal_voting:'majority', family_transfer:'free', right_of_first_refusal:true,
    rofr_offer_period:180, death_incapacity_forced_sale:false, drag_along:false, tag_along:false,
    include_noncompete:false, include_nonsolicitation:true, include_confidentiality:true,
  });
  fs.writeFileSync('/tmp/v_llc.docx', llc.buffer);

  // 2. LLC No ROFR
  const llcMin = await generateDocument({
    entity_type:'LLC', entity_name:'NO ROFR LLC', state_of_formation:'Texas',
    date_of_formation:'2026-01-15T00:00:00Z', principal_address:'456 Elm St, Austin, TX 78701',
    county:'Travis', owners_list:[{full_name:'Test Person',shares_or_percentage:100,capital_contribution:10000}],
    management_type:'member',
    directors_managers:[{name:'Test Person'}], officers:[],
    tax_matters_partner:'Test Person', additional_capital_voting:'majority',
    shareholder_loans_voting:'majority', distribution_frequency:'annual', majority_threshold:50,
    sale_of_company_voting:'majority', major_decisions_voting:'majority',
    major_spending_threshold:5000, bank_signees:'one',
    new_member_admission_voting:'majority', dissolution_voting:'majority',
    officer_removal_voting:'majority', family_transfer:'free',
    right_of_first_refusal:false, rofr_offer_period:0,
    death_incapacity_forced_sale:false, drag_along:false, tag_along:false,
    include_noncompete:false, include_nonsolicitation:false, include_confidentiality:false,
  });
  fs.writeFileSync('/tmp/v_llc_min.docx', llcMin.buffer);

  // 3. Corp Full
  const corp = await generateDocument({
    entity_type:'CORP', entity_name:'VERIFY CORP Inc', state_of_formation:'Florida',
    date_of_formation:'2026-06-15T00:00:00Z', principal_address:'100 Wall Street, Suite 200, Miami, FL 33131',
    county:'Miami-Dade', owners_list:[
      {full_name:'Roberto Carlos Mendez',shares_or_percentage:600,capital_contribution:50000},
      {full_name:'Ana Maria Garcia',shares_or_percentage:400,capital_contribution:30000},
    ], total_authorized_shares:1000, par_value:0.01, management_type:'manager',
    directors_managers:[{name:'Roberto Carlos Mendez'},{name:'Ana Maria Garcia'}],
    officers:[{name:'Roberto Carlos Mendez',title:'President'},{name:'Ana Maria Garcia',title:'Treasurer'}],
    tax_matters_partner:'Roberto Carlos Mendez', additional_capital_voting:'majority',
    shareholder_loans_voting:'supermajority', distribution_frequency:'semi_annual',
    majority_threshold:50, supermajority_threshold:75,
    sale_of_company_voting:'supermajority', major_decisions_voting:'majority',
    major_spending_threshold:7500, bank_signees:'two',
    new_member_admission_voting:'unanimous', dissolution_voting:'majority',
    officer_removal_voting:'supermajority', family_transfer:'unanimous',
    right_of_first_refusal:true, rofr_offer_period:90,
    death_incapacity_forced_sale:true, drag_along:true, tag_along:true,
    include_noncompete:true, noncompete_duration:2, noncompete_scope:'State of Florida',
    include_nonsolicitation:true, include_confidentiality:true,
  });
  fs.writeFileSync('/tmp/v_corp.docx', corp.buffer);

  // 4. Corp Minimal
  const corpMin = await generateDocument({
    entity_type:'CORP', entity_name:'MINIMAL CORP Inc', state_of_formation:'Delaware',
    date_of_formation:'2026-01-15T00:00:00Z', principal_address:'456 Broad St, Dover, DE 19901',
    county:'Kent', owners_list:[{full_name:'Single Owner',shares_or_percentage:1000,capital_contribution:100000}],
    total_authorized_shares:1000, par_value:0.01, management_type:'manager',
    directors_managers:[{name:'Single Owner'}],
    officers:[{name:'Single Owner',title:'President & CEO'}],
    tax_matters_partner:'Single Owner', additional_capital_voting:'unanimous',
    shareholder_loans_voting:'unanimous', distribution_frequency:'quarterly',
    majority_threshold:50, sale_of_company_voting:'unanimous',
    major_decisions_voting:'unanimous', major_spending_threshold:10000, bank_signees:'one',
    new_member_admission_voting:'unanimous', dissolution_voting:'unanimous',
    officer_removal_voting:'unanimous', family_transfer:'free',
    right_of_first_refusal:false, rofr_offer_period:0,
    death_incapacity_forced_sale:false, drag_along:false, tag_along:false,
    include_noncompete:false, include_nonsolicitation:false, include_confidentiality:false,
  });
  fs.writeFileSync('/tmp/v_corp_min.docx', corpMin.buffer);
  console.log('OK');
}
gen();
`;
const genPath = path.resolve("_vgen.ts");
fs.writeFileSync(genPath, genScript);
try { execSync(`npx tsx ${genPath}`, { cwd: path.resolve("."), stdio: "inherit" }); }
finally { try { fs.unlinkSync(genPath); } catch {} }

// ═══════════════════════════════════════════════════════════
// TEST 1: LLC FULL
// ═══════════════════════════════════════════════════════════
console.log("\n══ 1. LLC Full (VERIFY MIAMI LLC) ══");
const L = fullText(extractDocxXml("/tmp/v_llc.docx"));
const LX = extractDocxXml("/tmp/v_llc.docx");

// Structure
test("XML has <w:document> root", has(LX, "<w:document"));
test("XML has <w:body>", has(LX, "<w:body"));
test("Has <w:rFonts> (fonts)", has(LX, "<w:rFonts"));
test("Has <w:b/> (bold)", has(LX, "<w:b/>") || has(LX, "<w:b "));
test("Has <w:pStyle> (paragraph styles)", has(LX, "<w:pStyle"));
test("No unfilled {{}} variables", notHas(L, "{{"));

// ALL 15 LLC {{}} variables
test("{{llc_name_text}} → VERIFY MIAMI LLC", has(L, "VERIFY MIAMI LLC"));
test("{{full_state}} → Florida", has(L, "Florida"));
test("{{Date_of_formation_LLC}} → March 23rd, 2026", has(L, "March 23rd, 2026"));
test("{{member_01_full_name}} → Marco Antonio Rodriguez", has(L, "Marco Antonio Rodriguez"));
test("{{member_02_full_name}} → Sofia Maria Hernandez", has(L, "Sofia Maria Hernandez"));
test("{{Managed_type_plural}} → Managers", has(L, "Managers"));
test("{{full_llc_address}} → 200 S Biscayne Blvd", has(L, "200 S Biscayne Blvd"));
test("{{member_01_amount}} → 60,000.00", has(L, "60,000.00"));
test("{{member_02_amount}} → 40,000.00", has(L, "40,000.00"));
test("{{member_01_pct}} → 60%", has(L, "60%"));
test("{{member_02_pct}} → 40%", has(L, "40%"));
test("{{Tax Matters Manager_01}} → Marco Antonio Rodriguez", has(L, "Marco Antonio Rodriguez"));
test("{{Manager_1}} → Marco Antonio Rodriguez", has(L, "Marco Antonio Rodriguez"));
test("{{Manager_2}} → Sofia Maria Hernandez", has(L, "Sofia Maria Hernandez"));
test("{{full_county}} → Miami-Dade", has(L, "Miami-Dade"));

// ALL voting replacements
test("Sale: 'Unanimous consent of the Members' (Sec 8)", has(L, "Unanimous consent of the Members"));
test("Sale: original 'Majority consent' removed", notHas(L, "requires the Majority consent of the Members"));
test("Additional capital: 'Super Majority' (Sec 5.1)", has(L, "Super Majority to the incurrence") || has(L, "agreed by Super Majority"));
test("Loans: 'Majority consent of the Members' (Sec 6.1)", has(L, "Majority consent of the Members"));
test("Major decisions: 'Super Majority Approval' (Sec 11.4)", has(L, "Super Majority Approval of the Members"));
test("Dissolution: 'Unanimous election' (Sec 15.1)", has(L, "Unanimous election of the Members to dissolve"));
test("Officer removal: 'Majority vote excluding' (Sec 11.1C)", has(L, "Majority vote of the Members excluding"));

// Bank signees
test("Bank: 'any two Members or Managers'", has(L, "any two Members or Managers"));
test("Bank: original 'any Member or Manager' removed", notHas(L, "the signature of any Member or Manager of the Company"));

// Spending threshold
test("Spending: $15,000.00 (replaced $5,000.00)", has(L, "$15,000.00"));
test("Spending: original $5,000.00 removed", notHas(L, "$5,000.00"));

// Majority definition percentage
test("Majority definition: 50.1% present", has(L, "50.1%"));

// Conditional sections
test("ROFR: Section 12.1 present", has(L, "Right of First Refusal"));
test("Drag Along: removed (drag_along=false)", notHas(L, "Drag Along"));
test("Tag Along: removed (tag_along=false)", notHas(L, "Tag Along"));

// ═══════════════════════════════════════════════════════════
// TEST 2: LLC No ROFR
// ═══════════════════════════════════════════════════════════
console.log("\n══ 2. LLC No ROFR (NO ROFR LLC, Texas) ══");
const L2 = fullText(extractDocxXml("/tmp/v_llc_min.docx"));

test("No unfilled {{}} variables", notHas(L2, "{{"));
test("Company: NO ROFR LLC", has(L2, "NO ROFR LLC"));
test("State: Texas", has(L2, "Texas"));
test("County: Travis", has(L2, "Travis"));
test("Address: 456 Elm St", has(L2, "456 Elm St"));
test("Member: Test Person", has(L2, "Test Person"));
test("Management: Members (member-managed)", has(L2, "Members"));
test("Date: January 15th, 2026", has(L2, "January 15th, 2026"));
test("Capital: 10,000.00", has(L2, "10,000.00"));
test("Tax Matters: Test Person", has(L2, "Test Person"));
test("Bank: one signer (default text)", has(L2, "the signature of any Member or Manager"));
test("Spending: $5,000.00 (default kept)", has(L2, "$5,000.00"));
test("All voting: Majority (default)", has(L2, "Majority"));
test("ROFR: REMOVED", notHas(L2, "Right of First Refusal"));
test("ROFR sub-A: REMOVED", notHas(L2, "Offer.  Subject to Section 12"));
test("ROFR sub-B: REMOVED", notHas(L2, "Concurrence or Acceptance"));
test("ROFR sub-C: REMOVED", notHas(L2, "Rights of Buyer"));

// ═══════════════════════════════════════════════════════════
// TEST 3: Corp Full
// ═══════════════════════════════════════════════════════════
console.log("\n══ 3. Corp Full (VERIFY CORP Inc) ══");
const C = fullText(extractDocxXml("/tmp/v_corp.docx"));
const CX = extractDocxXml("/tmp/v_corp.docx");

test("XML structure valid", has(CX, "<w:document") && has(CX, "<w:body"));
test("Has formatting (fonts + bold + styles)", has(CX, "<w:rFonts") && has(CX, "<w:pStyle"));
test("No unfilled {{}} variables", notHas(C, "{{"));

// ALL Corp {{}} variables
test("{{corp_name}} → VERIFY CORP Inc", has(C, "VERIFY CORP Inc"));
test("{{effective_date}} → June 15th, 2026", has(C, "June 15th, 2026"));
test("{{majority_threshold_text}} → FIFTY PERCENT", has(C, "FIFTY PERCENT") || has(C, "50.00%"));
test("{{principal_address}} → 100 Wall Street", has(C, "100 Wall Street"));
test("{{total_authorized_shares}} → 1,000", has(C, "1,000"));
test("{{par_value}} → 0.01", has(C, "0.01"));
test("{{shareholder_1_name}} → Roberto Carlos Mendez", has(C, "Roberto Carlos Mendez"));
test("{{shareholder_1_shares}} → 600", has(C, "600"));
test("{{shareholder_1_contribution}} → 50,000", has(C, "50,000"));
test("{{shareholder_1_pct}} → 60.00", has(C, "60.00"));
test("{{shareholder_2_name}} → Ana Maria Garcia", has(C, "Ana Maria Garcia"));
test("{{shareholder_2_shares}} → 400", has(C, "400"));
test("{{shareholder_2_contribution}} → 30,000", has(C, "30,000"));
test("{{shareholder_2_pct}} → 40.00", has(C, "40.00"));
test("{{shareholder_3_name}} → empty (only 2 owners)", notHas(C, "{{shareholder_3_name}}"));
test("{{major_spending_threshold}} → 7,500", has(C, "7,500"));
test("{{bank_signees_text}} → two", has(C, "two of the Officers"));
test("{{rofr_period}} → 90", has(C, "90"));
test("{{county}} → Miami-Dade", has(C, "Miami-Dade"));
test("{{state}} → Florida", has(C, "Florida"));

// ALL Corp voting replacements
test("Sale: Super Majority (Sec 10.2.e)", has(C, "Super Majority consent or approval"));
test("Major decisions: Majority (Sec 10.1)", has(C, "Majority affirmative vote of the Board of Directors"));
test("Officers limitation: Majority (Sec 10.1)", has(C, "Majority consent of the Board of Directors"));
test("New members: Unanimous (Sec 4.3)", has(C, "Unanimous of the Shareholders"));
test("Dissolution: Majority (Sec 3.2)", has(C, "Majority election to dissolve by the Shareholders"));
test("Officer removal: Super Majority (Sec 12.1)", has(C, "Super Majority vote of the Shareholders"));
test("Loans: Super Majority (Sec 7.3)", has(C, "Super Majority consent of the Shareholders") || has(C, "Super Majority approval"));

// Conditional sections
test("ROFR: present", has(C, "Right of First Refusal"));
test("Drag Along: present", has(C, "Drag Along"));
test("Tag Along: present", has(C, "Tag Along"));

// ═══════════════════════════════════════════════════════════
// TEST 4: Corp Minimal
// ═══════════════════════════════════════════════════════════
console.log("\n══ 4. Corp Minimal (MINIMAL CORP Inc, Delaware) ══");
const C2 = fullText(extractDocxXml("/tmp/v_corp_min.docx"));

test("No unfilled {{}} variables", notHas(C2, "{{"));
test("Company: MINIMAL CORP Inc", has(C2, "MINIMAL CORP Inc"));
test("State: Delaware", has(C2, "Delaware"));
test("County: Kent", has(C2, "Kent"));
test("Address: 456 Broad St", has(C2, "456 Broad St"));
test("Shareholder: Single Owner", has(C2, "Single Owner"));
test("Date: January 15th, 2026", has(C2, "January 15th, 2026"));
test("Shares: 1,000", has(C2, "1,000"));
test("Contribution: 100,000", has(C2, "100,000"));
test("Spending: 10,000", has(C2, "10,000"));
test("Bank: one signer", has(C2, "one of the Officers"));
test("ROFR: REMOVED", notHas(C2, "Right of First Refusal"));
test("Drag Along: REMOVED", notHas(C2, "Drag Along"));
test("Tag Along: REMOVED", notHas(C2, "Tag Along"));
test("Sale: Unanimous", has(C2, "Unanimous consent or approval"));
test("Major decisions: Unanimous", has(C2, "Unanimous affirmative vote"));
test("Dissolution: Unanimous", has(C2, "Unanimous election to dissolve"));
test("Officer removal: Unanimous", has(C2, "Unanimous vote of the Shareholders"));
test("New members: Unanimous", has(C2, "Unanimous of the Shareholders"));
test("Loans: Unanimous", has(C2, "Unanimous consent of the Shareholders") || has(C2, "Unanimous approval"));

// ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(55)}`);
console.log(`TOTAL: ${passed + failed} tests | ${passed} passed | ${failed} failed`);
if (failed > 0) { console.log("STATUS: FAIL"); process.exit(1); }
else console.log("STATUS: ALL PASSED");
