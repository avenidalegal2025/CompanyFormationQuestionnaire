import { chromium } from 'playwright';
const BASE = 'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

console.log('=== 1. open dashboard ===');
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
console.log('title:', await page.title());

console.log('\n=== 2. CLICK Laura session 41720501 (the broken flow before) ===');
const r = await Promise.all([
  page.waitForLoadState('domcontentloaded'),
  page.locator('a:has-text("41720501")').first().click(),
]);
console.log('new URL:', page.url());
console.log('new title:', await page.title());
const body = (await page.evaluate(() => document.body.innerText)).substring(0, 300);
console.log('body preview:', body);

console.log('\n=== 3. CLICK first "view" screenshot link ===');
const viewLink = page.locator('a:has-text("view")').first();
const viewHref = await viewLink.getAttribute('href');
console.log('view href:', viewHref);
const ssResp = await page.context().request.get(viewHref.startsWith('http') ? viewHref : `https://h25jz1ram5.execute-api.us-east-1.amazonaws.com${viewHref}`);
console.log('screenshot status:', ssResp.status(), 'content-type:', ssResp.headers()['content-type']);

console.log('\n=== 4. verify navigation back works ===');
await page.locator('a:has-text("Back to sessions")').first().click();
await page.waitForLoadState('domcontentloaded');
console.log('back URL:', page.url());
console.log('back title:', await page.title());

await page.screenshot({ path: 'C:/tmp/dash-fixed.png', fullPage: false });
console.log('saved C:/tmp/dash-fixed.png');
await browser.close();
