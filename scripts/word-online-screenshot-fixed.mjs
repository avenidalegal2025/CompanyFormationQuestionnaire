// Upload the sequential-numbering-fixed DOCX to S3, presign a URL, open
// in Word Online via Playwright, and screenshot the first several pages
// so we can visually confirm:
//   - Article I: 1.1, 1.2, 1.3, … (no 1.2 gap)
//   - Article X: 10.5 Specific Responsibilities of Shareholders (new section)
//   - Cross-refs: "Section 5.3", "Section 9.2" etc. resolve
//
// Uses the same Word Online viewer Playwright pattern we proved works
// for font verification. Times New Roman renders faithfully here (unlike
// LibreOffice which substitutes Liberation Serif).

import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = join(process.env.USERPROFILE, 'Downloads', 'numbering-fix-verify', 'screenshots');
mkdirSync(OUT, { recursive: true });

const DOCX = join(process.env.USERPROFILE, 'Downloads', 'numbering-fix-verify', 'fixed.docx');
if (!existsSync(DOCX)) {
  console.error(`✗ Expected ${DOCX} — run verify-numbering-fix-on-prod.mjs first`);
  process.exit(1);
}

const BUCKET = 'avenida-legal-documents';
const KEY = `debug/numbering-fix-verify/fixed-${Date.now()}.docx`;
console.log(`→ Uploading DOCX to s3://${BUCKET}/${KEY} …`);
const up = spawnSync(
  'aws',
  ['s3', 'cp', DOCX, `s3://${BUCKET}/${KEY}`, '--profile', 'llc-admin', '--region', 'us-west-1'],
  { stdio: 'inherit' },
);
if (up.status !== 0) { console.error('✗ upload failed'); process.exit(1); }

const r = spawnSync(
  'aws',
  ['s3', 'presign', `s3://${BUCKET}/${KEY}`, '--profile', 'llc-admin', '--region', 'us-west-1', '--expires-in', '3600'],
  { encoding: 'utf8' },
);
if (r.status !== 0) { console.error('✗ presign failed: ' + r.stderr); process.exit(1); }
const presigned = r.stdout.trim();
console.log('  ✓ presigned');

const wovUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presigned)}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 2000 } });
const page = await ctx.newPage();

console.log(`\n→ Opening Word Online viewer (45s render wait)…`);
await page.goto(wovUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(45000);

// Screenshot the first several page chunks to see Article I, IV, X where
// the renumbering is most visible.
const names = ['cover', 'article1', 'article4', 'article10', 'article15'];
for (let i = 0; i < names.length; i++) {
  const p = join(OUT, `${i + 1}-${names[i]}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  ✓ ${p}`);
  if (i < names.length - 1) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(2500);
  }
}

await browser.close();
console.log(`\n✓ Screenshots written to ${OUT}`);
console.log(`  Word Online URL: ${wovUrl}`);
