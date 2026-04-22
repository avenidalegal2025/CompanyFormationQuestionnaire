// Open the UAT-generated Shareholder Agreement in Word Online and
// screenshot what it actually looks like there (real Times New Roman, not
// LibreOffice substituting Liberation Serif). Also render the raw template
// DOCX through the same Word Online path so we can compare fonts.

import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = join(process.env.USERPROFILE, 'Downloads', 'word-online-font-check');
mkdirSync(OUT, { recursive: true });

// Put both files on S3 in a temp location so Word Online can fetch them.
// The generated doc is already there; upload the template alongside so we
// have an apples-to-apples comparison.
const BUCKET = 'avenida-legal-documents';
const GEN_KEY = 'playwright-qa-corp-dgvzdcs4/agreements/PLAYWRIGHT QA Corp - Shareholder Agreement.docx';
const TEMPLATE_KEY = 'debug/font-check/corp_template.docx';

const templateSrc = 'C:\\Users\\neotr\\Documents\\AvenidaLegal\\CompanyFormationQuestionnaire\\templates\\corp_template.docx';
console.log('→ Uploading template to S3 for side-by-side comparison…');
const up = spawnSync('aws', ['s3', 'cp', templateSrc, `s3://${BUCKET}/${TEMPLATE_KEY}`, '--profile', 'llc-admin', '--region', 'us-west-1'], { stdio: 'inherit' });
if (up.status !== 0) { console.error('✗ template upload failed'); process.exit(1); }

function presign(key) {
  const r = spawnSync('aws', ['s3', 'presign', `s3://${BUCKET}/${key}`, '--profile', 'llc-admin', '--region', 'us-west-1', '--expires-in', '3600'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('presign failed: ' + r.stderr);
  return r.stdout.trim();
}

const genUrl = presign(GEN_KEY);
const tmplUrl = presign(TEMPLATE_KEY);
console.log('  ✓ gen presigned');
console.log('  ✓ template presigned');

const wov = (u) => `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(u)}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 2000 } });

async function capture(label, docUrl) {
  console.log(`\n── ${label} ──`);
  const page = await ctx.newPage();
  await page.goto(wov(docUrl), { waitUntil: 'domcontentloaded', timeout: 90000 });
  // Word Online takes a long time to render. Wait ~45s.
  console.log('  waiting 45s for Word Online to render…');
  await page.waitForTimeout(45000);
  const p1 = join(OUT, `${label}_p1.png`);
  await page.screenshot({ path: p1, fullPage: false });
  console.log(`  ✓ ${p1}`);
  // Scroll down for page 2
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(3000);
  const p2 = join(OUT, `${label}_p2.png`);
  await page.screenshot({ path: p2, fullPage: false });
  console.log(`  ✓ ${p2}`);
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(3000);
  const p3 = join(OUT, `${label}_p3.png`);
  await page.screenshot({ path: p3, fullPage: false });
  console.log(`  ✓ ${p3}`);
  await page.close();
}

await capture('generated', genUrl);
await capture('template',  tmplUrl);

await browser.close();
console.log(`\n✓ Done. Compare the two sets of screenshots in ${OUT}`);
