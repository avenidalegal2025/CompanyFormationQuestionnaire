#!/usr/bin/env node
/**
 * Visual review of pre-rendered UI sweep PNGs via Claude Haiku 4.5 vision.
 * Skips DOCX→PDF (LibreOffice) — directly reads page-NN.png files saved by
 * qa-ui-pipeline.mjs from Word Online. More faithful to what users actually
 * see, and works when LibreOffice is broken.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/visual-review-ui-pngs.mjs \
 *     --root <agreement-qa-ui timestamp dir> \
 *     [--label "Operating Agreement"|"Shareholders' Agreement"|...] \
 *     [--only <substring>] [--concurrency 6] [--out <path>]
 *
 * Variant detection: walks subdirs of --root; each subdir's name is the
 * variant label, and contains page-NN.png files.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const ROOT = arg("--root");
const ONLY = arg("--only");
const OUT_PATH = arg("--out", ROOT ? join(ROOT, "visual-review-pngs.json") : null);
const CONCURRENCY = parseInt(arg("--concurrency", "6"), 10);
const LABEL_OVERRIDE = arg("--label");

if (!ROOT || !existsSync(ROOT)) {
  console.error("Usage: --root <agreement-qa-ui timestamp dir>");
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY required");
  process.exit(2);
}

function detectLabel(variantName) {
  if (LABEL_OVERRIDE) return LABEL_OVERRIDE;
  if (/_LLC_/i.test(variantName)) return "Operating Agreement";
  if (/_Corp_/i.test(variantName)) return "Shareholders' Agreement";
  return "legal agreement";
}

const promptFor = (label) =>
  `You are reviewing one page of a legal ${label}. ` +
  "ONLY flag issues that are CLEARLY visible at this resolution. Be very conservative — " +
  "if you can't tell with certainty, do not flag. " +
  "Patterns to flag (require visible pixel-level evidence): " +
  "(1) UNDERLINE BOUNDARIES — flag ONLY if the underline visibly extends UNDER the digits of a section number " +
  "(e.g. you see a continuous line under '4.1' AND under 'Authorized Shares'). If the underline starts AFTER " +
  "the space following the number, that's CORRECT — do not flag. " +
  "(2) NUMBERING SEQUENCE — flag if you can read consecutive labels and one is missing " +
  "(e.g. you see '(a)' then '(c)' with no '(b)'). " +
  "(3) ORPHAN HEADING — flag ONLY if a section heading is the LAST visible content on the page with " +
  "no body text below it on the same page. " +
  "(4) MISALIGNED INDENT — flag if a sub-paragraph starts at a horizontal position that's clearly different " +
  "from its siblings in the same list. " +
  "(5) MISSING LABEL — flag if a paragraph appears to be a list item but has no letter/number prefix while " +
  "its siblings do. " +
  "(6) SIG-BLOCK MISALIGNMENT — flag ONLY in signature pages where 'By:', 'Name:', 'Title:', signatory headers " +
  "are at clearly different left positions. " +
  "(7) COMBINED PARAGRAPHS — flag if a single line contains 'Name: X' and 'Title: Y' visually concatenated. " +
  "DO NOT flag: page numbers, period endings, ordinary multi-paragraph body, Spanish characters, font-rendering " +
  "anti-aliasing artifacts, anything you're uncertain about. " +
  "Respond ONLY with strict JSON: {\"issues\":[{\"severity\":\"high|med|low\",\"desc\":\"<≤120 chars>\"}]}. " +
  "Empty array {\"issues\":[]} if the page looks fine. When in doubt, return empty array.";

async function reviewPage(pngPath, label) {
  const img = readFileSync(pngPath).toString("base64");
  const body = {
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
          { type: "text", text: promptFor(label) },
        ],
      },
    ],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Haiku ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const text = d.content?.[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { issues: [], _raw: text };
  try { return JSON.parse(m[0]); } catch { return { issues: [], _raw: text }; }
}

async function pmap(items, n, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

const subdirs = readdirSync(ROOT).filter((d) => {
  const full = join(ROOT, d);
  if (!statSync(full).isDirectory()) return false;
  if (ONLY && !d.includes(ONLY)) return false;
  return readdirSync(full).some((f) => /^page-\d+\.png$/.test(f));
});

console.log(`Reviewing ${subdirs.length} variants from ${ROOT}`);
console.log(`Concurrency: ${CONCURRENCY} | Output: ${OUT_PATH}\n`);

const report = { variants: [], summary: { total: 0, clean: 0, issuesFound: 0, totalCalls: 0 } };
const startTime = Date.now();

for (const variantName of subdirs.sort()) {
  const variantDir = join(ROOT, variantName);
  const pages = readdirSync(variantDir)
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort()
    .map((f) => join(variantDir, f));

  process.stdout.write(`${variantName.padEnd(48)} `);

  const label = detectLabel(variantName);
  const reviews = await pmap(pages, CONCURRENCY, async (p, i) => {
    try {
      const r = await reviewPage(p, label);
      return { page: i + 1, issues: r.issues || [] };
    } catch (e) {
      return { page: i + 1, error: e.message };
    }
  });

  const allIssues = reviews.flatMap((r) =>
    (r.issues || []).map((iss) => ({ page: r.page, ...iss }))
  );
  report.summary.totalCalls += pages.length;
  report.summary.total++;
  if (allIssues.length === 0) {
    report.summary.clean++;
    console.log(`CLEAN  (${pages.length}p)`);
  } else {
    report.summary.issuesFound++;
    console.log(`${allIssues.length} issue(s) across ${pages.length}p`);
    for (const iss of allIssues.slice(0, 3)) {
      console.log(`    p${iss.page} [${iss.severity}] ${iss.desc}`);
    }
    if (allIssues.length > 3) console.log(`    ... +${allIssues.length - 3} more`);
  }
  report.variants.push({ label: variantName, pages: pages.length, issues: allIssues });
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
report.summary.elapsedSeconds = parseFloat(elapsed);

console.log(`\n${"=".repeat(64)}`);
console.log(
  `TOTAL: ${report.summary.total} variants  ` +
  `CLEAN: ${report.summary.clean}  ` +
  `WITH ISSUES: ${report.summary.issuesFound}  ` +
  `(${report.summary.totalCalls} Haiku calls in ${elapsed}s)`
);

writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(`\nFull report: ${OUT_PATH}`);

if (report.summary.issuesFound > 0) process.exit(1);
