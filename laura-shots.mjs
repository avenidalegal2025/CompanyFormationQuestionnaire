import { chromium } from 'playwright';
const BASE = 'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// 1. Open session 41720501 (afternoon, 8286 screenshots)
await page.goto(`${BASE}/dashboard/sessions/41720501`, { waitUntil: 'domcontentloaded' });

// 2. Find rows that HAVE a "view" link in the Screenshot column
const viewLinks = await page.locator('a:has-text("view")').all();
console.log(`screenshot links found: ${viewLinks.length}`);

// Pick 5 evenly-spaced screenshots
const picks = [];
const step = Math.max(1, Math.floor(viewLinks.length / 5));
for (let i = 0; i < viewLinks.length && picks.length < 5; i += step) {
  const href = await viewLinks[i].getAttribute('href');
  picks.push(href);
}
console.log('picked links:', picks);

// 3. Fetch each screenshot via the /v1-prefixed URL (the link is /api/... — prepend stage)
import { writeFileSync } from 'fs';
for (let i = 0; i < picks.length; i++) {
  const fixedUrl = `${BASE.replace('/v1','')}/v1${picks[i]}`;
  console.log(`\nfetching: ${fixedUrl}`);
  const resp = await page.context().request.get(fixedUrl);
  console.log(`  status: ${resp.status()}`);
  console.log(`  content-type: ${resp.headers()['content-type']}`);
  if (resp.status() === 200) {
    const body = await resp.body();
    const path = `C:/tmp/laura-shot-${i+1}.jpg`;
    writeFileSync(path, body);
    console.log(`  saved ${path} (${body.length} bytes)`);
  }
}
await browser.close();
