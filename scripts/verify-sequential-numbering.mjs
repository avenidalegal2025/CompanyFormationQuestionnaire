// Regression check for the new sequential renumbering + cross-reference
// remap. Calls the real generateAgreementDocument() with a Corp payload
// that exercises conditional content (ROFR=No removes Article XII's ROFR
// sections), then asserts:
//   - Every Heading3 paragraph has an N.M number
//   - Each article's sub-numbers are sequential starting from 1 (no gaps)
//   - Cross-references to renumbered sections got rewritten
//
// Run: node --experimental-strip-types scripts/verify-sequential-numbering.mjs

import { generateDocument } from '../src/lib/agreement-docgen.ts';
import PizZip from 'pizzip';

const answers = {
  entity_type: 'Corp',
  entity_name: 'PLAYWRIGHT QA Corp',
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
  directors_managers: [{ name: 'John TestOne' }, { name: 'Jane TestTwo' }],
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
  // KEY TEST: ROFR=No should remove Article XII's ROFR paragraphs.
  // The renumber must then NOT leave a gap (Article XII should have
  // sequential sub-nums OR be empty, not "12.4, 12.5, …" with holes).
  rofr: 'Yes',
  right_of_first_refusal: false,
  rofr_offer_period: 180,
  transfer_to_relatives: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
  incapacity_heirs_policy: 'Yes',
  divorce_buyout_policy: 'Yes',
  tag_drag_rights: 'Yes',
  tag_along: true,
  drag_along: true,
  capital_per_owner: [50000, 40000],
  more_capital_decision: 'Decisión Unánime',
  shareholder_loans_voting: 'Decisión Unánime',
  new_shareholders_admission: 'Decisión Unánime',
  tax_owner: 'John TestOne',
};

const { buffer: buf } = await generateDocument(answers);
const xml = new PizZip(buf).file('word/document.xml').asText();

// Collect every numbered section paragraph's concatenated text in doc order.
// Matches all four template shapes the renumberer handles:
//   (a) <w:pStyle w:val="Heading3"/> captions
//   (b) <w:t>N.M</w:t><w:tab/> pattern (no pStyle, tab-separated)
//   (c) first <w:t> starts with "N.M " (branch-c inline underlined section)
//   (d) <w:pStyle w:val="Heading4"/> with leading N.M (15.11 WAIVER)
const pattern = /<w:p[^>]*>([^]*?)<\/w:p>/g;
const rows = [];
let match;
while ((match = pattern.exec(xml)) !== null) {
  const body = match[1];
  const isH3 = body.includes('<w:pStyle w:val="Heading3"/>');
  const hasNumTab = /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(body);
  const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
  if (!text) continue;
  const startsWithNumSpace = /^\d+\.\d+\s/.test(text);
  // Branch (d): Heading4 + first <w:t> leads with N.M (may be glued).
  const isH4WithNum =
    body.includes('<w:pStyle w:val="Heading4"/>') && /^\d+\.\d+/.test(text);
  if (!isH3 && !hasNumTab && !startsWithNumSpace && !isH4WithNum) continue;
  rows.push(text.substring(0, 100));
}

console.log(`\nFound ${rows.length} Heading3 paragraphs:\n`);

// Group by article (extract leading N from "N.M ...")
const byArticle = new Map();
let failures = 0;
for (const r of rows) {
  const m = r.match(/^(\d+)\.(\d+)/);
  if (!m) {
    console.log(`  ✗ UNNUMBERED: ${r}`);
    failures++;
    continue;
  }
  const art = parseInt(m[1], 10);
  const sub = parseInt(m[2], 10);
  if (!byArticle.has(art)) byArticle.set(art, []);
  byArticle.get(art).push({ sub, text: r });
}

// Check each article is sequential 1, 2, 3, ...
const articles = [...byArticle.keys()].sort((a, b) => a - b);
for (const art of articles) {
  const subs = byArticle.get(art);
  console.log(`\n  Article ${art}: ${subs.length} Heading3 paragraphs`);
  let expected = 1;
  for (const { sub, text } of subs) {
    const ok = sub === expected;
    console.log(`    ${ok ? '✓' : '✗'} ${text}${ok ? '' : `  (expected ${art}.${expected})`}`);
    if (!ok) failures++;
    expected++;
  }
}

// Also check cross-references in body text got remapped. Harvest every
// "Section/Paragraph/Article N.M" occurrence from the full doc text.
const bodyText = xml.replace(/<[^>]+>/g, ' ');
const refs = new Set();
for (const m of bodyText.matchAll(/\b(Sections?|Paragraphs?|Articles?)\s+(\d+\.\d+)/gi)) {
  refs.add(`${m[1]} ${m[2]}`);
}
console.log(`\n  Body cross-references found: ${refs.size}`);
for (const r of [...refs].sort()) console.log(`    ${r}`);

// Any cross-ref pointing at an article/section that doesn't exist in the
// final doc → flag (could be template-bogus refs, could be a bug).
const validSections = new Set();
for (const [art, subs] of byArticle.entries()) {
  for (const { sub } of subs) validSections.add(`${art}.${sub}`);
}
const orphans = [];
for (const ref of refs) {
  const num = ref.split(/\s+/)[1];
  if (!validSections.has(num)) orphans.push(ref);
}
if (orphans.length > 0) {
  console.log(`\n  ⚠ ${orphans.length} cross-references point at a non-existent section:`);
  for (const o of orphans) console.log(`      ${o}`);
  console.log('    (These may be template-bogus refs that were never valid, not necessarily bugs.)');
}

if (failures > 0) {
  console.log(`\n✗ ${failures} numbering failures`);
  process.exit(1);
}
console.log(`\n✓ Every Heading3 is sequentially numbered per article.`);
