/**
 * Last-resort visual verification: use mammoth to convert the rendered DOCX
 * to HTML, then render it in Playwright and screenshot.
 *
 * Mammoth is pure-JS, preserves semantic structure (tables, lists, runs)
 * but not pixel-perfect layout. Still good enough to eyeball:
 *   #13  spending threshold text ($25k not $225k)
 *   #16  signature block titles render
 *   #17  no [SIGNATURE PAGE BELOW] heading
 *   #11  romanette list renders as a list (not smashed together)
 *
 * And — importantly — if mammoth errors out, that confirms Office Online's
 * "Word ran into a problem" was a real corruption, not an S3-URL quirk.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import mammoth from 'mammoth';

const DOCX = join(process.env.USERPROFILE || '.', 'Downloads', 'PROD_V2_AUDIT.docx');
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'v2-mammoth');
mkdirSync(DIR, { recursive: true });

async function main() {
  console.log('Reading:', DOCX);
  const buffer = readFileSync(DOCX);
  console.log('Size:', buffer.length, 'bytes');

  console.log('\nConverting with mammoth...');
  let result;
  try {
    result = await mammoth.convertToHtml({ buffer }, {
      includeDefaultStyleMap: true,
      styleMap: [
        "p[style-name='List Paragraph'] => li:fresh",
      ],
    });
  } catch (e) {
    console.error('MAMMOTH FAILED — document is corrupted:', e.message);
    process.exit(1);
  }

  console.log('Messages:', result.messages.length);
  for (const m of result.messages.slice(0, 20)) {
    console.log(`  [${m.type}] ${m.message}`);
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; max-width: 816px; margin: 40px auto; padding: 0 40px; font-size: 12pt; line-height: 1.3; }
  h1, h2 { font-size: 12pt; font-weight: bold; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #999; padding: 4px 8px; }
  p { margin: 6px 0; }
  .marker { background: yellow; font-weight: bold; }
</style></head>
<body>
<h2>[MAMMOTH RENDER — LOSSY BUT READABLE]</h2>
${result.value}
</body></html>`;
  const htmlPath = join(DIR, 'doc.html');
  writeFileSync(htmlPath, html);
  console.log('\nHTML written:', htmlPath, '(', html.length, 'bytes)');

  // Now render in Playwright and screenshot each page-ish region
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.waitForTimeout(500);

  // Highlight the key fix markers so the audit is visual
  await page.evaluate(() => {
    const walk = (node) => {
      if (node.nodeType === 3) {
        const t = node.nodeValue;
        if (/\$25,000\.00|\$225,000|Chief Executive Officer|Chief Technology Officer|\[SIGNATURE PAGE BELOW\]|excess of \$/i.test(t)) {
          const span = document.createElement('span');
          span.className = 'marker';
          span.textContent = t;
          node.parentNode.replaceChild(span, node);
        }
        return;
      }
      for (const c of [...node.childNodes]) walk(c);
    };
    walk(document.body);
  });

  // Full-page screenshot
  await page.screenshot({ path: join(DIR, 'full.png'), fullPage: true });
  console.log('Full screenshot saved');

  // Page-by-page viewport screenshots
  const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('Scroll height:', scrollH);
  const pageH = 1200;
  const pages = Math.ceil(scrollH / pageH);
  console.log('Pages to capture:', pages);

  for (let i = 0; i < pages; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * pageH);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(DIR, `p_${String(i + 1).padStart(2, '0')}.png`),
      fullPage: false,
    });
  }

  await browser.close();
  console.log('\nDone — screenshots in:', DIR);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
