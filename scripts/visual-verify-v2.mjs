/**
 * Visual verification of v2 fixes against the latest PLAYWRIGHT QA Corp
 * Shareholder Agreement — rendered via Google Docs viewer (CLAUDE.md sanctioned).
 *
 * Screenshots EVERY page so a human (and this agent) can eyeball:
 *   #7   TNR font throughout
 *   #10  §4.2 capital table fits inside the margins
 *   #11/12 §9.2 (i)-(iv) list looks like a tight romanette list
 *   #13  "$25,000" (not "$225,000") in the major spending clause
 *   #16  signature block shows titles under Name: lines
 *   #17  no stray "[SIGNATURE PAGE BELOW]" heading page
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const S3_KEY = 'playwright-qa-corp-dgvzdctl/agreements/PLAYWRIGHT QA Corp - Shareholder Agreement.docx';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'v2-visual-verify');
mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = `v2_${String(shotN).padStart(3, '0')}_${label}.png`;
  await page.screenshot({ path: join(DIR, f), fullPage: false });
  console.log(`  [shot] ${f}`);
  return f;
}

async function main() {
  console.log('Presigning S3 URL...');
  const presigned = execSync(
    `aws s3 presign "s3://avenida-legal-documents/${S3_KEY}" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();
  const encoded = encodeURIComponent(presigned);
  const gviewUrl = `https://docs.google.com/gview?url=${encoded}&embedded=true`;
  writeFileSync(join(DIR, '_presigned.txt'), presigned);
  writeFileSync(join(DIR, '_gviewUrl.txt'), gviewUrl);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 1400 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Loading Google Docs viewer...');
    await page.goto(gviewUrl, { waitUntil: 'networkidle', timeout: 120000 });
    console.log('Waiting 25s for render...');
    await page.waitForTimeout(25000);
    await shot(page, 'initial');

    const info = await page.evaluate(() => ({
      title: document.title,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      text: (document.body?.innerText || '').substring(0, 500),
    }));
    console.log('Title:', info.title);
    console.log('Scroll:', info.scrollH, 'Client:', info.clientH);
    console.log('Text sample:', info.text.substring(0, 200).replace(/\s+/g, ' '));

    // Paginate via PageDown — most reliable for gviewer's internal scroll.
    console.log('\nScrolling via PageDown...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    let prev = -1;
    const MAX = 35;
    for (let i = 0; i < MAX; i++) {
      const y = await page.evaluate(() => window.scrollY);
      if (y === prev && i > 2) {
        console.log('  Reached end at page', i);
        break;
      }
      prev = y;
      await shot(page, `page_${String(i + 1).padStart(2, '0')}`);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1800);
    }

    // Also capture text via innerText for cross-referencing which page has what
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    writeFileSync(join(DIR, '_innerText.txt'), bodyText);
    console.log('\nSaved innerText to _innerText.txt (', bodyText.length, 'chars)');
    console.log('\nAll screenshots in:', DIR);
  } catch (e) {
    console.error('Error:', e.message);
    await shot(page, 'error').catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
