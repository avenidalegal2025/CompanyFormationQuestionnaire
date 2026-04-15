/**
 * Open document in Office Online viewer and screenshot every page.
 * Tries multiple viewer approaches for headless compatibility.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = `viewer_${String(shotN).padStart(3, '0')}_${label}.png`;
  await page.screenshot({ path: join(DIR, f), fullPage: false });
  console.log(`  [screenshot] ${f}`);
  return f;
}

async function main() {
  // Generate fresh presigned URL
  console.log('Generating presigned URL...');
  const presigned = execSync(
    `aws s3 presign "s3://avenida-legal-documents/avenida-tech-inc-dgvzdcty/agreements/AVENIDA TECH Inc - Shareholder Agreement.docx" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();

  // Save presigned URL
  writeFileSync(join(DIR, 'presigned_url.txt'), presigned);

  // Build Office Online viewer URL
  const encodedUrl = encodeURIComponent(presigned);
  const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;

  // Also build Word Online URL (non-embed)
  const wordUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;

  // And Google Docs URL
  const gviewUrl = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;

  console.log('Viewer URLs generated.');
  writeFileSync(join(DIR, 'word_online_url.txt'), wordUrl);
  writeFileSync(join(DIR, 'embed_url.txt'), viewerUrl);
  writeFileSync(join(DIR, 'gview_url.txt'), gviewUrl);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security', '--allow-running-insecure-content'],
  });

  // Try with a tall viewport to see more content
  const ctx = await browser.newContext({
    viewport: { width: 1000, height: 1400 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  // ─── Attempt 1: Embed viewer ───
  console.log('\n=== ATTEMPT 1: Office embed viewer ===');
  try {
    await page.goto(viewerUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(30000);

    const info = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.substring(0, 200) || '',
      scrollH: document.documentElement.scrollHeight,
      iframes: document.querySelectorAll('iframe').length,
    }));
    console.log('Title:', info.title);
    console.log('Text:', info.text.substring(0, 100));
    console.log('Scroll H:', info.scrollH);

    await shot(page, 'embed_loaded');

    if (info.text.includes('problem') || info.text.includes('error') || info.text.includes('Couldn')) {
      console.log('  Embed viewer failed to load document.');
    } else if (info.scrollH > 1500) {
      console.log('  Document loaded! Scrolling through pages...');
      let prevScroll = -1;
      for (let i = 0; i < 22; i++) {
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(2000);
        await shot(page, `embed_page_${String(i + 1).padStart(2, '0')}`);

        const s = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (s === prevScroll && i > 0) {
          console.log('  End of scroll at page', i + 1);
          break;
        }
        prevScroll = s;
      }
    }
  } catch (e) {
    console.log('  Embed viewer error:', e.message);
  }

  // ─── Attempt 2: Word Online view (non-embed) ───
  console.log('\n=== ATTEMPT 2: Word Online view ===');
  try {
    await page.goto(wordUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(30000);

    const info = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.substring(0, 200) || '',
      scrollH: document.documentElement.scrollHeight,
    }));
    console.log('Title:', info.title);
    console.log('Text:', info.text.substring(0, 100));

    await shot(page, 'word_view');

    // Check iframes
    const frames = page.frames();
    console.log('Frames:', frames.length);
    for (const f of frames) {
      if (f === page.mainFrame()) continue;
      try {
        const txt = await f.evaluate(() => document.body?.innerText?.substring(0, 80) || '');
        if (txt) console.log('  Frame text:', txt);
      } catch (e) { /* cross-origin */ }
    }

    // Try clicking into the document area and scrolling
    await page.mouse.click(500, 500);
    await page.waitForTimeout(1000);

    let prevScroll = -1;
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(2000);
      await shot(page, `word_page_${String(i + 1).padStart(2, '0')}`);

      const s = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (s === prevScroll && i > 0) break;
      prevScroll = s;
    }
  } catch (e) {
    console.log('  Word Online error:', e.message);
  }

  // ─── Attempt 3: Google Docs viewer (non-embedded) ───
  console.log('\n=== ATTEMPT 3: Google Docs viewer ===');
  try {
    const gviewNonEmbed = `https://docs.google.com/gview?url=${encodedUrl}`;
    await page.goto(gviewNonEmbed, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(20000);

    const info = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.substring(0, 300) || '',
      scrollH: document.documentElement.scrollHeight,
    }));
    console.log('Title:', info.title);
    console.log('Text:', info.text.substring(0, 100));
    console.log('Scroll H:', info.scrollH);

    await shot(page, 'gdocs_view');

    if (!info.text.includes("Couldn't") && info.scrollH > 1500) {
      let prevScroll = -1;
      for (let i = 0; i < 22; i++) {
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(2000);
        await shot(page, `gdocs_page_${String(i + 1).padStart(2, '0')}`);

        const s = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (s === prevScroll && i > 0) break;
        prevScroll = s;
      }
    } else {
      console.log('  Google Docs viewer also failed to load.');
    }
  } catch (e) {
    console.log('  GDocs error:', e.message);
  }

  await browser.close();
  console.log('\nAll attempts complete. Screenshots saved to:', DIR);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
