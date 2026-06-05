import { chromium } from 'playwright';

const BASE = 'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const URLS = [
  `${BASE}/dashboard/sessions/41720501`,
  `${BASE}/dashboard/sessions/41696146`,
];

for (const url of URLS) {
  console.log(`\n=== ${url} ===`);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(`status: ${resp.status()}`);
  console.log(`title: ${await page.title()}`);
  const body = (await page.evaluate(() => document.body.innerText)).substring(0, 400);
  console.log('--- body preview ---');
  console.log(body);
  const imgs = await page.locator('img').all();
  console.log(`# of <img>: ${imgs.length}`);
  if (imgs.length > 0) {
    for (let i = 0; i < Math.min(3, imgs.length); i++) {
      console.log(`  img[${i}].src: ${await imgs[i].getAttribute('src')}`);
    }
  }
  const sid = url.split('/').pop();
  await page.screenshot({ path: `C:/tmp/sess-${sid}.png`, fullPage: false });
  console.log(`saved C:/tmp/sess-${sid}.png`);
}
await browser.close();
