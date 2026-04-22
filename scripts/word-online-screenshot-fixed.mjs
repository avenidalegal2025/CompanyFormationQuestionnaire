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
// Tall viewport forces Word Online to render all ~21 pages stacked
// into one big iframe rather than virtualizing.
const ctx = await browser.newContext({ viewport: { width: 1600, height: 25000 } });
const page = await ctx.newPage();

console.log(`\n→ Opening Word Online viewer (90s render wait for all pages)…`);
await page.goto(wovUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(90000);

// With a 25000px viewport, Word Online renders all pages stacked.
// Capture vertical slices so each screenshot is viewable. We observed
// each page is ~1100-1200px tall. Cover + 21 pages ≈ 23,000px total.
// Slice into 5 chunks of 5000px each.
const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(`  document height: ${pageHeight}px`);

const sliceHeight = 5000;
const numSlices = Math.ceil(pageHeight / sliceHeight);
for (let i = 0; i < numSlices; i++) {
  const y = i * sliceHeight;
  const h = Math.min(sliceHeight, pageHeight - y);
  const out = join(OUT, `slice-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({
    path: out,
    clip: { x: 0, y, width: 1600, height: h },
  });
  console.log(`  ✓ ${out} (y=${y}..${y + h})`);
}

await browser.close();
console.log(`\n✓ Screenshots written to ${OUT}`);
console.log(`  Word Online URL: ${wovUrl}`);
