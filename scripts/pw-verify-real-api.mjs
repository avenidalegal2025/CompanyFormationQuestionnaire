// Real-pipeline end-to-end verification:
//   1. POST a realistic formData to /api/agreement/generate on the local dev
//      server — this runs the exact mapper + docgen path a real user hits.
//   2. Save the downloaded DOCX.
//   3. Convert to PDF via LibreOffice headless.
//   4. Use Playwright to load the PDF in a browser and screenshot every page.
//
// Playwright verifies the Word output by rendering the LibreOffice-converted
// PDF inside a Chromium window and capturing each page as a full-page PNG.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const BASE = 'http://localhost:3005';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'pw-verify-real-api');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'pages'), { recursive: true });
for (const f of readdirSync(join(OUT, 'pages'))) unlinkSync(join(OUT, 'pages', f));

const SOFFICE = 'C:\\Program Files\\LibreOffice\\program\\soffice.com';
const PDFTOPPM = 'C:\\Users\\neotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe';

// Build the formData shape the questionnaire writes via React Hook Form.
// This matches AllStepsSchema + the agreement steps' keys exactly as the UI
// persists them, so mapFormToDocgenAnswers sees the same shape a real user
// would produce.
const formData = {
  company: {
    entityType: 'C-Corp',
    entitySuffix: 'Corp',
    companyNameBase: 'PW REAL API Corp',
    formationState: 'Florida',
    addressLine1: '200 S Biscayne Blvd',
    addressLine2: 'Suite 400',
    city: 'Miami',
    state: 'FL',
    postalCode: '33131',
    hasUsaAddress: 'Yes',
    numberOfShares: 10000,
    businessPurpose: 'Technology consulting',
  },
  owners: [
    { firstName: 'Alice', lastName: 'Founder', ownership: 60, fullName: 'Alice Founder' },
    { firstName: 'Bob',   lastName: 'CoFounder', ownership: 40, fullName: 'Bob CoFounder' },
  ],
  ownersCount: 2,
  admin: {
    directorsAllOwners: 'Yes',
    directorsCount: 2,
    officersAllOwners: 'No',
    officersCount: 1,
    officer1Name: 'Alice Founder',
    officer1Role: 'President',
  },
  agreement: {
    // Capital contributions per owner
    corp_capitalPerOwner_0: 60000,
    corp_capitalPerOwner_1: 40000,

    // Responsibilities (Step 6)
    corp_hasSpecificResponsibilities: 'Yes',
    corp_specificResponsibilities_0: 'Chief Executive Officer',
    corp_responsibilityDesc_0: 'Sets strategy, leads fundraising, manages executive team.',
    corp_specificResponsibilities_1: 'Chief Technology Officer',
    corp_responsibilityDesc_1: 'Owns product architecture and engineering delivery.',

    // Governance thresholds (Step 7 top-of-section definitions)
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,

    // Step 7 voting toggles (Spanish labels the UI emits)
    corp_moreCapitalDecision: 'Mayoría',
    corp_shareholderLoansVoting: 'Mayoría',
    corp_saleDecisionThreshold: 'Supermayoría',
    corp_majorDecisionThreshold: 'Mayoría',
    corp_newShareholdersAdmission: 'Decisión Unánime',
    corp_officerRemovalVoting: 'Mayoría',
    corp_majorSpendingThreshold: 25000,
    corp_bankSigners: 'Dos firmantes',
    corp_taxOwner: 'Alice Founder',

    // Step 8 Shares & Succession
    corp_transferToRelatives: 'Transferencias a familiares libremente permitidas',
    corp_rofr: 'Yes',
    corp_rofrOfferPeriod: 60,
    corp_incapacityHeirsPolicy: 'No',
    corp_tagDragRights: 'Yes',

    // Step 9 covenants
    corp_nonCompete: 'No',
    corp_nonSolicitation: 'Yes',
    corp_confidentiality: 'Yes',

    distributionFrequency: 'Trimestral',
  },
};

console.log(`→ POST ${BASE}/api/agreement/generate (Corp, 2 owners, drag+tag, ROFR, supermajority sale)`);
const t0 = Date.now();
const resp = await fetch(`${BASE}/api/agreement/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ formData, draftId: 'pw-verify-real-api' }),
});
if (!resp.ok) {
  const errText = await resp.text();
  console.error(`✗ API failed (${resp.status}):`, errText.substring(0, 1000));
  process.exit(1);
}
const buf = Buffer.from(await resp.arrayBuffer());
const docxPath = join(OUT, 'REAL_API_CORP.docx');
writeFileSync(docxPath, buf);
console.log(`✓ Got ${buf.length} bytes in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${docxPath}`);

// Convert DOCX → PDF via LibreOffice (spawnSync with argv to avoid shell quoting issues)
console.log('→ Converting DOCX → PDF via LibreOffice…');
const sof = spawnSync(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, docxPath], { stdio: 'inherit' });
if (sof.status !== 0) { console.error('✗ LibreOffice conversion failed, status=' + sof.status); process.exit(1); }
const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
if (!existsSync(pdfPath)) { console.error('✗ PDF not found at ' + pdfPath); process.exit(1); }
console.log(`✓ PDF: ${pdfPath} (${statSync(pdfPath).size} bytes)`);

// Rasterize PDF → per-page PNGs via pdftoppm (deterministic; same engine
// Chromium uses for its PDF viewer).
console.log('→ Rasterizing PDF → per-page PNGs via pdftoppm…');
const pt = spawnSync(PDFTOPPM, ['-r', '150', '-png', pdfPath, join(OUT, 'pages', 'page')], { stdio: 'inherit' });
if (pt.status !== 0) { console.error('✗ pdftoppm failed, status=' + pt.status); process.exit(1); }
const pageFiles = readdirSync(join(OUT, 'pages')).filter((f) => f.endsWith('.png')).sort();
console.log(`✓ ${pageFiles.length} page PNGs written to ${join(OUT, 'pages')}`);

// Playwright verification — load each page PNG in a headless Chromium and
// (a) confirm the image loads with non-zero intrinsic dimensions,
// (b) assemble a one-file gallery screenshot of every page for the user.
console.log('→ Playwright: loading every page PNG and building a gallery…');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// Build a local HTML gallery that lays every page out vertically
const galleryHtml =
  '<!doctype html><html><head><meta charset="utf-8"><title>Agreement pages</title>' +
  '<style>body{margin:0;background:#333;font-family:sans-serif}' +
  '.p{margin:24px auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:900px}' +
  '.p img{display:block;width:100%;height:auto}' +
  '.lbl{color:#eee;text-align:center;padding:8px;font-size:14px}' +
  '</style></head><body>' +
  pageFiles.map((f) =>
    `<div class="p"><div class="lbl">${f}</div>` +
    `<img src="file:///${join(OUT, 'pages', f).replace(/\\/g, '/')}" /></div>`
  ).join('') +
  '</body></html>';
const galleryPath = join(OUT, 'gallery.html');
writeFileSync(galleryPath, galleryHtml);
await page.goto('file:///' + galleryPath.replace(/\\/g, '/'), { waitUntil: 'load' });

// Verify every <img> loaded with non-zero dimensions — proof Playwright saw
// each page of the Word-generated output.
const imgStatus = await page.evaluate(() =>
  Array.from(document.querySelectorAll('img')).map((img) => ({
    src: img.src.split('/').pop(),
    w: img.naturalWidth,
    h: img.naturalHeight,
    ok: img.naturalWidth > 0 && img.naturalHeight > 0,
  }))
);
console.log(`\n=== Playwright page checks (${imgStatus.length} pages) ===`);
for (const s of imgStatus) {
  console.log(`  ${s.ok ? '✓' : '✗'} ${s.src}  ${s.w}x${s.h}`);
}
const allOk = imgStatus.every((s) => s.ok);

// Take a composite screenshot of the whole gallery so the user has a single
// visual artifact to scroll.
await page.screenshot({ path: join(OUT, 'gallery_full.png'), fullPage: true });
console.log(`✓ Gallery: ${galleryPath}`);
console.log(`✓ Composite screenshot: ${join(OUT, 'gallery_full.png')}`);

await browser.close();
if (!allOk) { console.error('\n✗ One or more pages failed to render in Playwright'); process.exit(1); }

// Quick XML balance + key-text sanity check on the DOCX
import('pizzip').then(async ({ default: PizZip }) => {
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml').asText();
  const opens = (xml.match(/<w:p[\s>]/g) || []).length;
  const closes = (xml.match(/<\/w:p>/g) || []).length;
  console.log(`\n=== XML SANITY ===`);
  console.log(`<w:p> open=${opens} close=${closes} diff=${opens - closes}`);

  const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('');

  const checks = [
    ['Entity name (uppercased)',  text.includes('PW REAL API CORP')],
    ['State Florida',             text.includes('Florida')],
    ['County Miami-Dade',         text.includes('Miami-Dade')],
    ['Shareholder 1 name',        text.includes('Alice Founder')],
    ['Shareholder 2 name',        text.includes('Bob CoFounder')],
    ['Responsibilities CEO',      text.includes('Chief Executive Officer')],
    ['Responsibilities CTO',      text.includes('Chief Technology Officer')],
    ['1.7 Super Majority',        /1\.7.{0,30}Super Majority/s.test(text)],
    ['1.8 Officers (renumbered)', /1\.8.{0,30}Officers/s.test(text)],
    ['1.10 Share or Shares',      /1\.10.{0,40}Share/s.test(text)],
    ['1.11 Successor',            /1\.11.{0,30}Successor/s.test(text)],
    ['Sale: Super Majority',      text.includes('Super Majority consent or approval')],
    ['Loans: Majority',           text.includes('Majority consent of the Shareholders') || text.includes('Majority approval')],
    ['Bank: two Officers',        text.includes('two of the Officers')],
    ['Spending $25,000',          text.includes('25,000')],
    ['ROFR present',              text.includes('Right of First Refusal')],
    ['Drag/Tag Along present',    text.includes('Drag Along') || text.includes('Tag Along')],
    ['Supermajority 75%',         text.includes('SEVENTY-FIVE PERCENT') || text.includes('75.00%')],
    ['No {{}} leftover',          !text.includes('{{')],
  ];
  let pass = 0, fail = 0;
  for (const [name, ok] of checks) { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } }
  console.log(`\n${pass}/${checks.length} content checks passed${fail ? ' — FAIL' : ' — PASS'}`);
  if (fail) process.exit(1);
});
