/**
 * Prod verification: POST form data with Step-6 responsibilities enabled
 * to /api/agreement/generate on the deployed app. Download the resulting
 * DOCX and confirm the new Specific Responsibilities section renders.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';

const BASE_URL = process.env.BASE_URL || 'https://company-formation-questionnaire.vercel.app';
const HOME = process.env.USERPROFILE || '.';

async function run(entityType, suffix, { includeResp }, label) {
  const formData = {
    ownersCount: 2,
    company: {
      entityType,
      companyNameBase: 'RESP VERIFY',
      entitySuffix: suffix,
      formationState: 'Florida',
      hasUsaAddress: 'No',
      numberOfShares: 5000,
      businessPurpose: 'Testing responsibilities section',
    },
    owners: [
      { firstName: 'Alice', lastName: 'Founder', ownership: 60 },
      { firstName: 'Bob', lastName: 'CoFounder', ownership: 40 },
    ],
    admin: {
      directorsCount: 2, directorsAllOwners: 'Yes',
      managersCount: 2, managersAllOwners: 'Yes',
      officersCount: 2, officersAllOwners: 'Yes',
    },
    agreement: {
      majorityThreshold: 50.01,
      supermajorityThreshold: 75,
      corp_capitalPerOwner_0: '60000',
      corp_capitalPerOwner_1: '40000',
      llc_capitalContributions_0: '60000',
      llc_capitalContributions_1: '40000',
      distributionFrequency: 'Trimestral',
      // ------- THE FEATURE UNDER TEST -------
      corp_hasSpecificResponsibilities: includeResp ? 'Yes' : 'No',
      corp_specificResponsibilities_0: includeResp ? 'Chief Executive Officer' : '',
      corp_responsibilityDesc_0: includeResp ? 'Overall strategy, fundraising, and external partnerships.' : '',
      corp_specificResponsibilities_1: includeResp ? 'Chief Technology Officer' : '',
      corp_responsibilityDesc_1: includeResp ? 'Product engineering, hiring, and tech operations.' : '',
      llc_hasSpecificRoles: includeResp ? 'Yes' : 'No',
      llc_specificRoles_0: includeResp ? 'Managing Member' : '',
      llc_roleDesc_0: includeResp ? 'Day-to-day operations and client relations.' : '',
      llc_specificRoles_1: includeResp ? 'Finance Lead' : '',
      llc_roleDesc_1: includeResp ? 'Books, tax compliance, and vendor management.' : '',
      // ----- standard boilerplate -----
      corp_moreCapitalDecision: 'Mayoría',
      corp_shareholderLoansVoting: 'Mayoría',
      corp_saleDecisionThreshold: 'Supermayoría',
      corp_majorDecisionThreshold: 'Mayoría',
      corp_majorSpendingThreshold: '5000',
      corp_bankSigners: 'Dos firmantes',
      corp_newShareholdersAdmission: 'Supermayoría',
      corp_officerRemovalVoting: 'Supermayoría',
      corp_transferToRelatives: 'unanime',
      corp_rofr: 'No',
      corp_incapacityHeirsPolicy: 'No',
      corp_tagDragRights: 'No',
      corp_nonCompete: 'No',
      corp_nonSolicitation: 'Yes',
      corp_confidentiality: 'Yes',
      llc_additionalContributionsDecision: 'Mayoría',
      llc_memberLoansVoting: 'Mayoría',
      llc_companySaleDecision: 'Supermayoría',
      llc_majorDecisions: 'Mayoría',
      llc_majorSpendingThreshold: '10000',
      llc_bankSigners: 'Dos firmantes',
      llc_newMembersAdmission: 'Supermayoría',
      llc_dissolutionDecision: 'Unánime',
      llc_officerRemovalVoting: 'Supermayoría',
      llc_transferToRelatives: 'libremente',
      llc_rofr: 'No',
      llc_incapacityHeirsPolicy: 'No',
      llc_tagDragRights: 'No',
      llc_nonCompete: 'No',
      llc_nonSolicitation: 'Yes',
      llc_confidentiality: 'Yes',
      llc_minTaxDistribution: 30,
      llc_managingMembers: 'Yes',
    },
  };

  const res = await fetch(`${BASE_URL}/api/agreement/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, draftId: 'verify-resp-' + Date.now() }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = join(HOME, 'Downloads', `PROD_RESP_${entityType}_${includeResp ? 'on' : 'off'}.docx`);
  writeFileSync(out, buf);

  const zip = new PizZip(readFileSync(out));
  const doc = zip.file('word/document.xml')?.asText() || '';
  const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');

  const expectedHeading = entityType === 'C-Corp'
    ? 'Specific Responsibilities of Shareholders.'
    : 'Specific Responsibilities of Members.';
  const hasHeading = texts.includes(expectedHeading);
  const hasAliceTitle = includeResp && texts.includes('Alice Founder, as');
  const hasBobTitle = includeResp && texts.includes('Bob CoFounder, as');
  const hasAliceDesc = includeResp && texts.includes('Overall strategy');

  console.log(`\n=== ${label} ===`);
  console.log(`  file: ${out}`);
  console.log(`  size: ${buf.length} bytes`);
  if (includeResp) {
    console.log(`  ${hasHeading ? 'PASS' : 'FAIL'} "${expectedHeading}" present`);
    console.log(`  ${hasAliceTitle ? 'PASS' : 'FAIL'} Alice title present`);
    console.log(`  ${hasBobTitle ? 'PASS' : 'FAIL'} Bob title present`);
    console.log(`  ${entityType === 'C-Corp' && hasAliceDesc ? 'PASS' : entityType === 'LLC' ? '(skip)' : 'FAIL'} Alice description present`);
    return hasHeading && hasAliceTitle && hasBobTitle;
  } else {
    console.log(`  ${!hasHeading ? 'PASS' : 'FAIL'} heading correctly absent (no-op guard)`);
    return !hasHeading;
  }
}

async function main() {
  const r1 = await run('C-Corp', 'Corp', { includeResp: true }, 'Corp WITH responsibilities');
  const r2 = await run('LLC', 'LLC', { includeResp: true }, 'LLC WITH responsibilities');
  const r3 = await run('C-Corp', 'Corp', { includeResp: false }, 'Corp WITHOUT responsibilities (guard)');
  const ok = r1 && r2 && r3;
  console.log(`\n${ok ? 'ALL PASS' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
