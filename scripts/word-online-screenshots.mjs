/**
 * Opens each agreement variant in Word Online and screenshots every page.
 * Uses Playwright to navigate Word Online's page thumbnails.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, readdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const VARIANTS_DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'agreement-variants');
const SCREENSHOTS_DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'word-online-screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const S3_BUCKET = 'avenida-legal-documents';

async function getPresignedUrl(s3Key) {
  const url = execSync(
    `aws s3 presign "s3://${S3_BUCKET}/${s3Key}" --profile llc-admin --region us-west-1 --expires-in 3600`,
    { encoding: 'utf8' }
  ).trim();
  return url;
}

function getWordOnlineUrl(presignedUrl) {
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presignedUrl)}`;
}

async function screenshotAllPages(page, docName, totalPages) {
  const docDir = join(SCREENSHOTS_DIR, docName);
  mkdirSync(docDir, { recursive: true });

  for (let p = 1; p <= totalPages; p++) {
    // Navigate to specific page by setting the page via the scrollbar position
    // Word Online renders pages sequentially — scroll to approximate position
    const scrollPct = (p - 1) / (totalPages - 1 || 1);

    // Use JavaScript to scroll the iframe content
    await page.evaluate(async (pct) => {
      // Find the scrollable container inside the Word Online viewer
      const iframe = document.querySelector('iframe');
      if (iframe && iframe.contentDocument) {
        const body = iframe.contentDocument.body || iframe.contentDocument.documentElement;
        body.scrollTop = body.scrollHeight * pct;
      } else {
        // Try scrolling the main page
        window.scrollTo(0, document.documentElement.scrollHeight * pct);
      }
    }, scrollPct);

    await page.waitForTimeout(1500);
    const path = join(docDir, `page_${String(p).padStart(2, '0')}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`    Page ${p}/${totalPages} -> ${docName}/page_${String(p).padStart(2, '0')}.png`);
  }
}

async function main() {
  // Upload all variants to S3
  const files = readdirSync(VARIANTS_DIR).filter(f => f.endsWith('.docx'));
  console.log(`Found ${files.length} variants to check.\n`);

  const s3Keys = {};
  for (const file of files) {
    const s3Key = `uat/word-online/${file}`;
    const localPath = join(VARIANTS_DIR, file);
    execSync(`aws s3 cp "${localPath}" "s3://${S3_BUCKET}/${s3Key}" --profile llc-admin --region us-west-1`, { stdio: 'pipe' });
    s3Keys[file] = s3Key;
    console.log(`  Uploaded: ${file} -> s3://${S3_BUCKET}/${s3Key}`);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  for (const file of files) {
    const docName = file.replace('.docx', '');
    console.log(`\n══ ${docName} ══`);

    const presignedUrl = await getPresignedUrl(s3Keys[file]);
    const wordUrl = getWordOnlineUrl(presignedUrl);

    await page.goto(wordUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(8000);

    // Check if loaded
    const title = await page.title();
    console.log(`  Title: ${title}`);

    if (title.includes('error') || title.includes('Error')) {
      console.log('  FAILED to load in Word Online, skipping');
      continue;
    }

    // Get total pages from the page indicator (e.g., "Página 1 de 21")
    // Word Online renders in an iframe — page count is in the outer frame's footer
    // Try to find it via accessible text or just use a fixed approach
    const pageText = await page.locator('text=/Page \\d+ of \\d+/').first().textContent({ timeout: 3000 }).catch(() => '');
    const pageMatch = pageText.match(/Page\s*(\d+)\s*of\s*(\d+)/);
    const totalPages = pageMatch ? parseInt(pageMatch[2]) : 21; // default to 21 for Corp
    console.log(`  Pages: ${totalPages} (detected: ${!!pageMatch})`);

    const docDir = join(SCREENSHOTS_DIR, docName);
    mkdirSync(docDir, { recursive: true });

    // Screenshot page 1
    await page.screenshot({ path: join(docDir, 'page_01.png'), fullPage: false });
    console.log(`    Page 1/${totalPages}`);

    // Navigate pages by clicking inside the document area first, then using Page Down
    // The Word Online viewer is in an iframe - we need to click inside it to give focus
    // The document content area is roughly in the center of the viewport
    await page.mouse.click(660, 450);
    await page.waitForTimeout(500);

    // Use the iframe directly
    const frame = page.frameLocator('iframe').first();

    for (let p = 2; p <= totalPages; p++) {
      // Press Ctrl+Down or Page Down multiple times to scroll one page
      // Word Online uses the iframe for rendering — try keyboard in the main page
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1000);

      await page.screenshot({ path: join(docDir, `page_${String(p).padStart(2, '0')}.png`), fullPage: false });

      // Read page indicator from the footer area
      const footerText = await page.evaluate(() => {
        // The footer with "Page X of Y" is in the outer frame
        const els = document.querySelectorAll('*');
        for (const el of els) {
          if (el.children.length === 0 && /Page \d+ of \d+/.test(el.textContent)) {
            return el.textContent.trim();
          }
        }
        return '';
      });

      console.log(`    Page ${p}/${totalPages} ${footerText ? '(' + footerText + ')' : ''}`);
    }
  }

  await browser.close();
  console.log(`\n\nAll screenshots saved to: ${SCREENSHOTS_DIR}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
