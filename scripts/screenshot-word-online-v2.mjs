/**
 * Open the Shareholder Agreement in Word Online (headed browser) and screenshot every page.
 * Uses headed Playwright browser for Word Online compatibility.
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
  const f = `word_${String(shotN).padStart(3, '0')}_${label}.png`;
  await page.screenshot({ path: join(DIR, f), fullPage: false });
  console.log(`  [screenshot] ${f}`);
}

async function main() {
  // Generate fresh presigned URL
  console.log('Generating presigned URL...');
  const presigned = execSync(
    `aws s3 presign "s3://avenida-legal-documents/avenida-tech-inc-dgvzdcty/agreements/AVENIDA TECH Inc - Shareholder Agreement.docx" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();

  const encodedUrl = encodeURIComponent(presigned);
  const wordOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;

  console.log('Opening headed browser...\n');

  // Use headed browser for better Word Online compatibility
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Navigating to Word Online viewer...');
    await page.goto(wordOnlineUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // Wait for initial load
    console.log('Waiting for document to load (30s)...');
    await page.waitForTimeout(30000);
    await shot(page, 'loaded');

    // Check page content and structure
    const pageInfo = await page.evaluate(() => {
      const frames = document.querySelectorAll('iframe');
      const html = document.documentElement.innerHTML.substring(0, 2000);
      return {
        title: document.title,
        url: window.location.href,
        frameCount: frames.length,
        bodyText: document.body.innerText.substring(0, 500),
        htmlSnippet: html.substring(0, 500),
      };
    });
    console.log('Page title:', pageInfo.title);
    console.log('URL:', pageInfo.url.substring(0, 100));
    console.log('Frames:', pageInfo.frameCount);
    console.log('Body text (first 200):', pageInfo.bodyText.substring(0, 200));

    // If there's an iframe, try to work within it
    if (pageInfo.frameCount > 0) {
      console.log('\nFound iframes, checking...');
      const frames = page.frames();
      for (const frame of frames) {
        const url = frame.url();
        if (url && url.includes('view.officeapps') || url.includes('word-view')) {
          console.log('  Frame URL:', url.substring(0, 100));
        }
      }
    }

    // Wait more for rendering
    await page.waitForTimeout(10000);
    await shot(page, 'ready');

    // Try to find the document content area
    // Word Online typically renders inside an iframe
    const allFrames = page.frames();
    let docFrame = page;
    for (const f of allFrames) {
      const content = await f.evaluate(() => document.body?.innerText?.substring(0, 100) || '').catch(() => '');
      if (content && content.length > 50) {
        console.log('Found content frame:', content.substring(0, 80));
        docFrame = f;
        break;
      }
    }

    // Take screenshots by scrolling through the document
    console.log('\nScrolling through document pages...');

    // First, get total scrollable height
    const dims = await docFrame.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight || document.body.scrollHeight,
      clientHeight: document.documentElement.clientHeight || window.innerHeight,
      scrollTop: document.documentElement.scrollTop || document.body.scrollTop,
    })).catch(() => ({ scrollHeight: 0, clientHeight: 900, scrollTop: 0 }));

    console.log('Document dims:', JSON.stringify(dims));

    // Use Page Down to navigate
    const maxPages = 22;
    for (let i = 0; i < maxPages; i++) {
      await shot(page, `page_${String(i + 1).padStart(2, '0')}`);

      // Press Page Down
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(2000);

      // Check scroll position
      const pos = await page.evaluate(() => ({
        scrollTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop,
        scrollHeight: document.documentElement.scrollHeight || document.body.scrollHeight,
        clientHeight: window.innerHeight,
      })).catch(() => null);

      if (pos) {
        const atEnd = pos.scrollTop + pos.clientHeight >= pos.scrollHeight - 10;
        if (atEnd && i > 0) {
          console.log(`  Reached end of document at page ${i + 1}`);
          // Take one more for the last page
          await shot(page, `page_${String(i + 2).padStart(2, '0')}_end`);
          break;
        }
      }
    }

    console.log('\nDone! Screenshots saved to:', DIR);

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    await shot(page, 'error').catch(() => {});
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
