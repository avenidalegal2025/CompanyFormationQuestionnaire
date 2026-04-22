// Regression check for the new prefixAllArticleSubsections pass. Calls
// the real generateAgreementDocument() with a minimal Corp payload, then
// lists every Heading3 paragraph's first text — confirms every unnumbered
// caption (Commencement, Dissolution, Authorized Shares, Records, etc.)
// has been prefixed with its N.M section number.

import { generateDocument } from '../src/lib/agreement-docgen.ts';
import PizZip from 'pizzip';

const answers = {
  entity_type: 'Corp',
  corp_name: 'PLAYWRIGHT QA Corp',
  entity_suffix: 'Corp',
  state: 'Florida',
  principal_address: '12550 Biscayne Blvd Ste 110, North Miami, FL 33181',
  formation_date: '2026-04-22',
  total_authorized_shares: 5000,
  majority_threshold: 50.01,
  supermajority_threshold: 75,
  owners_list: [
    { full_name: 'John TestOne', first_name: 'John', last_name: 'TestOne',
      percentage: 55, title: 'Chief Executive Officer',
      responsibilities: 'Overall strategy.', capital_contribution: 50000 },
    { full_name: 'Jane TestTwo', first_name: 'Jane', last_name: 'TestTwo',
      percentage: 45, title: 'Chief Technology Officer',
      responsibilities: 'Product engineering.', capital_contribution: 40000 },
  ],
  directors_managers: [
    { name: 'John TestOne' }, { name: 'Jane TestTwo' },
  ],
  officers: [
    { name: 'John TestOne', title: 'President' },
    { name: 'Jane TestTwo', title: 'Vice-President' },
  ],
  distribution_frequency: 'Trimestral',
  sale_decision_threshold: 'Supermayoría',
  bank_signers: 'Dos firmantes',
  major_decision_threshold: 'Mayoría',
  major_spending_threshold: 25000,
  officer_removal_voting: 'Mayoría',
  non_compete: 'No',
  non_solicitation: 'Yes',
  confidentiality: 'Yes',
  rofr: 'Yes',
  rofr_offer_period: 180,
  transfer_to_relatives: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
  incapacity_heirs_policy: 'Yes',
  divorce_buyout_policy: 'Yes',
  tag_drag_rights: 'Yes',
  capital_per_owner: [50000, 40000],
  more_capital_decision: 'Decisión Unánime',
  shareholder_loans_voting: 'Decisión Unánime',
  new_shareholders_admission: 'Decisión Unánime',
  major_decision_threshold_extra: 'Decisión Unánime',
  tax_owner: 'John TestOne',
};

const buf = await generateDocument(answers);
const xml = new PizZip(buf).file('word/document.xml').asText();

// List every Heading3 paragraph's first <w:t>.
const pattern = /<w:p[^>]*>([^]*?)<\/w:p>/g;
let match;
const rows = [];
while ((match = pattern.exec(xml)) !== null) {
  const body = match[1];
  if (!body.includes('<w:pStyle w:val="Heading3"/>')) continue;
  const firstT = body.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
  if (!firstT) continue;
  const rest = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim().substring(0, 100);
  rows.push(rest);
}
console.log(`\nFound ${rows.length} Heading3 paragraphs:\n`);
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const hasNum = /^\d+\.\d+/.test(row);
  const marker = hasNum ? '✓' : '✗ MISSING';
  console.log(`  ${marker}  ${row}`);
}

const missing = rows.filter((r) => !/^\d+\.\d+/.test(r) && !/^ARTICLE/.test(r));
if (missing.length > 0) {
  console.log(`\n✗ ${missing.length} Heading3 paragraphs still unnumbered:`);
  missing.forEach((m) => console.log('   ', m));
  process.exit(1);
}
console.log(`\n✓ Every Heading3 paragraph has a section number.`);
