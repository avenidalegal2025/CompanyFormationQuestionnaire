/**
 * Fast production verification: POST form data with hasUsaAddress="No"
 * to /api/agreement/generate on the deployed app, capture the DOCX,
 * verify county + font. Much faster than re-running the full Playwright
 * flow since it bypasses Stripe.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';

const BASE_URL = process.env.BASE_URL || 'https://company-formation-questionnaire.vercel.app';
const HOME = process.env.USERPROFILE || '.';
const OUT = join(HOME, 'Downloads', 'PROD_verify_noaddr.docx');

const formData = {
  ownersCount: 2,
  company: {
    entityType: 'C-Corp',
    companyNameBase: 'PLAYWRIGHT QA',
    entitySuffix: 'Corp',
    formationState: 'Florida',
    hasUsaAddress: 'No',      // ← the scenario that was failing before
    numberOfShares: 5000,
    businessPurpose: 'Testing',
  },
  owners: [
    { firstName: 'John', lastName: 'TestOne', ownership: 55 },
    { firstName: 'Jane', lastName: 'TestTwo', ownership: 45 },
  ],
  admin: {
    directorsCount: 2,
    directorsAllOwners: 'Yes',
    officersCount: 2,
    officersAllOwners: 'Yes',
  },
  agreement: {
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,
    corp_capitalPerOwner_0: '55000',
    corp_capitalPerOwner_1: '45000',
    corp_moreCapitalDecision: 'Mayoría',
    corp_shareholderLoansVoting: 'Mayoría',
    distributionFrequency: 'Trimestral',
    corp_saleDecisionThreshold: 'Supermayoría',
    corp_majorDecisionThreshold: 'Mayoría',
    corp_majorSpendingThreshold: '5000',
    corp_bankSigners: 'Dos firmantes',
    corp_newShareholdersAdmission: 'Supermayoría',
    corp_officerRemovalVoting: 'Supermayoría',
    corp_transferToRelatives: 'únanime',
    corp_rofr: 'Yes',
    corp_rofrOfferPeriod: 180,
    corp_incapacityHeirsPolicy: 'Yes',
    corp_tagDragRights: 'Yes',
    corp_nonCompete: 'No',
    corp_nonSolicitation: 'Yes',
    corp_confidentiality: 'Yes',
  },
};

console.log(`POST ${BASE_URL}/api/agreement/generate ...`);
const res = await fetch(`${BASE_URL}/api/agreement/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ formData, draftId: 'verify-noaddr-' + Date.now() }),
});
console.log(`HTTP ${res.status} ${res.statusText}`);
if (!res.ok) {
  const body = await res.text();
  console.error(body);
  process.exit(2);
}
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(OUT, buf);
console.log(`Saved ${buf.length} bytes → ${OUT}`);

// Inspect
const zip = new PizZip(readFileSync(OUT));
const styles = zip.file('word/styles.xml')?.asText() || '';
const theme = zip.file('word/theme/theme1.xml')?.asText() || '';
const doc = zip.file('word/document.xml')?.asText() || '';

const fontCounts = {
  stylesArial: (styles.match(/Arial/g) || []).length,
  themeArial: (theme.match(/Arial/g) || []).length,
  docArial: (doc.match(/Arial/g) || []).length,
  docTNR: (doc.match(/Times New Roman/g) || []).length,
};
console.log('\n=== FONT AUDIT ===');
for (const [k, v] of Object.entries(fontCounts)) console.log(`  ${k}: ${v}`);

const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
  .map(t => t.replace(/<[^>]+>/g, '')).join('');

// Truly-bare: the word immediately before "County" is a lowercase preposition
// like "in", "at", "to", "held", "residing" — not a proper noun.
const bareCounty = [
  ...texts.matchAll(/\bin\s+County,\s*Florida/g),
  ...texts.matchAll(/\bat\s+County,\s*Florida/g),
  ...texts.matchAll(/\bto\s+County,\s*Florida/g),
  ...texts.matchAll(/\bheld\s+in\s+County,\s*Florida/g),
  ...texts.matchAll(/\bresiding\s+in\s+County,\s*Florida/g),
];
const miamiDadeMentions = [...texts.matchAll(/Miami-Dade\s+County/gi)];
// Also look for the principal place of business sentence
const principalPlace = texts.match(/principal place of business[^.]*\./i)?.[0] || 'NOT FOUND';

console.log('\n=== COUNTY AUDIT ===');
console.log(`  Bare "County, Florida" (should be 0): ${bareCounty.length}`);
console.log(`  "Miami-Dade County" mentions (should be >0): ${miamiDadeMentions.length}`);
console.log(`  Principal-place sentence: "${principalPlace.substring(0, 200)}"`);

const hasThArtifact = /33181th|Florida\s+33181\s*th\b/i.test(texts) || /\bth\s+or\s+such\s+other\s+place\b/i.test(texts);

console.log(`  'th' artifact in principal-place sentence: ${hasThArtifact}  ${hasThArtifact ? '✗ FAIL' : '✓ PASS'}`);

const pass =
  fontCounts.stylesArial === 0 &&
  fontCounts.themeArial === 0 &&
  fontCounts.docArial === 0 &&
  bareCounty.length === 0 &&
  miamiDadeMentions.length > 0 &&
  !hasThArtifact;

console.log(`\n=== VERDICT: ${pass ? 'PASS' : 'FAIL'} ===`);
process.exit(pass ? 0 : 1);
