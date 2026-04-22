// Drive the ACTUAL deployed questionnaire UI and verify the fix is live in
// production. Two things this proves that the local-API script didn't:
//   1. We're looking at the real deployed Vercel URL, not localhost.
//   2. The live /api/agreement/generate path no longer produces malformed
//      XML when a user enters "President & CEO" (the corp_min repro case).
//
// Auth0 gates Step 2+ behind signup, so we can't click through the whole
// questionnaire without credentials — but:
//   - We screenshot the live homepage to prove the site is up and rendering
//     from the current main.
//   - We hit the deployed /api/agreement/generate directly (the same path
//     the UI calls after the user finishes the form) with the "President &
//     CEO" payload and assert the returned DOCX has balanced XML.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import PizZip from 'pizzip';
import { XMLValidator } from 'fast-xml-parser';

const BASE = 'https://company-formation-questionnaire.vercel.app';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'pw-verify-deployed');
mkdirSync(OUT, { recursive: true });

const SOFFICE  = 'C:\\Program Files\\LibreOffice\\program\\soffice.com';
const PDFTOPPM = 'C:\\Users\\neotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe';

// ── 1. Screenshot the live homepage so the user sees the real deployed page.
console.log(`\n→ Loading live homepage: ${BASE}`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const navStart = Date.now();
const resp = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
console.log(`  ✓ HTTP ${resp.status()} in ${Date.now() - navStart}ms`);
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(800); // give React a beat

// Dump the first heading / button text so we can confirm what we see
const snap = await page.evaluate(() => ({
  title: document.title,
  h1:    (document.querySelector('h1')?.textContent || '').trim().slice(0, 100),
  buttons: Array.from(document.querySelectorAll('button')).slice(0, 8).map((b) => (b.textContent || '').trim()).filter(Boolean),
  inputs:  Array.from(document.querySelectorAll('input, select')).slice(0, 8).map((el) => ({
    tag: el.tagName.toLowerCase(),
    name: el.getAttribute('name') || el.getAttribute('id') || '',
    placeholder: el.getAttribute('placeholder') || '',
  })),
}));
console.log(`  title:   ${snap.title}`);
console.log(`  h1:      ${snap.h1}`);
console.log(`  buttons: ${snap.buttons.slice(0, 4).join(' | ')}`);
console.log(`  inputs:  ${snap.inputs.map((i) => `${i.tag}[${i.name || i.placeholder}]`).join(', ')}`);

const shotPath = join(OUT, 'deployed_homepage.png');
await page.screenshot({ path: shotPath, fullPage: true });
console.log(`  ✓ Screenshot: ${shotPath}`);
await ctx.close();
await browser.close();

// ── 2. Hit the live /api/agreement/generate with the bug's repro payload.
console.log(`\n→ POST ${BASE}/api/agreement/generate  (officer1Role: "President & CEO")`);
const formData = {
  company: {
    entityType: 'C-Corp', entitySuffix: 'Corp',
    companyNameBase: 'AMP PROD Corp', formationState: 'Delaware',
    addressLine1: '1 A St', city: 'Dover', state: 'DE', postalCode: '19901', hasUsaAddress: 'Yes',
    numberOfShares: 1000,
  },
  owners: [{ firstName: 'Single', lastName: 'Owner', ownership: 100, fullName: 'Single Owner' }],
  ownersCount: 1,
  admin: {
    directorsAllOwners: 'Yes', directorsCount: 1,
    officersAllOwners: 'No',   officersCount: 1,
    officer1Name: 'Single Owner', officer1Role: 'President & CEO',
  },
  agreement: {
    corp_capitalPerOwner_0: 100000,
    majorityThreshold: 50, supermajorityThreshold: 75,
    corp_moreCapitalDecision: 'Decisión Unánime',
    corp_shareholderLoansVoting: 'Decisión Unánime',
    corp_saleDecisionThreshold: 'Decisión Unánime',
    corp_majorDecisionThreshold: 'Decisión Unánime',
    corp_newShareholdersAdmission: 'Decisión Unánime',
    corp_officerRemovalVoting: 'Decisión Unánime',
    corp_majorSpendingThreshold: 10000,
    corp_bankSigners: 'Un firmante',
    corp_taxOwner: 'Single Owner',
    corp_transferToRelatives: 'Transferencias a familiares libremente permitidas',
    corp_rofr: 'No', corp_incapacityHeirsPolicy: 'No', corp_tagDragRights: 'No',
    corp_nonCompete: 'No', corp_nonSolicitation: 'No', corp_confidentiality: 'No',
    distributionFrequency: 'Trimestral',
  },
};
const t0 = Date.now();
const r = await fetch(`${BASE}/api/agreement/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ formData, draftId: 'pw-verify-deployed' }),
});
if (!r.ok) { console.error('✗ API failed', r.status, await r.text()); process.exit(1); }
const buf = Buffer.from(await r.arrayBuffer());
const docxPath = join(OUT, 'deployed.docx');
writeFileSync(docxPath, buf);
console.log(`  ✓ DOCX ${buf.length} bytes in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${docxPath}`);

// ── 3. XML-validate the DOCX → the whole point of this fix.
const xml = new PizZip(buf).file('word/document.xml').asText();
const v = XMLValidator.validate(xml, { allowBooleanAttributes: true });
const isValid = v === true;
let bareAmp = 0, idx = 0;
while ((idx = xml.indexOf('&', idx)) !== -1) {
  const n = xml.substring(idx, idx + 8);
  if (!/^&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/.test(n)) bareAmp++;
  idx++;
}
const hasEscaped = xml.includes('President &amp; CEO');
console.log(`\n=== XML integrity on live-prod DOCX ===`);
console.log(`  Valid XML:              ${isValid ? '✓ YES' : '✗ NO — ' + JSON.stringify(v.err)}`);
console.log(`  Bare & in document.xml: ${bareAmp} ${bareAmp === 0 ? '✓' : '✗'}`);
console.log(`  "President &amp; CEO" present: ${hasEscaped ? '✓ YES' : '✗ NO'}`);

// ── 4. Render → PDF → PNGs so the user can see the actual deployed output.
if (!existsSync(SOFFICE)) { console.log('(skipping PDF render — no LibreOffice)'); }
else {
  const sof = spawnSync(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, docxPath], { stdio: 'inherit' });
  if (sof.status !== 0) { console.error('✗ soffice failed'); process.exit(1); }
  const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
  console.log(`  ✓ PDF ${statSync(pdfPath).size} bytes`);
  const pagesDir = join(OUT, 'pages'); mkdirSync(pagesDir, { recursive: true });
  const pt = spawnSync(PDFTOPPM, ['-r', '150', '-png', pdfPath, join(pagesDir, 'page')], { stdio: 'inherit' });
  if (pt.status !== 0) { console.error('✗ pdftoppm failed'); process.exit(1); }
}

if (!isValid || bareAmp > 0 || !hasEscaped) {
  console.log(`\n✗ Deployed prod still has the bug.`);
  process.exit(1);
}
console.log(`\n✓ Deployed prod is fixed — DOCX is valid XML and "&" is correctly escaped.`);
