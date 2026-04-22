// After pushing the prefixAllArticleSubsections fix, poll the deployed
// /api/agreement/generate until it produces a DOCX whose Heading3 captions
// all have "N.M" prefixes — then save the DOCX and print a presigned URL
// so the user can open it in Word Online.

import PizZip from 'pizzip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://company-formation-questionnaire.vercel.app';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'numbering-fix-verify');
mkdirSync(OUT, { recursive: true });

const formData = {
  company: {
    entityType: 'C-Corp', entitySuffix: 'Corp',
    companyNameBase: 'PLAYWRIGHT NUMFIX Corp', formationState: 'Florida',
    addressLine1: '200 S Biscayne Blvd', city: 'Miami', state: 'FL',
    postalCode: '33131', hasUsaAddress: 'Yes',
    numberOfShares: 5000,
  },
  owners: [
    { firstName: 'John', lastName: 'TestOne', ownership: 55, fullName: 'John TestOne' },
    { firstName: 'Jane', lastName: 'TestTwo', ownership: 45, fullName: 'Jane TestTwo' },
  ],
  ownersCount: 2,
  admin: {
    directorsAllOwners: 'Yes', directorsCount: 2,
    officersAllOwners: 'Yes', officersCount: 2,
    officer1Name: 'John TestOne', officer1Role: 'President',
    officer2Name: 'Jane TestTwo', officer2Role: 'Vice-President',
  },
  agreement: {
    corp_capitalPerOwner_0: 50000,
    corp_capitalPerOwner_1: 40000,
    majorityThreshold: 50.01, supermajorityThreshold: 75,
    // Enable the per-owner responsibilities feature — without this toggle
    // the mapper correctly skips title/responsibilities (prevents stale
    // drafts from leaking into the doc). Real UI sets this via Step 6
    // SegmentedToggle.
    corp_hasSpecificResponsibilities: 'Yes',
    corp_specificResponsibilities_0: 'Chief Executive Officer',
    corp_responsibilityDesc_0: 'Overall strategy, fundraising, and external partnerships.',
    corp_specificResponsibilities_1: 'Chief Technology Officer',
    corp_responsibilityDesc_1: 'Product engineering, hiring, and tech operations.',
    corp_moreCapitalDecision: 'Decisión Unánime',
    corp_shareholderLoansVoting: 'Decisión Unánime',
    corp_saleDecisionThreshold: 'Supermayoría',
    corp_majorDecisionThreshold: 'Mayoría',
    corp_newShareholdersAdmission: 'Decisión Unánime',
    corp_officerRemovalVoting: 'Mayoría',
    corp_majorSpendingThreshold: 25000,
    corp_bankSigners: 'Dos firmantes',
    corp_taxOwner: 'John TestOne',
    corp_transferToRelatives: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
    corp_rofr: 'Yes', corp_rofrOfferPeriod: 180,
    corp_incapacityHeirsPolicy: 'Yes', corp_tagDragRights: 'Yes',
    corp_nonCompete: 'No', corp_nonSolicitation: 'Yes', corp_confidentiality: 'Yes',
    distributionFrequency: 'Trimestral',
  },
};

async function tryOnce() {
  const r = await fetch(`${BASE}/api/agreement/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData, draftId: `numfix-${Date.now()}` }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

function analyzeHeadings(buf) {
  const xml = new PizZip(buf).file('word/document.xml').asText();
  const rows = [];
  const pattern = /<w:p[^>]*>([^]*?)<\/w:p>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const body = match[1];
    const isH3 = body.includes('<w:pStyle w:val="Heading3"/>');
    const hasNumTab = /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(body);
    if (!isH3 && !hasNumTab) continue;
    const texts = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
    if (!texts) continue;
    rows.push(texts.substring(0, 90));
  }
  const unnumbered = rows.filter((r) => !/^\d+\.\d+/.test(r));

  // Group by article and check each is sequential 1, 2, 3, ...
  const byArticle = new Map();
  for (const r of rows) {
    const m = r.match(/^(\d+)\.(\d+)/);
    if (!m) continue;
    const art = parseInt(m[1], 10);
    const sub = parseInt(m[2], 10);
    if (!byArticle.has(art)) byArticle.set(art, []);
    byArticle.get(art).push(sub);
  }
  const gaps = [];
  for (const [art, subs] of byArticle.entries()) {
    let expected = 1;
    for (const s of subs) {
      if (s !== expected) gaps.push(`Art ${art}: expected ${art}.${expected}, saw ${art}.${s}`);
      expected++;
    }
  }
  return { rows, unnumbered, gaps };
}

// Poll until the deployed code has the fix (unnumbered count == 0), up to 6 min.
const deadline = Date.now() + 6 * 60 * 1000;
let attempt = 0;
while (Date.now() < deadline) {
  attempt++;
  console.log(`\n— attempt ${attempt} —`);
  try {
    const buf = await tryOnce();
    const { rows, unnumbered, gaps } = analyzeHeadings(buf);
    console.log(
      `  Heading3 count: ${rows.length}, unnumbered: ${unnumbered.length}, gaps: ${gaps.length}`,
    );
    if (unnumbered.length === 0 && gaps.length === 0) {
      writeFileSync(join(OUT, 'fixed.docx'), buf);
      console.log(`\n✓ FIX LIVE. DOCX saved: ${join(OUT, 'fixed.docx')}`);
      console.log(`\nAll ${rows.length} Heading3 captions are sequentially numbered. First 30:`);
      rows.slice(0, 30).forEach((r) => console.log('   ', r));
      process.exit(0);
    }
    if (gaps.length > 0) console.log(`  first gap: ${gaps[0]}`);
    if (unnumbered.length > 0) console.log(`  still unnumbered: ${unnumbered.slice(0, 3).join(' | ')}`);
  } catch (e) {
    console.log(`  error: ${e.message.slice(0, 120)}`);
  }
  await new Promise((res) => setTimeout(res, 30000));
}
console.log(`\n✗ Timed out waiting for Vercel deploy`);
process.exit(1);
