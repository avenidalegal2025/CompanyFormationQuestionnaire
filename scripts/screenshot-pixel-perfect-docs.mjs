/**
 * Screenshot all PIXEL PERFECT documents via Google Docs Viewer.
 * Downloads each doc from S3, opens in Google Docs Viewer, scrolls through all pages,
 * and saves screenshots to pixel-perfect-qa directory.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { execSync } from 'child_process';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'pixel-perfect-qa');
mkdirSync(DIR, { recursive: true });

const S3_BUCKET = 'avenida-legal-documents';

const DOCS = [
  { name: 'membership_registry', s3Key: 'uat/pixel-perfect/membership-registry.docx', expectedPages: 1 },
  { name: 'organizational_resolution', s3Key: 'uat/pixel-perfect/organizational-resolution.docx', expectedPages: 6 },
  { name: 'operating_agreement', s3Key: 'uat/pixel-perfect/operating-agreement.docx', expectedPages: 20 },
];

function getPresignedUrl(s3Key) {
  return execSync(
    `aws s3 presign "s3://${S3_BUCKET}/${s3Key}" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8' }
  ).trim();
}

function getGoogleViewerUrl(presignedUrl) {
  return `https://docs.google.com/gview?url=${encodeURIComponent(presignedUrl)}&embedded=true`;
}

async function main() {
  console.log('=== PIXEL PERFECT DOCUMENT SCREENSHOT TOOL ===');
  console.log('Output: ' + DIR);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  for (const doc of DOCS) {
    console.log(`\n=== ${doc.name.toUpperCase()} ===`);

    // Generate presigned URL
    const presignedUrl = getPresignedUrl(doc.s3Key);
    const viewerUrl = getGoogleViewerUrl(presignedUrl);
    console.log('  Loading in Google Docs Viewer...');

    await page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(8000);

    // Check if loaded successfully
    const title = await page.title();
    console.log('  Title: ' + title);

    // Google Docs viewer renders as images in an iframe. The pages are rendered as
    // individual page images inside a scrollable container.
    // We need to scroll through the entire document and screenshot each viewport.

    // First, get the total height to determine page count
    const docInfo = await page.evaluate(() => {
      // Google viewer renders pages as img elements inside a div
      const imgs = document.querySelectorAll('img[src*="pagenumber"]');
      if (imgs.length > 0) return { pageImages: imgs.length, method: 'pagenumber' };

      // Alternative: Look for page divs
      const pages = document.querySelectorAll('[class*="ndfHFb-c4YZDc-cYAaBc-DARUcf"]');
      if (pages.length > 0) return { pageImages: pages.length, method: 'pageClass' };

      // Check for any images that could be pages
      const allImgs = document.querySelectorAll('img');
      const largeImgs = Array.from(allImgs).filter(img => img.width > 500 && img.height > 500);
      if (largeImgs.length > 0) return { pageImages: largeImgs.length, method: 'largeImgs' };

      return { pageImages: 0, method: 'none', bodyHeight: document.body.scrollHeight };
    });

    console.log('  Doc info: ' + JSON.stringify(docInfo));

    // Screenshot the first visible page
    let pageNum = 1;
    const fname = `${doc.name}_p${String(pageNum).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(DIR, fname) });
    console.log(`  Saved: ${fname}`);

    // Scroll down and capture more pages
    // Google Docs viewer scrollable container
    let prevScrollTop = -1;
    let maxScrollAttempts = doc.expectedPages * 3; // generous limit
    let scrollAttempt = 0;

    while (scrollAttempt < maxScrollAttempts) {
      // Scroll down by roughly one page height
      const scrollResult = await page.evaluate(() => {
        const scrollable = document.querySelector('.ndfHFb-c4YZDc-Wrber') ||
                          document.querySelector('[role="document"]') ||
                          document.documentElement;
        const before = scrollable.scrollTop;
        scrollable.scrollBy(0, 850);
        // Also try window scroll
        window.scrollBy(0, 850);
        return {
          scrollTop: scrollable.scrollTop,
          scrollHeight: scrollable.scrollHeight,
          clientHeight: scrollable.clientHeight,
          before
        };
      });

      await page.waitForTimeout(1500);

      // Check if scroll position changed
      if (scrollResult.scrollTop === prevScrollTop && scrollAttempt > 0) {
        // Try keyboard scroll as fallback
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(1000);

        const newPos = await page.evaluate(() => {
          const scrollable = document.querySelector('.ndfHFb-c4YZDc-Wrber') ||
                            document.querySelector('[role="document"]') ||
                            document.documentElement;
          return scrollable.scrollTop;
        });

        if (newPos === prevScrollTop) {
          console.log('  Reached end of document');
          break;
        }
        prevScrollTop = newPos;
      } else {
        prevScrollTop = scrollResult.scrollTop;
      }

      pageNum++;
      const fname2 = `${doc.name}_p${String(pageNum).padStart(2, '0')}.png`;
      await page.screenshot({ path: join(DIR, fname2) });
      console.log(`  Saved: ${fname2}`);
      scrollAttempt++;
    }

    console.log(`  Total screenshots: ${pageNum}`);
  }

  // Now do PDF (Form 2848) separately - Google Docs Viewer handles PDFs differently
  console.log('\n=== FORM 2848 (PDF) ===');
  const pdfPresigned = getPresignedUrl('uat/pixel-perfect/form-2848.pdf');
  const pdfViewerUrl = getGoogleViewerUrl(pdfPresigned);
  console.log('  Loading PDF in Google Docs Viewer...');

  await page.goto(pdfViewerUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // Screenshot page 1
  await page.screenshot({ path: join(DIR, 'form_2848_p01.png') });
  console.log('  Saved: form_2848_p01.png');

  // Scroll to page 2
  await page.evaluate(() => {
    const scrollable = document.querySelector('.ndfHFb-c4YZDc-Wrber') ||
                      document.querySelector('[role="document"]') ||
                      document.documentElement;
    scrollable.scrollBy(0, 900);
    window.scrollBy(0, 900);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(DIR, 'form_2848_p02.png') });
  console.log('  Saved: form_2848_p02.png');

  // Try page 3
  await page.evaluate(() => {
    const scrollable = document.querySelector('.ndfHFb-c4YZDc-Wrber') ||
                      document.querySelector('[role="document"]') ||
                      document.documentElement;
    scrollable.scrollBy(0, 900);
    window.scrollBy(0, 900);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(DIR, 'form_2848_p03.png') });
  console.log('  Saved: form_2848_p03.png');

  await browser.close();
  console.log('\n=== ALL SCREENSHOTS COMPLETE ===');
  console.log('Output directory: ' + DIR);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
