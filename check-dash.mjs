import { chromium } from 'playwright';

const URLS = [
  'https://h25jz1ram5.execute-api.us-east-1.amazonaws.com/v1/dashboard',
  'https://d34ao76yaikywn.cloudfront.net/dashboard',
];

const browser = await chromium.launch({ headless: true });
for (const url of URLS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  console.log(`\n=== ${url} ===`);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`status: ${resp.status()}`);
    console.log(`title: ${await page.title()}`);
    const bodyText = (await page.evaluate(() => document.body.innerText)).substring(0, 200);
    console.log(`body preview: ${bodyText}`);
    const screenshotPath = `/tmp/dash-${url.includes('cloudfront') ? 'cf' : 'apigw'}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`screenshot: ${screenshotPath}`);
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
