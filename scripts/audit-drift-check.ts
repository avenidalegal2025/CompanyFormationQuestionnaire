/**
 * Compare two audit-all JSON reports and flag drift.
 *
 * Usage:
 *   npx tsx scripts/audit-drift-check.ts --baseline=path --current=path
 *
 * Exit codes:
 *   0 — no regressions (current may have FEWER failures than baseline)
 *   1 — at least one variant flipped PASS→FAIL or ERROR
 *   2 — bad invocation
 *
 * Drift categories:
 *   • Regression  — variant was PASS in baseline, now FAIL/ERROR
 *   • Improvement — variant was FAIL/ERROR in baseline, now PASS
 *   • New issue   — variant PASS in both but issue count grew
 *   • Resolved    — variant PASS in both but issue count shrank
 *   • Added       — variant exists in current but not baseline
 *   • Removed     — variant exists in baseline but not current
 */
import { readFileSync, existsSync } from 'node:fs';

interface AuditVariant {
  label: string;
  entity: 'CORP' | 'LLC';
  owners: number;
  voting: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  issues: string[];
}

interface AuditReport {
  variants: AuditVariant[];
  total: number; pass: number; fail: number; error: number;
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`${name}=`));
  return a ? a.split('=').slice(1).join('=') : undefined;
}

const baselinePath = arg('--baseline');
const currentPath = arg('--current');

if (!baselinePath || !currentPath) {
  console.error('Usage: audit-drift-check --baseline=path --current=path');
  process.exit(2);
}
if (!existsSync(baselinePath)) {
  console.error(`Baseline not found: ${baselinePath}`);
  process.exit(2);
}
if (!existsSync(currentPath)) {
  console.error(`Current not found: ${currentPath}`);
  process.exit(2);
}

const baseline: AuditReport = JSON.parse(readFileSync(baselinePath, 'utf8'));
const current: AuditReport = JSON.parse(readFileSync(currentPath, 'utf8'));

const baseMap = new Map(baseline.variants.map((v) => [v.label, v]));
const curMap = new Map(current.variants.map((v) => [v.label, v]));

const regressions: { label: string; from: string; to: string; issues: string[] }[] = [];
const improvements: { label: string; from: string; to: string }[] = [];
const newIssues: { label: string; before: number; after: number; added: string[] }[] = [];
const resolved: { label: string; before: number; after: number }[] = [];
const added: string[] = [];
const removed: string[] = [];

for (const [label, cur] of curMap) {
  const base = baseMap.get(label);
  if (!base) {
    added.push(label);
    continue;
  }
  if (base.status === 'PASS' && cur.status !== 'PASS') {
    regressions.push({ label, from: base.status, to: cur.status, issues: cur.issues });
  } else if (base.status !== 'PASS' && cur.status === 'PASS') {
    improvements.push({ label, from: base.status, to: cur.status });
  } else if (base.status === 'PASS' && cur.status === 'PASS') {
    if (cur.issues.length > base.issues.length) {
      const baseSet = new Set(base.issues);
      newIssues.push({
        label,
        before: base.issues.length,
        after: cur.issues.length,
        added: cur.issues.filter((i) => !baseSet.has(i)),
      });
    } else if (cur.issues.length < base.issues.length) {
      resolved.push({ label, before: base.issues.length, after: cur.issues.length });
    }
  }
}
for (const label of baseMap.keys()) {
  if (!curMap.has(label)) removed.push(label);
}

console.log(`Audit Drift: baseline=${baselinePath} current=${currentPath}`);
console.log(`  baseline: ${baseline.total} variants — PASS ${baseline.pass} / FAIL ${baseline.fail} / ERROR ${baseline.error}`);
console.log(`  current : ${current.total} variants — PASS ${current.pass} / FAIL ${current.fail} / ERROR ${current.error}`);
console.log();

if (regressions.length) {
  console.log(`❌ ${regressions.length} REGRESSION${regressions.length === 1 ? '' : 'S'} (PASS → ${regressions[0].to})`);
  for (const r of regressions) {
    console.log(`  • ${r.label}`);
    for (const i of r.issues.slice(0, 3)) console.log(`      ${i}`);
    if (r.issues.length > 3) console.log(`      … +${r.issues.length - 3} more`);
  }
  console.log();
}
if (improvements.length) {
  console.log(`✅ ${improvements.length} improvement${improvements.length === 1 ? '' : 's'} (${improvements[0].from} → PASS)`);
  for (const i of improvements) console.log(`  • ${i.label}`);
  console.log();
}
if (newIssues.length) {
  console.log(`⚠️  ${newIssues.length} variant${newIssues.length === 1 ? '' : 's'} accumulated new issues (still PASS but noisier)`);
  for (const n of newIssues) {
    console.log(`  • ${n.label}: ${n.before} → ${n.after}`);
    for (const i of n.added.slice(0, 2)) console.log(`      + ${i}`);
  }
  console.log();
}
if (resolved.length) {
  console.log(`🟢 ${resolved.length} variant${resolved.length === 1 ? '' : 's'} shed issues`);
  for (const r of resolved) console.log(`  • ${r.label}: ${r.before} → ${r.after}`);
  console.log();
}
if (added.length) {
  console.log(`➕ ${added.length} new variant${added.length === 1 ? '' : 's'} in current run: ${added.slice(0, 5).join(', ')}${added.length > 5 ? ` … +${added.length - 5}` : ''}`);
  console.log();
}
if (removed.length) {
  console.log(`➖ ${removed.length} variant${removed.length === 1 ? '' : 's'} dropped: ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? ` … +${removed.length - 5}` : ''}`);
  console.log();
}
if (!regressions.length && !improvements.length && !newIssues.length && !resolved.length && !added.length && !removed.length) {
  console.log('✓ No drift');
}

process.exit(regressions.length ? 1 : 0);
