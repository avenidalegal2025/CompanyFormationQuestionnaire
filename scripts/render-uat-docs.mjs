// Download the 4 DOCX files produced by the real UAT run from S3,
// convert each with LibreOffice, rasterize with poppler, and render a
// per-page gallery so we can actually eyeball the content — the Word
// Online PageDown trick silently no-op'd and the e2e-corp-full
// screenshots only show the cover page repeated.

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOFFICE  = 'C:\\Program Files\\LibreOffice\\program\\soffice.com';
const PDFTOPPM = 'C:\\Users\\neotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'uat-real-docs');
mkdirSync(OUT, { recursive: true });

const BUCKET = 'avenida-legal-documents';
const PREFIX = 'playwright-qa-corp-dgvzdcs4';

const docs = [
  { name: 'shareholder-registry',    s3: `${PREFIX}/formation/PLAYWRIGHT QA Corp - Shareholder Registry.docx` },
  { name: 'bylaws',                  s3: `${PREFIX}/formation/PLAYWRIGHT QA Corp - Bylaws.docx` },
  { name: 'organizational-resolution', s3: `${PREFIX}/formation/PLAYWRIGHT QA Corp - Organizational Resolution.docx` },
  { name: 'shareholder-agreement',   s3: `${PREFIX}/agreements/PLAYWRIGHT QA Corp - Shareholder Agreement.docx` },
];

for (const d of docs) {
  console.log(`\n── ${d.name} ──`);
  const dir = join(OUT, d.name);
  mkdirSync(dir, { recursive: true });
  const docx = join(dir, `${d.name}.docx`);

  // 1) download from S3
  const s3uri = `s3://${BUCKET}/${d.s3}`;
  const cp = spawnSync('aws', ['s3', 'cp', s3uri, docx, '--profile', 'llc-admin', '--region', 'us-west-1'], { stdio: 'inherit' });
  if (cp.status !== 0) { console.log(`  ✗ s3 cp failed`); continue; }
  console.log(`  ✓ downloaded ${statSync(docx).size} bytes`);

  // 2) convert to PDF
  const sof = spawnSync(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', dir, docx], { stdio: 'inherit' });
  if (sof.status !== 0) { console.log('  ✗ soffice failed'); continue; }
  const pdf = docx.replace(/\.docx$/, '.pdf');
  if (!existsSync(pdf)) { console.log('  ✗ PDF missing'); continue; }
  console.log(`  ✓ PDF ${statSync(pdf).size} bytes`);

  // 3) PDF → PNGs
  const pagesDir = join(dir, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  const pt = spawnSync(PDFTOPPM, ['-r', '120', '-png', pdf, join(pagesDir, 'p')], { stdio: 'inherit' });
  if (pt.status !== 0) { console.log('  ✗ pdftoppm failed'); continue; }
}

console.log(`\n✓ Done. ${OUT}`);
