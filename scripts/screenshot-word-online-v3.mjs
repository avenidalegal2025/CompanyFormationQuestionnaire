/**
 * Open the Shareholder Agreement in Word Online viewer and screenshot every page.
 * Uses headless Playwright with new headless mode for better compatibility.
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

  console.log('Opening headless browser...\n');

  // Use new headless mode
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Navigating to Word Online viewer...');
    await page.goto(wordOnlineUrl, { waitUntil: 'load', timeout: 120000 });

    // Wait for initial rendering
    console.log('Waiting for document to render (40s)...');
    await page.waitForTimeout(40000);
    await shot(page, 'loaded');

    // Get page info
    const info = await page.evaluate(() => ({
      title: document.title,
      bodyLen: document.body?.innerHTML?.length || 0,
      text: document.body?.innerText?.substring(0, 300) || 'empty',
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      iframes: document.querySelectorAll('iframe').length,
    }));
    console.log('Title:', info.title);
    console.log('Body length:', info.bodyLen);
    console.log('Text:', info.text.substring(0, 100));
    console.log('Scroll height:', info.scrollH, 'Client height:', info.clientH);
    console.log('Iframes:', info.iframes);

    // If the content is in an iframe, try to access it
    let targetFrame = page;
    const frames = page.frames();
    console.log('Total frames:', frames.length);

    for (const f of frames) {
      if (f === page.mainFrame()) continue;
      try {
        const frameText = await f.evaluate(() => document.body?.innerText?.substring(0, 100) || '');
        if (frameText && frameText.length > 20) {
          console.log('Content frame found:', frameText.substring(0, 80));
          targetFrame = f;
        }
      } catch (e) {
        // Cross-origin frame
      }
    }

    // Scroll through the document taking screenshots
    // With Word Online, scrolling happens within the viewer
    console.log('\nScrolling and taking screenshots...');

    const maxScreenshots = 25;
    let prevScrollTop = -1;

    for (let i = 0; i < maxScreenshots; i++) {
      await shot(page, `page_${String(i + 1).padStart(2, '0')}`);

      // Try multiple scroll strategies
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(2000);

      // Check if scroll changed
      const currentScroll = await page.evaluate(() =>
        window.scrollY || document.documentElement.scrollTop || document.body.scrollTop
      ).catch(() => 0);

      if (currentScroll === prevScrollTop && i > 0) {
        // Scroll didn't change -- try mouse wheel
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(1500);

        const newScroll = await page.evaluate(() =>
          window.scrollY || document.documentElement.scrollTop || document.body.scrollTop
        ).catch(() => 0);

        if (newScroll === prevScrollTop) {
          console.log(`  No more scrolling at page ${i + 1}`);
          break;
        }
      }

      prevScrollTop = currentScroll;
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
