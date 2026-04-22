/**
 * Visual verification via Microsoft Office Online viewer (fallback for
 * Google Docs viewer, which refused to render the PLAYWRIGHT QA Corp doc).
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const S3_KEY = 'playwright-qa-corp-dgvzdctl/agreements/PLAYWRIGHT QA Corp - Shareholder Agreement.docx';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'v2-visual-verify-office');
mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = `v2off_${String(shotN).padStart(3, '0')}_${label}.png`;
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
  // Microsoft Office Online viewer
  const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encoded}`;
  writeFileSync(join(DIR, '_presigned.txt'), presigned);
  writeFileSync(join(DIR, '_officeUrl.txt'), officeUrl);
  console.log('Office viewer URL len:', officeUrl.length);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 1500 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Loading Office Online viewer...');
    await page.goto(officeUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('Waiting 30s for render...');
    await page.waitForTimeout(30000);
    await shot(page, 'initial');

    const info = await page.evaluate(() => ({
      title: document.title,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      text: (document.body?.innerText || '').substring(0, 600),
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.substring(0, 80)),
    }));
    console.log('Title:', info.title);
    console.log('Iframes:', info.iframes);
    console.log('Text:', info.text.substring(0, 250).replace(/\s+/g, ' '));

    // Office Online usually renders into a nested iframe — try to reach into it
    const frames = page.frames();
    console.log('Total frames:', frames.length);
    for (const [i, f] of frames.entries()) {
      console.log(`  frame ${i}: ${f.url().substring(0, 100)}`);
    }

    // Walk down via PageDown or scroll; try both the main page and frames
    console.log('\nScrolling via PageDown on main...');
    let prev = -1;
    for (let i = 0; i < 35; i++) {
      const y = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (y === prev && i > 2) {
        console.log('  End reached at step', i);
        break;
      }
      prev = y;
      await shot(page, `page_${String(i + 1).padStart(2, '0')}`);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    writeFileSync(join(DIR, '_innerText.txt'), bodyText);
    console.log('Saved innerText (', bodyText.length, 'chars)');
    console.log('Screenshots in:', DIR);
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
