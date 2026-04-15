/**
 * Open the Shareholder Agreement in Google Docs viewer and screenshot every page.
 * Uses Google Docs gview (no auth needed) as recommended in CLAUDE.md.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { execSync } from 'child_process';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = `gdocs_${String(shotN).padStart(3, '0')}_${label}.png`;
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

  const encodedUrl = encodeURIComponent(presigned);
  const gviewUrl = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;

  console.log('Google Docs viewer URL generated.');
  console.log('Opening browser...\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 1400 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Navigating to Google Docs viewer...');
    await page.goto(gviewUrl, { waitUntil: 'networkidle', timeout: 120000 });

    console.log('Waiting for document to render (20s)...');
    await page.waitForTimeout(20000);
    await shot(page, 'loaded');

    // Get page info
    const info = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText?.substring(0, 300) || 'empty',
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      iframes: document.querySelectorAll('iframe').length,
    }));
    console.log('Title:', info.title);
    console.log('Scroll height:', info.scrollH, 'Client height:', info.clientH);
    console.log('Text preview:', info.text.substring(0, 100));

    // Google Docs viewer renders pages as images
    // Check for page elements
    const pageElements = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      const pages = document.querySelectorAll('[class*="page"], [class*="Page"]');
      const noscript = document.querySelectorAll('noscript');
      return {
        imgs: imgs.length,
        pages: pages.length,
        noscript: noscript.length,
        allClasses: [...new Set([...document.querySelectorAll('*')].map(e => e.className).filter(c => c && typeof c === 'string'))].slice(0, 20),
      };
    });
    console.log('Images:', pageElements.imgs);
    console.log('Page elements:', pageElements.pages);
    console.log('Classes:', pageElements.allClasses.join(', '));

    // Scroll through the document taking screenshots
    console.log('\nScrolling through pages...');
    const totalPages = Math.ceil(info.scrollH / info.clientH) || 1;
    console.log('Estimated pages:', totalPages);

    const maxScreenshots = 25;
    let prevScrollTop = -1;

    for (let i = 0; i < maxScreenshots; i++) {
      const scrollY = i * info.clientH * 0.9; // 90% overlap
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(2000);

      await shot(page, `page_${String(i + 1).padStart(2, '0')}`);

      const currentScroll = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (currentScroll <= prevScrollTop && i > 0) {
        console.log(`  Reached end at screenshot ${i + 1}`);
        break;
      }
      prevScrollTop = currentScroll;

      // Check if we've passed the total height
      if (scrollY >= info.scrollH) {
        console.log(`  Past total height at screenshot ${i + 1}`);
        break;
      }
    }

    // Also try PageDown approach
    console.log('\nAlternative: PageDown navigation...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    prevScrollTop = -1;
    for (let i = 0; i < maxScreenshots; i++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1500);

      const currentScroll = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (currentScroll === prevScrollTop && i > 0) {
        console.log(`  PageDown reached end at ${i + 1}`);
        break;
      }
      prevScrollTop = currentScroll;

      await shot(page, `pgdn_${String(i + 1).padStart(2, '0')}`);
    }

    console.log('\nScreenshots saved to:', DIR);

  } catch (e) {
    console.error('Error:', e.message);
    await shot(page, 'error').catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
