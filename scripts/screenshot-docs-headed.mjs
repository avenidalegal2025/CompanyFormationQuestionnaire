/**
 * Screenshot all PIXEL PERFECT documents via Google Docs Viewer using HEADED Playwright.
 * Uses headless:false to get proper rendering of Google Docs iframe pages.
 * Scrolls through the document using page navigation controls built into gview.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { execSync } from 'child_process';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'pixel-perfect-qa');
mkdirSync(DIR, { recursive: true });

const S3_BUCKET = 'avenida-legal-documents';

function getPresignedUrl(s3Key) {
  return execSync(
    `aws s3 presign "s3://${S3_BUCKET}/${s3Key}" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8' }
  ).trim();
}

function getGoogleViewerUrl(presignedUrl) {
  return `https://docs.google.com/gview?url=${encodeURIComponent(presignedUrl)}&embedded=true`;
}

async function screenshotDoc(page, docName, s3Key) {
  console.log(`\n=== ${docName.toUpperCase()} ===`);
  const presignedUrl = getPresignedUrl(s3Key);
  const viewerUrl = getGoogleViewerUrl(presignedUrl);
  console.log('  Loading...');

  await page.goto(viewerUrl, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // Google Docs embedded viewer renders inside an iframe.
  // The page indicator shows "Page X / Y" at the bottom.
  // We need to find the total pages and navigate through them.

  // Try to find the page count from the viewer
  let totalPages = 1;
  const pageText = await page.evaluate(() => {
    // Look for page indicator elements
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.children.length === 0 && /Page\s+\d+\s*\/\s*\d+/.test(el.textContent)) {
        return el.textContent.trim();
      }
    }
    // Try inside iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iDoc) continue;
        const iEls = iDoc.querySelectorAll('*');
        for (const el of iEls) {
          if (el.children.length === 0 && /Page\s+\d+\s*\/\s*\d+/.test(el.textContent)) {
            return el.textContent.trim();
          }
        }
      } catch {}
    }
    return '';
  });

  const match = pageText.match(/Page\s+(\d+)\s*\/\s*(\d+)/);
  if (match) {
    totalPages = parseInt(match[2]);
    console.log(`  Pages detected: ${totalPages}`);
  } else {
    console.log(`  Page count not detected, will scroll until end. Text: "${pageText}"`);
    totalPages = 30; // Max we'll try
  }

  // Screenshot page 1
  const fname1 = `${docName}_p01.png`;
  await page.screenshot({ path: join(DIR, fname1) });
  console.log(`  Saved: ${fname1}`);

  // Navigate pages by clicking in the document area and pressing Page Down
  // First click inside the document to give it focus
  await page.mouse.click(700, 400);
  await page.waitForTimeout(500);

  let prevPageIndicator = '1';
  for (let p = 2; p <= totalPages; p++) {
    // Use keyboard to navigate to next page
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(1500);

    // Check current page
    const currentPageText = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        if (el.children.length === 0 && /Page\s+\d+\s*\/\s*\d+/.test(el.textContent)) {
          return el.textContent.trim();
        }
      }
      return '';
    });

    const currentMatch = currentPageText.match(/Page\s+(\d+)/);
    const currentPage = currentMatch ? currentMatch[1] : String(p);

    // If page hasn't changed after PageDown, we're at the end
    if (currentPage === prevPageIndicator && p > 2) {
      // Try one more time with a different approach
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);

      const retryText = await page.evaluate(() => {
        const els = document.querySelectorAll('*');
        for (const el of els) {
          if (el.children.length === 0 && /Page\s+\d+\s*\/\s*\d+/.test(el.textContent)) {
            return el.textContent.trim();
          }
        }
        return '';
      });
      const retryMatch = retryText.match(/Page\s+(\d+)/);
      if (retryMatch && retryMatch[1] === prevPageIndicator) {
        console.log(`  End of document at page ${prevPageIndicator}`);
        break;
      }
    }
    prevPageIndicator = currentPage;

    const fname = `${docName}_p${String(p).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(DIR, fname) });
    console.log(`  Saved: ${fname} (${currentPageText || 'no indicator'})`);
  }
}

async function main() {
  console.log('=== PIXEL PERFECT DOCUMENT SCREENSHOTS (HEADED) ===');
  console.log('Output: ' + DIR);

  const browser = await chromium.launch({ headless: false, args: ['--window-size=1400,950'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  // Document 1: Membership Registry
  await screenshotDoc(page, 'membership_registry', 'uat/pixel-perfect/membership-registry.docx');

  // Document 2: Organizational Resolution
  await screenshotDoc(page, 'organizational_resolution', 'uat/pixel-perfect/organizational-resolution.docx');

  // Document 3: Operating Agreement (MOST IMPORTANT)
  await screenshotDoc(page, 'operating_agreement', 'uat/pixel-perfect/operating-agreement.docx');

  // Document 4: Form 2848 (PDF)
  console.log('\n=== FORM_2848 ===');
  const pdfPresigned = getPresignedUrl('uat/pixel-perfect/form-2848.pdf');
  const pdfViewerUrl = getGoogleViewerUrl(pdfPresigned);
  console.log('  Loading PDF...');
  await page.goto(pdfViewerUrl, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(10000);

  await page.screenshot({ path: join(DIR, 'form_2848_p01.png') });
  console.log('  Saved: form_2848_p01.png');

  // Scroll down for page 2
  await page.mouse.click(700, 400);
  await page.waitForTimeout(500);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(DIR, 'form_2848_p02.png') });
  console.log('  Saved: form_2848_p02.png');

  await browser.close();
  console.log('\n=== ALL SCREENSHOTS COMPLETE ===');
  console.log('Output directory: ' + DIR);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
