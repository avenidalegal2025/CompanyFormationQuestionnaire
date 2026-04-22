/**
 * Truthful visual verification: use LibreOffice headless to convert the
 * rendered DOCX to PDF, then rasterize each page to PNG via pdf-lib + pdfjs
 * or just use mutool/pdftoppm if installed, otherwise Playwright PDF viewer.
 *
 * LibreOffice's renderer is a close match to MS Word for layout — fonts, tabs,
 * indentation, page breaks all honored.
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';

const DOCX = join(process.env.USERPROFILE || '.', 'Downloads', 'PROD_V2_AUDIT.docx');
const OUT = join(process.env.USERPROFILE || '.', 'Downloads', 'v2-libreoffice');
mkdirSync(OUT, { recursive: true });

const SOFFICE = `C:\\Program Files\\LibreOffice\\program\\soffice.exe`;
if (!existsSync(SOFFICE)) {
  console.error('LibreOffice not installed at:', SOFFICE);
  process.exit(1);
}

console.log('Converting DOCX → PDF via LibreOffice...');
const t0 = Date.now();
execSync(
  `"${SOFFICE}" --headless --convert-to pdf --outdir "${OUT}" "${DOCX}"`,
  { stdio: 'inherit' },
);
console.log(`PDF converted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Find the PDF
const pdf = readdirSync(OUT).find((f) => f.toLowerCase().endsWith('.pdf'));
if (!pdf) {
  console.error('No PDF produced');
  process.exit(1);
}
const pdfPath = join(OUT, pdf);
console.log('PDF:', pdfPath);

// Rasterize via Playwright: open file:// PDF and screenshot each page
// Chromium has a built-in PDF viewer — we scroll through and screenshot.
// But cleaner: use pdfjs-dist (part of node_modules via playwright).
// Fallback: load PDF in Playwright and screenshot each canvas.
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });

// Use Mozilla's pdfjs web viewer via CDN to render
const pdfUrl = 'file:///' + pdfPath.replace(/\\/g, '/');
const viewerUrl =
  'https://mozilla.github.io/pdf.js/web/viewer.html?file=' + encodeURIComponent(pdfUrl);

// Mozilla CDN can't read local files — use a data URL or local pdfjs copy
// Simpler: serve the pdf itself via `page.goto()` — Chromium renders it natively.
await page.goto(pdfUrl, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

// Chromium's built-in PDF plugin renders each page in an embedded viewer.
// Scroll via PageDown, screenshot after each step.
let prev = -1;
for (let i = 0; i < 30; i++) {
  const y = await page.evaluate(() => window.scrollY).catch(() => 0);
  if (y === prev && i > 1) break;
  prev = y;
  await page.screenshot({
    path: join(OUT, `pdf_p${String(i + 1).padStart(2, '0')}.png`),
    fullPage: false,
  });
  console.log('  shot', i + 1, 'scroll', y);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(1200);
}
await browser.close();
console.log('Done — screenshots in:', OUT);
