/**
 * Convert the Shareholder Agreement DOCX to HTML, render in Playwright, and screenshot each page.
 * Uses mammoth.js for DOCX→HTML conversion and Playwright for rendering.
 */
import mammoth from 'mammoth';
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
mkdirSync(DIR, { recursive: true });

const docxPath = join(DIR, 'shareholder_agreement_fixed.docx');

async function main() {
  console.log('Converting DOCX to HTML...');

  // Convert DOCX to HTML
  const result = await mammoth.convertToHtml(
    { path: docxPath },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    }
  );

  const html = result.value;
  console.log('HTML length:', html.length);
  if (result.messages.length > 0) {
    console.log('Warnings:', result.messages.length);
  }

  // Wrap in a full HTML page with print-like styling
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: letter;
    margin: 1in;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    margin: 0;
    padding: 40px 60px;
    max-width: 800px;
    margin: 0 auto;
    background: white;
    color: black;
  }
  h1, h2, h3 {
    font-weight: bold;
    margin-top: 20px;
    margin-bottom: 10px;
  }
  h1 { font-size: 16pt; text-align: center; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  p { margin: 6px 0; text-align: justify; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 10px 0;
  }
  td, th {
    border: 1px solid #333;
    padding: 4px 8px;
    font-size: 11pt;
  }
  /* Page breaks for screenshot boundaries */
  .page-marker {
    page-break-before: always;
    height: 0;
    overflow: hidden;
  }
</style>
</head>
<body>
${html}
</body>
</html>`;

  const htmlPath = join(DIR, 'agreement_rendered.html');
  writeFileSync(htmlPath, fullHtml);
  console.log('Saved HTML:', htmlPath);

  // Open in Playwright and screenshot
  console.log('Opening in Playwright...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 850, height: 1100 }, // Letter-size proportions
  });
  const page = await ctx.newPage();

  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Get total height
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 1100;
  const numPages = Math.ceil(totalHeight / viewportHeight);
  console.log(`Total height: ${totalHeight}px, Pages: ${numPages}`);

  // Screenshot each page
  for (let i = 0; i < numPages; i++) {
    const scrollY = i * viewportHeight;
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(500);

    const filename = `page_${String(i + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(DIR, filename), fullPage: false });
    console.log(`  [screenshot] ${filename}`);
  }

  // Also take a full-page screenshot for reference
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(DIR, 'full_document.png'), fullPage: true });
  console.log('  [screenshot] full_document.png (full page)');

  await browser.close();
  console.log(`\nDone! ${numPages} page screenshots saved to: ${DIR}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
