/**
 * Open the Shareholder Agreement in Word Online (Office viewer) and screenshot every page.
 * Uses Playwright to navigate to the Word Online viewer and capture each page.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
mkdirSync(DIR, { recursive: true });

async function main() {
  // Generate fresh presigned URL
  console.log('Generating presigned URL...');
  const presigned = execSync(
    `aws s3 presign "s3://avenida-legal-documents/avenida-tech-inc-dgvzdcty/agreements/AVENIDA TECH Inc - Shareholder Agreement.docx" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();

  const encodedUrl = encodeURIComponent(presigned);
  const wordOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;

  console.log('Word Online URL generated.');
  console.log('Opening browser...\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  try {
    console.log('Navigating to Word Online viewer...');
    await page.goto(wordOnlineUrl, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(10000);

    // Take initial screenshot
    await page.screenshot({ path: join(DIR, 'word_online_001_initial.png'), fullPage: false });
    console.log('  [screenshot] word_online_001_initial.png');

    // Wait for the document to fully render
    console.log('Waiting for document to render...');
    await page.waitForTimeout(15000);

    // Take another screenshot after rendering
    await page.screenshot({ path: join(DIR, 'word_online_002_rendered.png'), fullPage: false });
    console.log('  [screenshot] word_online_002_rendered.png');

    // Try to find the page container and scroll through pages
    // Word Online renders pages as separate divs
    const pageCount = await page.evaluate(() => {
      // Try different selectors for Word Online page containers
      const pageContainers = document.querySelectorAll('[class*="Page"]');
      const canvasElements = document.querySelectorAll('canvas');
      const pageElements = document.querySelectorAll('.Page, .WACPageContainer, [data-page-number]');
      return {
        pageContainers: pageContainers.length,
        canvasElements: canvasElements.length,
        pageElements: pageElements.length,
        bodyHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    console.log('Page elements found:', JSON.stringify(pageCount));

    // Strategy: scroll the document and take screenshots at each viewport height
    const totalHeight = pageCount.bodyHeight;
    const viewportHeight = pageCount.viewportHeight;
    const numScreenshots = Math.ceil(totalHeight / viewportHeight);
    const maxPages = 25; // Safety limit

    console.log(`Taking up to ${Math.min(numScreenshots, maxPages)} page screenshots...`);

    for (let i = 0; i < Math.min(numScreenshots, maxPages); i++) {
      const scrollY = i * viewportHeight;
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(2000);

      const filename = `word_online_page_${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: join(DIR, filename), fullPage: false });
      console.log(`  [screenshot] ${filename} (scroll: ${scrollY}px)`);
    }

    // Also try to use the Word Online's page navigation if available
    // Some versions have page number buttons or keyboard shortcuts
    console.log('\nAttempting page-by-page navigation with Ctrl+End...');

    // Go back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Try pressing Page Down to navigate
    for (let i = 0; i < 21; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1500);

      const filename = `word_online_pgdn_${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: join(DIR, filename), fullPage: false });
      console.log(`  [screenshot] ${filename}`);

      // Check if we've reached the end
      const atEnd = await page.evaluate(() => {
        return (window.scrollY + window.innerHeight) >= (document.body.scrollHeight - 50);
      });
      if (atEnd) {
        console.log('  Reached end of document.');
        break;
      }
    }

    console.log('\nDone! Screenshots saved to:', DIR);

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: join(DIR, 'word_online_error.png'), fullPage: false }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
