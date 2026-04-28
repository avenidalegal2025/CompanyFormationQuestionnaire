#!/usr/bin/env node
/**
 * Visual review of every Corp variant via Claude Haiku 4.5 vision.
 *
 * Pipeline per variant:
 *   1. Generate DOCX (already saved by audit-corp-variants.ts --save)
 *   2. DOCX → PDF via LibreOffice (Windows soffice.com via PowerShell)
 *   3. PDF → per-page PNG via pdftoppm
 *   4. For each page: Claude Haiku 4.5 vision call with structural prompt
 *   5. Aggregate per-variant + global findings, save JSON report
 *
 * Cost estimate (Haiku 4.5):
 *   144 variants × ~24 pages × ~1400 input + 50 output tokens ≈ $5 total
 *
 * Prereq: run `npx tsx scripts/audit-corp-variants.ts --save` first to
 * populate `~/Downloads/corp-variants/*.docx`.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/visual-review-corp-variants.mjs \
 *     [--limit N] [--variants <folder>] [--out <reportPath>] [--concurrency N]
 *
 *   --limit N            Review only the first N variants (default: all)
 *   --variants <folder>  Directory of *.docx (default: ~/Downloads/corp-variants)
 *   --out <path>         JSON report output (default: ~/Downloads/corp-variants/visual-review.json)
 *   --concurrency N      Parallel Haiku calls (default: 6)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { join, basename, sep } from "node:path";
import { homedir } from "node:os";

// ─── CLI args ────────────────────────────────────────────────────────
function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const VARIANTS_DIR = arg("--variants", join(homedir(), "Downloads", "corp-variants"));
const OUT_PATH = arg("--out", join(VARIANTS_DIR, "visual-review.json"));
const LIMIT = parseInt(arg("--limit", "0"), 10);
const CONCURRENCY = parseInt(arg("--concurrency", "6"), 10);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY required");
  process.exit(2);
}
if (!existsSync(VARIANTS_DIR)) {
  console.error(`Variants directory not found: ${VARIANTS_DIR}`);
  console.error("Run: npx tsx scripts/audit-corp-variants.ts --save");
  process.exit(2);
}

// ─── DOCX → PDF (LibreOffice via PowerShell) ─────────────────────────
function docxToPdf(docxPath, outDir) {
  const winDocx = docxPath.replace(/^\/mnt\/c\//, "C:\\").replace(/\//g, "\\");
  const winOut = outDir.replace(/^\/mnt\/c\//, "C:\\").replace(/\//g, "\\");
  // Each LibreOffice invocation needs a unique user profile dir to avoid
  // "another instance is running" errors when called repeatedly in
  // sequence. Use a hash of the docx name as profile suffix.
  const profileSuffix = basename(docxPath).replace(/\W/g, "");
  const userProfile = `C:\\Users\\neotr\\AppData\\Local\\LibreOffice-${profileSuffix.slice(0, 12)}`;
  const cmd =
    `Set-Location '${winOut}'; ` +
    `& 'C:\\Program Files\\LibreOffice\\program\\soffice.com' ` +
    `--headless --convert-to pdf '${winDocx}' --outdir '${winOut}' ` +
    `-env:UserInstallation=file:///${userProfile.replace(/\\/g, "/")}`;
  execSync(`powershell.exe -Command "${cmd.replace(/"/g, '\\"')}"`, {
    stdio: "pipe",
    timeout: 120_000,
  });
}

// ─── PDF → page PNGs ─────────────────────────────────────────────────
function pdfToPngs(pdfPath, outPrefix) {
  // 180 DPI: sharp enough for Haiku to read underline boundaries reliably,
  // ~3× the file size of 100 DPI but still <500KB/page.
  execFileSync("pdftoppm", ["-r", "180", pdfPath, outPrefix, "-png"], {
    stdio: "pipe",
  });
  // pdftoppm produces outPrefix-NN.png; collect them
  const dir = pdfPath.replace(/\/[^/]+$/, "");
  const prefix = basename(outPrefix);
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix + "-") && f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
}

// ─── Haiku visual review ─────────────────────────────────────────────
const PROMPT =
  "You are reviewing one page of a legal Shareholders' Agreement. " +
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
  "(6) SIG-BLOCK MISALIGNMENT — flag ONLY in signature pages where 'By:', 'Name:', 'Title:', 'SHAREHOLDERS', " +
  "'CORPORATION' lines are at clearly different left positions. " +
  "(7) COMBINED PARAGRAPHS — flag if a single line contains 'Name: X' and 'Title: Y' visually concatenated. " +
  "DO NOT flag: page numbers, period endings, ordinary multi-paragraph body, Spanish characters, font-rendering " +
  "anti-aliasing artifacts, anything you're uncertain about. " +
  "Respond ONLY with strict JSON: {\"issues\":[{\"severity\":\"high|med|low\",\"desc\":\"<≤120 chars>\"}]}. " +
  "Empty array {\"issues\":[]} if the page looks fine. When in doubt, return empty array.";

async function reviewPage(pngPath) {
  const img = readFileSync(pngPath).toString("base64");
  const body = {
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
          { type: "text", text: PROMPT },
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
  // Strip ```json fences if present
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { issues: [], _raw: text };
  try {
    return JSON.parse(m[0]);
  } catch {
    return { issues: [], _raw: text };
  }
}

// ─── Concurrency helper ──────────────────────────────────────────────
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

// ─── Main ────────────────────────────────────────────────────────────
const docxFiles = readdirSync(VARIANTS_DIR)
  .filter((f) => f.endsWith(".docx"))
  .sort();
const items = LIMIT > 0 ? docxFiles.slice(0, LIMIT) : docxFiles;

console.log(`Reviewing ${items.length} variants from ${VARIANTS_DIR}`);
console.log(`Concurrency: ${CONCURRENCY} | Output: ${OUT_PATH}\n`);

const RENDER_DIR = join(VARIANTS_DIR, "_render");
mkdirSync(RENDER_DIR, { recursive: true });

const report = { variants: [], summary: { total: 0, clean: 0, issuesFound: 0, totalCalls: 0 } };
const startTime = Date.now();

for (const docx of items) {
  const label = docx.replace(/\.docx$/, "");
  const docxPath = join(VARIANTS_DIR, docx);
  const variantOut = join(RENDER_DIR, label);
  mkdirSync(variantOut, { recursive: true });

  process.stdout.write(`${label.padEnd(48)} `);

  // 1. DOCX → PDF
  let pages;
  try {
    docxToPdf(docxPath, variantOut);
    const pdfPath = join(variantOut, label + ".pdf");
    pages = pdfToPngs(pdfPath, join(variantOut, "page"));
  } catch (e) {
    console.log(`RENDER ERROR: ${e.message.slice(0, 80)}`);
    report.variants.push({ label, error: e.message });
    continue;
  }

  // 2. Per-page Haiku review (parallel)
  const reviews = await pmap(pages, CONCURRENCY, async (p, i) => {
    try {
      const r = await reviewPage(p);
      return { page: i + 1, issues: r.issues || [] };
    } catch (e) {
      return { page: i + 1, error: e.message };
    }
  });

  const allIssues = reviews.flatMap((r) =>
    (r.issues || []).map((iss) => ({ page: r.page, ...iss })),
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
  report.variants.push({ label, pages: pages.length, issues: allIssues });
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
report.summary.elapsedSeconds = parseFloat(elapsed);

console.log(`\n${"=".repeat(64)}`);
console.log(
  `TOTAL: ${report.summary.total} variants  ` +
  `CLEAN: ${report.summary.clean}  ` +
  `WITH ISSUES: ${report.summary.issuesFound}  ` +
  `(${report.summary.totalCalls} Haiku calls in ${elapsed}s)`,
);

writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(`\nFull report: ${OUT_PATH}`);

if (report.summary.issuesFound > 0) process.exit(1);
