/**
 * Generate variant-matrix report (CSV + HTML) from audit + UI results.
 *
 * Reads:
 *   --audit=path  (default: ~/Downloads/audit-all/audit-all-results.json)
 *   --ui=path     (optional — qa-ui-pipeline.mjs output JSON)
 *
 * Emits:
 *   <out_dir>/variant-matrix.csv  — opens in Excel, filterable
 *   <out_dir>/variant-matrix.html — browser-viewable, filterable, color-coded
 *
 * Default out: ~/Downloads/variant-matrix/<timestamp>/
 *
 * Excel-side workflow: open CSV → autofilter → filter Status ≠ PASS → drill.
 * Browser-side workflow: open HTML → click column header to sort, type in
 *   the filter box to narrow, click variant label to expand its issues.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface AuditVariant {
  label: string;
  entity: 'CORP' | 'LLC';
  owners: number;
  voting: string;
  covenants: { rofr: boolean; drag: boolean; tag: boolean; nc: boolean; ns: boolean; conf: boolean };
  status: 'PASS' | 'FAIL' | 'ERROR';
  issues: string[];
  docx_path?: string;
  elapsed_ms: number;
}

interface AuditReport {
  timestamp: string;
  elapsed_sec: number;
  total: number; pass: number; fail: number; error: number;
  variants: AuditVariant[];
}

function arg(name: string, dflt?: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`${name}=`));
  return a ? a.split('=').slice(1).join('=') : dflt;
}

const HOME = process.env.HOME || '';
const isWSL = HOME.startsWith('/home/');
const DOWNLOADS = isWSL ? '/mnt/c/Users/neotr/Downloads' : (process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Downloads` : '/tmp');

const AUDIT_PATH = arg('--audit', join(DOWNLOADS, 'audit-all', 'audit-all-results.json'))!;
const UI_PATH = arg('--ui', undefined);
const OUT_DIR = arg('--out', join(DOWNLOADS, 'variant-matrix', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)))!;

if (!existsSync(AUDIT_PATH)) {
  console.error(`Audit report not found: ${AUDIT_PATH}`);
  console.error(`Run: npx tsx scripts/audit-all-variants.ts`);
  process.exit(2);
}

const audit: AuditReport = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
const uiResults: Record<string, { status: string; issues: string[] }> = {};
if (UI_PATH && existsSync(UI_PATH)) {
  const ui = JSON.parse(readFileSync(UI_PATH, 'utf8'));
  for (const v of ui.variants || []) uiResults[v.label] = { status: v.status, issues: v.issues || [] };
}

mkdirSync(OUT_DIR, { recursive: true });

// ─── CSV ─────────────────────────────────────────────────────────────
function csvEscape(s: string | number | boolean): string {
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const csvHeader = [
  'Label', 'Entity', 'Owners', 'Voting',
  'RoFR', 'Drag', 'Tag', 'NonCompete', 'NonSolicitation', 'Confidentiality',
  'Audit Status', 'Audit Issues', 'Audit Elapsed (ms)',
  'UI Status', 'UI Issues',
  'DOCX Path',
];
const csvRows = [csvHeader.map(csvEscape).join(',')];
for (const v of audit.variants) {
  const ui = uiResults[v.label];
  csvRows.push([
    v.label, v.entity, v.owners, v.voting,
    v.covenants.rofr, v.covenants.drag, v.covenants.tag,
    v.covenants.nc, v.covenants.ns, v.covenants.conf,
    v.status, v.issues.join(' | '), v.elapsed_ms,
    ui?.status || '', (ui?.issues || []).join(' | '),
    v.docx_path || '',
  ].map(csvEscape).join(','));
}
const csvPath = join(OUT_DIR, 'variant-matrix.csv');
writeFileSync(csvPath, csvRows.join('\n'));

// ─── HTML ────────────────────────────────────────────────────────────
const cellStatus = (s: string) =>
  s === 'PASS' ? 'pass' : s === 'FAIL' ? 'fail' : s === 'ERROR' ? 'error' : '';

const htmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const summary = {
  total: audit.total,
  audit_pass: audit.pass,
  audit_fail: audit.fail + audit.error,
  ui_runs: Object.keys(uiResults).length,
  ui_pass: Object.values(uiResults).filter((u) => u.status === 'PASS').length,
  ui_fail: Object.values(uiResults).filter((u) => u.status !== 'PASS').length,
};

const rowsHtml = audit.variants.map((v) => {
  const ui = uiResults[v.label];
  const statusBadges =
    `<span class="badge ${cellStatus(v.status)}">audit ${v.status}</span>` +
    (ui ? `<span class="badge ${cellStatus(ui.status)}">ui ${ui.status}</span>` : '<span class="badge skip">ui —</span>');
  const allIssues = [...v.issues, ...(ui?.issues || [])];
  const issuesHtml = allIssues.length
    ? `<details><summary>${allIssues.length} issue${allIssues.length === 1 ? '' : 's'}</summary><ul>${allIssues.map((i) => `<li>${htmlEscape(i)}</li>`).join('')}</ul></details>`
    : '<span class="muted">—</span>';
  const cov = v.covenants;
  const flags = `${cov.rofr ? 'R' : '-'}${cov.drag ? 'D' : '-'}${cov.tag ? 'T' : '-'}${cov.nc ? 'N' : '-'}${cov.ns ? 'S' : '-'}${cov.conf ? 'C' : '-'}`;
  return `
  <tr data-status="${v.status} ${ui?.status || 'NONE'}" data-entity="${v.entity}" data-search="${htmlEscape(v.label)} ${flags}">
    <td>${statusBadges}</td>
    <td><code>${htmlEscape(v.label)}</code></td>
    <td>${v.entity}</td>
    <td>${v.owners}</td>
    <td>${v.voting}</td>
    <td><code>${flags}</code></td>
    <td>${issuesHtml}</td>
    <td class="muted">${v.elapsed_ms}ms</td>
  </tr>`;
}).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Avenida Legal — Variant Matrix Report — ${audit.timestamp}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 16px 24px; color: #222; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 16px; font-size: 13px; }
  .summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .stat { padding: 8px 12px; background: #f4f4f4; border-radius: 4px; }
  .stat strong { font-size: 18px; display: block; }
  .stat.green strong { color: #0a8; }
  .stat.red strong { color: #c33; }
  .stat.gray strong { color: #888; }
  .filter { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; }
  input, select { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
  input { flex: 1; min-width: 200px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; cursor: pointer; user-select: none; position: sticky; top: 0; }
  th:hover { background: #eee; }
  tr.hide { display: none; }
  code { font: 12px/1.5 ui-monospace, monospace; background: #f4f4f4; padding: 1px 5px; border-radius: 3px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .badge.pass { background: #d4f4e0; color: #096; }
  .badge.fail { background: #ffd6d6; color: #c00; }
  .badge.error { background: #fff0c2; color: #b78000; }
  .badge.skip { background: #eee; color: #888; }
  .muted { color: #999; }
  details summary { cursor: pointer; font-weight: 600; color: #c33; }
  details ul { margin: 4px 0 4px 20px; padding: 0; }
  details li { font-size: 12px; color: #333; }
  .footer { margin-top: 24px; color: #666; font-size: 12px; padding: 12px; background: #f8f8f8; border-radius: 4px; }
</style>
</head>
<body>
<h1>Avenida Legal — Variant Matrix Report</h1>
<p class="sub">Generated ${new Date().toISOString()} from <code>${htmlEscape(AUDIT_PATH)}</code>${UI_PATH ? ` + UI <code>${htmlEscape(UI_PATH)}</code>` : ''}.<br/>
Audit ran in ${audit.elapsed_sec}s on ${audit.timestamp}.</p>

<div class="summary">
  <div class="stat"><strong>${summary.total}</strong>Total variants</div>
  <div class="stat green"><strong>${summary.audit_pass}</strong>Audit PASS</div>
  <div class="stat ${summary.audit_fail ? 'red' : 'gray'}"><strong>${summary.audit_fail}</strong>Audit FAIL/ERROR</div>
  <div class="stat ${summary.ui_runs ? 'gray' : ''}"><strong>${summary.ui_runs}</strong>UI runs</div>
  <div class="stat ${summary.ui_runs ? 'green' : 'gray'}"><strong>${summary.ui_pass}</strong>UI PASS</div>
  <div class="stat ${summary.ui_fail ? 'red' : 'gray'}"><strong>${summary.ui_fail}</strong>UI FAIL</div>
</div>

<div class="filter">
  <input id="search" placeholder="Filter by label or covenant flags (e.g. 'corp-3o' or 'RDTNSC')" />
  <select id="status">
    <option value="">All</option>
    <option value="audit-fail">Audit FAIL only</option>
    <option value="ui-fail">UI FAIL only</option>
    <option value="any-fail">Any FAIL</option>
    <option value="all-pass">All PASS only</option>
  </select>
  <select id="entity">
    <option value="">Both entities</option>
    <option value="CORP">Corp only</option>
    <option value="LLC">LLC only</option>
  </select>
</div>

<table id="grid">
  <thead><tr>
    <th>Status</th>
    <th>Label</th>
    <th>Entity</th>
    <th>Owners</th>
    <th>Voting</th>
    <th>Covenants</th>
    <th>Issues</th>
    <th>Audit time</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>

<p class="footer">
Generated from <code>scripts/lib/agreement-variants.mjs</code> matrix and audit results.<br/>
Companion CSV: <code>variant-matrix.csv</code> (open in Excel for native filter/sort).<br/>
DO NOT EDIT this file by hand — regenerate via <code>npx tsx scripts/generate-variant-matrix-report.ts</code>.
</p>

<script>
const search = document.getElementById('search');
const statusSel = document.getElementById('status');
const entitySel = document.getElementById('entity');
const rows = [...document.querySelectorAll('#grid tbody tr')];
function applyFilter() {
  const s = search.value.toLowerCase();
  const st = statusSel.value;
  const en = entitySel.value;
  for (const r of rows) {
    const data = (r.dataset.search || '').toLowerCase();
    const status = r.dataset.status || '';
    const entity = r.dataset.entity || '';
    let show = true;
    if (s && !data.includes(s)) show = false;
    if (st === 'audit-fail' && status.split(' ')[0] === 'PASS') show = false;
    if (st === 'ui-fail' && (status.split(' ')[1] || 'NONE') === 'PASS') show = false;
    if (st === 'any-fail' && !/FAIL|ERROR/.test(status)) show = false;
    if (st === 'all-pass' && /FAIL|ERROR/.test(status)) show = false;
    if (en && entity !== en) show = false;
    r.classList.toggle('hide', !show);
  }
}
search.addEventListener('input', applyFilter);
statusSel.addEventListener('change', applyFilter);
entitySel.addEventListener('change', applyFilter);
// Click column header to sort
const headers = document.querySelectorAll('#grid thead th');
headers.forEach((th, idx) => {
  th.addEventListener('click', () => {
    const tbody = document.querySelector('#grid tbody');
    const sorted = [...tbody.querySelectorAll('tr')].sort((a, b) => {
      const av = a.children[idx].textContent.trim();
      const bv = b.children[idx].textContent.trim();
      const an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return av.localeCompare(bv);
    });
    tbody.append(...sorted);
  });
});
</script>
</body>
</html>`;

const htmlPath = join(OUT_DIR, 'variant-matrix.html');
writeFileSync(htmlPath, html);

console.log(`✓ CSV:  ${csvPath}`);
console.log(`✓ HTML: ${htmlPath}`);
console.log(`  ${audit.total} variants, ${audit.pass} PASS, ${audit.fail + audit.error} FAIL${UI_PATH ? `, ${summary.ui_runs} UI runs` : ''}`);
