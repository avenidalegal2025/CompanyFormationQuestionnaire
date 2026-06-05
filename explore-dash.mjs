import { chromium } from 'playwright';

const BASE = 'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

console.log('=== 1. open dashboard ===');
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
console.log('title:', await page.title());

console.log('\n=== 2. click into Laura session 41720501 (afternoon, 8286 screenshots) ===');
const link = page.locator('a:has-text("41720501")').first();
const linkExists = await link.count();
console.log('link found:', linkExists);
if (linkExists) {
  const href = await link.getAttribute('href');
  console.log('href:', href);
  await link.click();
  await page.waitForLoadState('domcontentloaded');
  console.log('new URL:', page.url());
  console.log('new title:', await page.title());
  await page.screenshot({ path: 'C:/tmp/laura-session.png', fullPage: false });
  console.log('saved C:/tmp/laura-session.png');
  const bodyText = (await page.evaluate(() => document.body.innerText)).substring(0, 800);
  console.log('--- body preview ---');
  console.log(bodyText);
  console.log('--- end body preview ---');

  // Look for image elements (screenshots embedded?)
  const imgs = await page.locator('img').all();
  console.log(`\n# of <img> on page: ${imgs.length}`);
  for (let i = 0; i < Math.min(5, imgs.length); i++) {
    const src = await imgs[i].getAttribute('src');
    console.log(`  img[${i}]: ${src}`);
  }

  // Look for links to other pages from the session view
  const subLinks = await page.locator('a').all();
  console.log(`\n# of <a> on page: ${subLinks.length}`);
  for (let i = 0; i < Math.min(15, subLinks.length); i++) {
    const t = await subLinks[i].textContent();
    const h = await subLinks[i].getAttribute('href');
    console.log(`  a[${i}]: "${t?.trim().substring(0,50)}" → ${h}`);
  }
}
await browser.close();
