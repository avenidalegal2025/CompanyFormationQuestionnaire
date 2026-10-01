// Layer 5: open each DOCX in Word Online's public viewer (presigned S3 link)
// one screenshot per page. Usage: node scripts/qa/word-online-pages.mjs <dir> [idPrefix...]
import { chromium } from 'playwright';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
const DIR = process.argv[2]; const only = process.argv.slice(3);
const files = readdirSync(DIR).filter(f => f.endsWith('.docx') && (!only.length || only.some(o => f.startsWith(o))));
const aws = (...a) => spawnSync('aws', [...a, '--profile', 'llc-admin', '--region', 'us-west-1'], { encoding: 'utf8' });
const browser = await chromium.launch({ headless: true });
async function one(f) {
  const id = basename(f, '.docx'); const out = join(DIR, 'shots', id);
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const key = `debug/oa-visual-check/${Date.now()}_${id}.docx`;
  if (aws('s3', 'cp', join(DIR, f), `s3://avenida-legal-documents/${key}`).status !== 0) throw new Error('upload failed');
  const url = aws('s3', 'presign', `s3://avenida-legal-documents/${key}`, '--expires-in', '3600').stdout.trim();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1300 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.goto(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let fr = null;
    for (let t = 0; t < 40 && !fr; t++) { await page.waitForTimeout(1500); fr = page.frames().find(x => x.url().includes('wordviewerframe')); }
    if (!fr) throw new Error('viewer frame not found');
    await fr.waitForSelector('#WACContainer .WACPageBorder', { timeout: 90000 });
    // total pages from the status bar "Page 1 of N"
    let total = 0;
    for (let t = 0; t < 30 && !total; t++) { const s = await fr.evaluate(() => document.body.innerText.match(/Page \d+ of (\d+)/)?.[1]).catch(() => null); total = +s || 0; if (!total) await page.waitForTimeout(1000); }
    for (let k = 0; k < total; k++) {
      // scroll so page k is at the top, then wait for it to paint
      await fr.evaluate((k) => { const c = document.getElementById('WACContainer'); const pages = c.querySelectorAll('.WACPageBorder'); const stride = c.scrollHeight / Number(document.body.innerText.match(/Page \d+ of (\d+)/)[1]); c.scrollTop = Math.round(stride * k); }, k);
      await page.waitForTimeout(1800);
      // Page k is the k-th page box counted from the top of the document;
      // pick the rendered box whose document offset matches it.
      const handle = await fr.evaluateHandle((k) => { const c = document.getElementById('WACContainer'); const stride = c.scrollHeight / Number(document.body.innerText.match(/Page \d+ of (\d+)/)[1]); const want = stride * k; let best = null, bd = 1e9; for (const el of c.querySelectorAll('.WACPageBorder')) { const docTop = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop; const d = Math.abs(docTop - want); if (d < bd) { bd = d; best = el; } } return best; }, k);
      const box = await handle.asElement().boundingBox();
      await page.screenshot({ path: join(out, `p${String(k + 1).padStart(2, '0')}.png`), clip: { x: box.x, y: Math.max(0, box.y), width: box.width, height: Math.min(box.height, 1300 - Math.max(0, box.y)) } });
    }
    console.log(`${id}: ${total} pages`);
  } finally { await ctx.close(); aws('s3', 'rm', `s3://avenida-legal-documents/${key}`); }
}
const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const f = queue.shift(); try { await one(f); } catch (e) { console.log('FAIL', f, e.message.slice(0, 120)); } } }));
await browser.close();
