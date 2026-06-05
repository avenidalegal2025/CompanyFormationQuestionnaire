import { chromium } from 'playwright';
const BASE = 'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await page.goto(`${BASE}/dashboard/sessions/41720501`, { waitUntil: 'domcontentloaded' });
// Inspect the Screenshot column for any links/clickable elements
const screenshotCells = await page.locator('td:nth-child(8), td:has-text(".jpg")').all();
console.log(`screenshot cells: ${screenshotCells.length}`);
for (let i = 0; i < Math.min(3, screenshotCells.length); i++) {
  const html = await screenshotCells[i].innerHTML();
  console.log(`cell[${i}]: ${html.substring(0, 300)}`);
}
console.log('\n=== full HTML of first 2 timeline rows ===');
const rows = await page.locator('table tr').all();
console.log(`rows: ${rows.length}`);
for (let i = 0; i < Math.min(3, rows.length); i++) {
  const html = await rows[i].innerHTML();
  console.log(`row[${i}]: ${html.substring(0, 500)}`);
}
console.log('\n=== try /dashboard/screenshots/{session_id} ===');
const r2 = await page.goto(`${BASE}/dashboard/screenshots/41720501`, { waitUntil: 'domcontentloaded' });
console.log(`status: ${r2.status()}`);
console.log(`title: ${await page.title()}`);
console.log(`# of img: ${await page.locator('img').count()}`);

console.log('\n=== try direct screenshot file ===');
const r3 = await page.goto(`${BASE}/screenshots/41720501/screenshot_00000002_20260428210308.jpg`, { waitUntil: 'domcontentloaded' });
console.log(`status: ${r3.status()}`);
console.log(`content-type: ${r3.headers()['content-type']}`);
await browser.close();
