import { generateDocument } from '../src/lib/agreement-docgen.js';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

const answers: any = {
  entity_type: 'LLC',
  entity_name: 'FORMAT TEST LLC',
  state_of_formation: 'Florida',
  date_of_formation: '2026-04-08T00:00:00Z',
  principal_address: '100 Test St, Miami, FL 33131',
  county: 'Miami-Dade',
  owners_list: [
    { full_name: 'Owner One', shares_or_percentage: 40, capital_contribution: 40000 },
    { full_name: 'Owner Two', shares_or_percentage: 35, capital_contribution: 35000 },
    { full_name: 'Owner Three', shares_or_percentage: 25, capital_contribution: 25000 },
  ],
  management_type: 'manager',
  directors_managers: [{ name: 'Owner One' }, { name: 'Owner Two' }, { name: 'Owner Three' }],
  officers: [],
  tax_matters_partner: 'Owner One',
  additional_capital_voting: 'majority',
  shareholder_loans_voting: 'majority',
  distribution_frequency: 'quarterly',
  min_tax_distribution: 30,
  majority_threshold: 50.01,
  supermajority_threshold: 75,
  sale_of_company_voting: 'unanimous',
  major_decisions_voting: 'majority',
  major_spending_threshold: 10000,
  bank_signees: 'one',
  new_member_admission_voting: 'supermajority',
  dissolution_voting: 'unanimous',
  officer_removal_voting: 'majority',
  family_transfer: 'free',
  right_of_first_refusal: true,
  rofr_offer_period: 180,
  death_incapacity_forced_sale: false,
  drag_along: false,
  tag_along: false,
  include_noncompete: true,
  noncompete_duration: 3,
  noncompete_scope: 'Miami-Dade County, Florida',
  include_nonsolicitation: true,
  include_confidentiality: true,
};

async function main() {
let result: any;
try {
  result = await generateDocument(answers);
} catch (e: any) {
  console.error('generateDocument threw:', e.message);
  console.error(e.stack);
  process.exit(1);
}
console.log('Result keys:', Object.keys(result));
console.log('Buffer type:', typeof result.buffer, result.buffer?.constructor?.name);
const buf = result.buffer;
if (!buf) { console.error('ERROR: buffer is undefined'); process.exit(1); }
const home = process.env.USERPROFILE || '.';
fs.writeFileSync(path.join(home, 'Downloads', 'format_test.docx'), buf);
console.log('Generated:', buf.length, 'bytes');

const zip = new PizZip(buf);
const xml = zip.file('word/document.xml')!.asText();

function checkParagraphFormatting(label: string, searchText: string) {
  const idx = xml.indexOf(searchText);
  if (idx < 0) { console.log(`${label}: TEXT NOT FOUND`); return; }
  const pStart = xml.lastIndexOf('<w:p', idx);
  const snippet = xml.substring(pStart, pStart + 400);
  const hasPPr = snippet.includes('<w:pPr');
  const hasSz = snippet.includes('<w:sz');
  const hasJc = snippet.includes('<w:jc');
  const hasInd = snippet.includes('<w:ind');
  const pass = hasPPr && hasSz;
  console.log(`${label}: ${pass ? 'PASS' : 'FAIL'} (pPr:${hasPPr} sz:${hasSz} jc:${hasJc} ind:${hasInd})`);
}

console.log('\n=== FORMATTING CHECKS ===');
checkParagraphFormatting('Non-compete clause', 'Non-competition');
checkParagraphFormatting('Owner Three capital', 'Owner Three');
checkParagraphFormatting('Super Majority def', 'Super Majority');
checkParagraphFormatting('Normal template text', 'Intellectual Property');

const texts = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
const ft = texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join('');
console.log('\n=== CONTENT CHECKS ===');
console.log('Miami-Dade scope:', ft.includes('Miami-Dade County, Florida') ? 'PASS' : 'FAIL');
console.log('THREE (3) years:', ft.includes('THREE (3)') ? 'PASS' : 'FAIL');
console.log('Owner Three in doc:', ft.includes('Owner Three') ? 'PASS' : 'FAIL');
console.log('SEVENTY-FIVE PERCENT:', ft.includes('SEVENTY-FIVE PERCENT') ? 'PASS' : 'FAIL');
}
main().catch(e => { console.error(e); process.exit(1); });
