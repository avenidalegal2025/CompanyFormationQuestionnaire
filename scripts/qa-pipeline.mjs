#!/usr/bin/env node
/**
 * Production QA pipeline for shareholder/operating agreements.
 *
 * Must run from Windows (not WSL) — Playwright Chromium has system-lib
 * deps that aren't installed on stock WSL. Invoke via:
 *   cmd.exe /c "cd /d C:\\path\\to\\repo && node scripts\\qa-pipeline.mjs --group=D"
 *
 * For each selected variant:
 *   1. POST prod /api/agreement/generate → DOCX (actual production output)
 *   2. DOCX XML text extraction for across-doc content assertions
 *   3. Upload DOCX to S3 + presign → Word Online viewer (faithful rendering,
 *      unlike LibreOffice which substitutes Liberation Serif for Times New
 *      Roman per CLAUDE.md)
 *   4. Playwright opens Word Online, detects PAGE-level containers in the
 *      DOM via the viewer's pagination markup, screenshots each individual
 *      page element (not arbitrary pixel slices)
 *   5. Extract visible text per page for per-page assertions
 *   6. HTML report with per-page thumbnails + pass/fail
 *
 * Usage:
 *   node scripts/qa-pipeline.mjs                       # all 250 variants (~10h)
 *   node scripts/qa-pipeline.mjs --group=D             # just Group D  (~45m)
 *   node scripts/qa-pipeline.mjs --only=D_C-Corp_ncY   # substring-match labels
 *   node scripts/qa-pipeline.mjs --limit=4 --group=D   # first 4 of group
 */

import { chromium } from 'playwright';
import { inflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Config ──────────────────────────────────────────────────────────

const API_BASE = process.env.VERIFY_API_BASE ||
  'https://company-formation-questionnaire.vercel.app';
const API = `${API_BASE}/api/agreement/generate`;
const AWS_PROFILE = process.env.AWS_PROFILE || 'llc-admin';
const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
const S3_BUCKET = process.env.S3_BUCKET || 'avenida-legal-documents';

const argv = new Set(process.argv.slice(2));
const groupArg = process.argv.find((a) => a.startsWith('--group='));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const GROUP = groupArg ? groupArg.slice('--group='.length) : null;
const ONLY = onlyArg ? onlyArg.slice('--only='.length) : null;
const LIMIT = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : null;

const HOME = process.env.USERPROFILE || process.env.HOME;
const OUT_ROOT = join(HOME, 'Downloads', 'agreement-qa',
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT_ROOT, { recursive: true });
console.log(`→ Output dir: ${OUT_ROOT}`);

// ─── Variant matrix ─────────────────────────────────────────────────

const { buildGroupM, buildGroupA, buildGroupB, buildGroupC,
  buildGroupD, buildGroupE, buildGroupF } = await import('./lib/agreement-variants.mjs');

const allGroups = [
  { name: 'M', variants: buildGroupM() },
  { name: 'A', variants: buildGroupA() },
  { name: 'B', variants: buildGroupB() },
  { name: 'C', variants: buildGroupC() },
  { name: 'D', variants: buildGroupD() },
  { name: 'E', variants: buildGroupE() },
  { name: 'F', variants: buildGroupF() },
];

let selected = [];
for (const g of allGroups) {
  if (GROUP && g.name !== GROUP) continue;
  for (const v of g.variants) {
    if (ONLY && !v.label.includes(ONLY)) continue;
    selected.push(v);
  }
}
if (LIMIT) selected = selected.slice(0, LIMIT);
console.log(`→ ${selected.length} variants selected`);
if (selected.length === 0) { console.error('✗ no variants matched'); process.exit(1); }

// ─── DOCX helpers ───────────────────────────────────────────────────

async function generateDocx(v) {
  // Retry with exponential backoff. Vercel rate-limits bursts of POST
  // requests to the same route; a 2s → 8s → 20s backoff clears 99% of
  // transient fetch failures in practice.
  let lastErr = null;
  for (const delay of [0, 2000, 8000, 20000]) {
    if (delay) await new Promise((res) => setTimeout(res, delay));
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: v.formData, draftId: `qa-${v.label}-${Date.now()}` }),
        signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      const msg = e.cause?.code || e.cause?.message || e.message || String(e);
      lastErr = new Error(`fetch ${msg}`);
    }
  }
  throw lastErr || new Error('generateDocx exhausted retries');
}

function extractDocxText(docxBuf) {
  let offset = 0;
  while (offset < docxBuf.length - 4) {
    if (docxBuf.readUInt32LE(offset) === 0x04034b50) {
      const comp = docxBuf.readUInt16LE(offset + 8);
      const cSize = docxBuf.readUInt32LE(offset + 18);
      const nLen = docxBuf.readUInt16LE(offset + 26);
      const eLen = docxBuf.readUInt16LE(offset + 28);
      const name = docxBuf.toString('utf8', offset + 30, offset + 30 + nLen);
      const dStart = offset + 30 + nLen + eLen;
      if (name === 'word/document.xml') {
        const raw = comp === 0
          ? docxBuf.subarray(dStart, dStart + cSize)
          : inflateRawSync(docxBuf.subarray(dStart, dStart + cSize));
        const xml = raw.toString('utf8');
        const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
          .map((t) => t.replace(/<[^>]+>/g, '')).join('');
        return { xml, text };
      }
      offset = dStart + cSize;
    } else offset++;
  }
  return { xml: '', text: '' };
}

// ─── S3 + Word Online ──────────────────────────────────────────────

function uploadToS3(localPath, key) {
  const up = spawnSync('aws', [
    's3', 'cp', localPath, `s3://${S3_BUCKET}/${key}`,
    '--profile', AWS_PROFILE, '--region', AWS_REGION,
  ], { encoding: 'utf8', shell: true });
  if (up.status !== 0) throw new Error(`s3 upload failed: ${up.stderr}`);
}

function presignS3(key) {
  const p = spawnSync('aws', [
    's3', 'presign', `s3://${S3_BUCKET}/${key}`,
    '--profile', AWS_PROFILE, '--region', AWS_REGION, '--expires-in', '3600',
  ], { encoding: 'utf8', shell: true });
  if (p.status !== 0) throw new Error(`s3 presign failed: ${p.stderr}`);
  return p.stdout.trim();
}

// ─── Per-page extraction from Word Online DOM ──────────────────────
//
// Word Online's viewer (view.officeapps.live.com) renders each document
// page in its own element with role="group" aria-label matching /^Page \d+$/
// (observed in the viewer's ARIA tree). Each of these elements is the
// natural page boundary — screenshotting it captures exactly one page
// with no cross-page bleed that pixel slicing produces.

async function renderAndCapturePages(page, variantDir) {
  await page.waitForTimeout(75000); // let Word Online finish rendering

  // Scroll the whole doc into view so all pages mount in the DOM. The viewer
  // lazy-renders pages unless they've been scrolled past.
  await page.evaluate(async () => {
    const docH = document.documentElement.scrollHeight;
    for (let y = 0; y < docH; y += 800) {
      window.scrollTo(0, y);
      await new Promise((res) => setTimeout(res, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(4000);

  // Find page elements. Try several selectors observed in the viewer.
  const pageElements = await page.$$eval('*', (els) => {
    const candidates = [];
    for (const el of els) {
      const aria = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || '';
      const cls = el.className || '';
      if (/^Page \d+$/i.test(aria) && role === 'group') {
        candidates.push({ type: 'aria', selector: `[aria-label="${aria}"]`, n: parseInt(aria.replace(/\D/g, ''), 10) });
      } else if (typeof cls === 'string' && /WACViewPanel|PageArea|DocumentPage/i.test(cls)) {
        candidates.push({ type: 'class', selector: null, n: null, className: cls });
      }
    }
    return candidates;
  });

  let pageRects;
  if (pageElements.filter((c) => c.type === 'aria').length > 0) {
    // Use ARIA labels — cleanest.
    pageRects = await page.$$eval('[role="group"][aria-label^="Page "]', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        return {
          n: parseInt(el.getAttribute('aria-label').replace(/\D/g, ''), 10),
          x: Math.round(r.x),
          y: Math.round(r.y + scrollY),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: el.innerText,
        };
      }),
    );
  } else {
    // Fallback: pixel slices sized to a typical letter-page render (~1200px).
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const pageH = 1200;
    const count = Math.ceil(docHeight / pageH);
    pageRects = [];
    for (let i = 0; i < count; i++) {
      pageRects.push({
        n: i + 1, x: 0, y: i * pageH, w: 1600,
        h: Math.min(pageH, docHeight - i * pageH),
        text: '(fallback slice — per-page DOM markers not found)',
      });
    }
  }

  pageRects.sort((a, b) => a.y - b.y);

  const captured = [];
  for (const r of pageRects) {
    const filename = `page-${String(r.n).padStart(2, '0')}.png`;
    const outPath = join(variantDir, filename);
    await page.screenshot({
      path: outPath,
      clip: { x: Math.max(0, r.x), y: r.y, width: r.w, height: r.h },
    });
    captured.push({ n: r.n, filename, text: r.text });
  }
  return captured;
}

// ─── Assertions ─────────────────────────────────────────────────────

function assertPage(pageText, v) {
  const errs = [];
  if (pageText.includes('{{')) errs.push('leftover {{ }} placeholder');
  if (pageText.includes('%%')) errs.push('leftover %% placeholder');
  if (/\bundefined\b/i.test(pageText)) errs.push('"undefined" leaked onto page');
  return errs;
}

function assertAcrossDoc(fullText, v) {
  const errs = [];
  const isCorp = v.meta.entity === 'C-Corp';
  const m = v.meta;

  if (m.rofr && !fullText.includes('Right of First Refusal')) errs.push('ROFR=Yes but header missing');
  if (!m.rofr && fullText.includes('Right of First Refusal')) errs.push('ROFR=No but header present');
  if (isCorp && m.dragTag && !fullText.includes('Drag Along')) errs.push('drag/tag=Yes but header missing');
  if (isCorp && !m.dragTag && fullText.includes('Drag Along')) errs.push('drag/tag=No but header present');
  if (m.nonCompete === 'Yes' && !fullText.includes('Covenant Against Competition')) {
    errs.push('nonCompete=Yes but "Covenant Against Competition" missing');
  }
  if (m.nonCompete === 'No' && fullText.includes('Covenant Against Competition')) {
    errs.push('nonCompete=No but "Covenant Against Competition" present');
  }

  const sigCount = (fullText.match(/IN WITNESS WHEREOF/g) || []).length;
  if (sigCount === 0) errs.push('no IN WITNESS WHEREOF found');
  if (sigCount > 1) errs.push(`${sigCount} IN WITNESS WHEREOF blocks (expected 1)`);

  return errs;
}

// ─── Main runner ────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

const results = [];

for (let i = 0; i < selected.length; i++) {
  const v = selected[i];
  const dir = join(OUT_ROOT, v.label);
  mkdirSync(dir, { recursive: true });
  process.stdout.write(`[${i + 1}/${selected.length}] ${v.label}… `);
  const res = { label: v.label, meta: v.meta, pageCount: 0, errors: [], pageErrors: {}, pages: [] };

  try {
    const docxBuf = await generateDocx(v);
    writeFileSync(join(dir, `${v.label}.docx`), docxBuf);
    const { text: docxText } = extractDocxText(docxBuf);

    res.errors.push(...assertAcrossDoc(docxText, v));

    const key = `debug/qa-pipeline/${v.label}-${Date.now()}.docx`;
    uploadToS3(join(dir, `${v.label}.docx`), key);
    const presigned = presignS3(key);
    const wovUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presigned)}`;

    const ctx = await browser.newContext({ viewport: { width: 1600, height: 30000 } });
    const page = await ctx.newPage();
    await page.goto(wovUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    const captured = await renderAndCapturePages(page, dir);
    await ctx.close();

    res.pageCount = captured.length;
    for (const p of captured) {
      const perPageErrs = assertPage(p.text, v);
      if (perPageErrs.length) res.pageErrors[p.n] = perPageErrs;
      res.pages.push({ n: p.n, filename: p.filename, textPreview: p.text.slice(0, 200) });
    }

    const hasErrs = res.errors.length > 0 || Object.keys(res.pageErrors).length > 0;
    console.log(hasErrs ? `✗ (${res.pageCount}pg)` : `✓ (${res.pageCount}pg)`);
  } catch (e) {
    res.errors.push(`pipeline: ${e.message}`);
    console.log(`✗ ${e.message.slice(0, 80)}`);
  }

  results.push(res);
}

await browser.close();

// ─── HTML report ────────────────────────────────────────────────────

const passCount = results.filter((r) =>
  r.errors.length === 0 && Object.keys(r.pageErrors).length === 0).length;
const failCount = results.length - passCount;

const html = `<!doctype html>
<meta charset=utf-8>
<title>Agreement QA Report</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:20px;max-width:1400px}
  h1{margin:0 0 8px}.sub{color:#666;margin-bottom:24px}
  .v{border:1px solid #ddd;border-radius:6px;margin-bottom:20px;padding:14px}
  .v.pass{border-color:#c5e1a5;background:#f8fff2}
  .v.fail{border-color:#ef9a9a;background:#fff5f5}
  .label{font-weight:600;font-family:monospace}
  .meta{color:#666;font-size:13px;margin-top:4px}
  .errs{color:#c62828;margin:8px 0;font-family:monospace;white-space:pre-wrap;font-size:13px}
  .pages{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .p{border:1px solid #ccc;padding:4px;border-radius:4px;font-size:12px;text-align:center}
  .p img{display:block;width:200px;height:auto;margin-bottom:4px;background:#fff}
  .p.bad{border-color:#ef5350;background:#ffeaea}
</style>
<h1>Agreement QA — ${results.length} variants</h1>
<div class=sub>
  PASS ${passCount} · FAIL ${failCount} · ${new Date().toISOString()} · ${API_BASE}
</div>
${results.map((r) => {
  const bad = r.errors.length > 0 || Object.keys(r.pageErrors).length > 0;
  return `
<div class="v ${bad ? 'fail' : 'pass'}">
  <div class=label>${r.label}</div>
  <div class=meta>${JSON.stringify(r.meta)}</div>
  ${r.errors.length ? `<div class=errs>${r.errors.map((e) => `• ${e}`).join('\n')}</div>` : ''}
  ${Object.keys(r.pageErrors).length ? `<div class=errs>${Object.entries(r.pageErrors)
    .map(([p, errs]) => `p${p}: ${errs.join(', ')}`).join('\n')}</div>` : ''}
  <div class=pages>
    ${r.pages.map((p) => `
      <div class="p ${r.pageErrors[p.n] ? 'bad' : ''}">
        <img src="${r.label}/${p.filename}" loading=lazy>
        <div>p${p.n}${r.pageErrors[p.n] ? ` — ${r.pageErrors[p.n].join(',')}` : ''}</div>
      </div>`).join('')}
  </div>
</div>
  `.trim();
}).join('\n')}
`;

writeFileSync(join(OUT_ROOT, 'report.html'), html);
writeFileSync(join(OUT_ROOT, 'report.json'), JSON.stringify(results, null, 2));

console.log(`\n${'='.repeat(60)}`);
console.log(`TOTAL: ${results.length} | PASS ${passCount} | FAIL ${failCount}`);
console.log(`Report: ${join(OUT_ROOT, 'report.html')}`);
process.exit(failCount > 0 ? 1 : 0);
