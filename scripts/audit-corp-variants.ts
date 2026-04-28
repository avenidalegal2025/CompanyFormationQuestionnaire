/**
 * Audit every Corp Shareholder Agreement variant locally.
 *
 * Generates each combination via generateDocument() (no HTTP, no Vercel),
 * extracts document.xml, and runs the comprehensive Layer 1–4 structural
 * auditor on each. Reports aggregate PASS/FAIL with per-variant detail.
 *
 * Default matrix: 6 owner counts × 3 voting profiles × 8 covenant/ROFR
 * combinations = 144 variants. Mirrors Group M from verify-all-variants.mjs
 * but runs LOCALLY against the docgen library — no server, ~10s end-to-end.
 *
 * Usage:
 *   npx tsx scripts/audit-corp-variants.ts            # full matrix
 *   npx tsx scripts/audit-corp-variants.ts --quick    # 12-variant smoke test
 *   npx tsx scripts/audit-corp-variants.ts --verbose  # show every variant
 */
import { generateDocument } from '../src/lib/agreement-docgen.js';
import PizZip from 'pizzip';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const QUICK = process.argv.includes('--quick');
const VERBOSE = process.argv.includes('--verbose');

// ─── Matrix axes ─────────────────────────────────────────────────────
const NAMES = ['Roberto Mendez', 'Ana Garcia', 'Carlos Lopez', 'Maria Torres', 'Pedro Ramirez', 'Sofia Flores'];
const OWNER_COUNTS = QUICK ? [2, 3] : [1, 2, 3, 4, 5, 6];
const VOTING_PROFILES = QUICK ? ['majority'] : ['majority', 'unanimous', 'supermajority'];
// 8 covenant + ROFR combinations cover all toggle interactions
const COVENANT_MATRIX = QUICK
  ? [{ rofr: true, drag: true, tag: true, nc: true, ns: true, conf: true }]
  : [
      { rofr: true,  drag: true,  tag: true,  nc: true,  ns: true,  conf: true  },
      { rofr: false, drag: false, tag: false, nc: false, ns: false, conf: false },
      { rofr: true,  drag: false, tag: false, nc: true,  ns: false, conf: false },
      { rofr: true,  drag: true,  tag: false, nc: false, ns: true,  conf: false },
      { rofr: true,  drag: false, tag: true,  nc: false, ns: false, conf: true  },
      { rofr: false, drag: true,  tag: true,  nc: true,  ns: true,  conf: false },
      { rofr: false, drag: true,  tag: false, nc: true,  ns: false, conf: true  },
      { rofr: false, drag: false, tag: true,  nc: false, ns: true,  conf: true  },
    ];

// ─── Build QuestionnaireAnswers for each variant ─────────────────────
function buildAnswers(
  ownerCount: number,
  voting: string,
  cov: { rofr: boolean; drag: boolean; tag: boolean; nc: boolean; ns: boolean; conf: boolean },
) {
  const owners = Array.from({ length: ownerCount }, (_, i) => ({
    full_name: NAMES[i],
    shares_or_percentage: i === ownerCount - 1
      ? 100 - Math.floor(100 / ownerCount) * (ownerCount - 1)
      : Math.floor(100 / ownerCount),
    capital_contribution: 50000,
  }));
  const officers = [
    { name: NAMES[0], title: 'President' },
    ...(ownerCount >= 2 ? [{ name: NAMES[1], title: 'Vice-President' }] : []),
    ...(ownerCount >= 3 ? [{ name: NAMES[2], title: 'Treasurer' }] : []),
  ];
  return {
    entity_type: 'CORP',
    entity_name: `Corp ${ownerCount}o ${voting}`,
    state_of_formation: 'Florida',
    date_of_formation: '2026-04-08T00:00:00Z',
    principal_address: '100 Test St, Miami, FL 33131',
    county: 'Miami-Dade',
    owners_list: owners,
    total_authorized_shares: 10000,
    par_value: 0.01,
    management_type: 'manager',
    directors_managers: owners.slice(0, Math.min(3, ownerCount)).map((o) => ({ name: o.full_name })),
    officers,
    tax_matters_partner: '',
    additional_capital_voting: voting,
    shareholder_loans_voting: voting,
    distribution_frequency: 'semi_annual',
    majority_threshold: 50.01,
    supermajority_threshold: 75,
    sale_of_company_voting: voting === 'majority' ? 'majority' : 'supermajority',
    major_decisions_voting: voting,
    major_spending_threshold: 7500,
    bank_signees: 'two',
    new_member_admission_voting: voting,
    dissolution_voting: voting,
    officer_removal_voting: voting,
    family_transfer: 'unanimous',
    right_of_first_refusal: cov.rofr,
    rofr_offer_period: 90,
    death_incapacity_forced_sale: true,
    drag_along: cov.drag,
    tag_along: cov.tag,
    include_noncompete: cov.nc,
    noncompete_duration: 3,
    noncompete_scope: 'Miami-Dade County',
    include_nonsolicitation: cov.ns,
    include_confidentiality: cov.conf,
  };
}

// ─── Main loop ───────────────────────────────────────────────────────
const TMP_DIR = join(tmpdir(), 'audit-corp-variants');
mkdirSync(TMP_DIR, { recursive: true });

interface VariantResult {
  label: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  issues?: string[];
  error?: string;
}

async function main() {
const results: VariantResult[] = [];
const startTime = Date.now();

let total = 0;
for (const ownerCount of OWNER_COUNTS) {
  for (const voting of VOTING_PROFILES) {
    for (const cov of COVENANT_MATRIX) {
      total++;
      const flags = [
        cov.rofr ? 'R' : '-',
        cov.drag ? 'D' : '-',
        cov.tag ? 'T' : '-',
        cov.nc ? 'N' : '-',
        cov.ns ? 'S' : '-',
        cov.conf ? 'C' : '-',
      ].join('');
      const label = `corp-${ownerCount}o-${voting.padEnd(13, '.')}-${flags}`;
      try {
        const answers = buildAnswers(ownerCount, voting, cov);
        const result = await generateDocument(answers as any);
        const zip = new PizZip(result.buffer);
        const xml = zip.file('word/document.xml')!.asText();

        // Write XML to temp + run audit
        const xmlPath = join(TMP_DIR, `${label}.xml`);
        writeFileSync(xmlPath, xml);

        try {
          execFileSync('node', ['scripts/audit-corp-structure.mjs', xmlPath], {
            stdio: 'pipe',
          });
          results.push({ label, status: 'PASS' });
          process.stdout.write('.');
        } catch (auditErr: any) {
          const out = (auditErr.stdout?.toString() || '').trim();
          const issues = out
            .split('\n')
            .filter((l: string) => l.trim().startsWith('-'))
            .map((l: string) => l.trim().replace(/^-\s*/, ''));
          results.push({ label, status: 'FAIL', issues });
          process.stdout.write('F');
        }
      } catch (e: any) {
        results.push({ label, status: 'ERROR', error: e.message });
        process.stdout.write('E');
      }
    }
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const errored = results.filter((r) => r.status === 'ERROR').length;

console.log(`\n\n${'='.repeat(64)}`);
console.log(`TOTAL: ${total}  PASS: ${passed}  FAIL: ${failed}  ERROR: ${errored}  (${elapsed}s)`);

if (VERBOSE || failed > 0 || errored > 0) {
  console.log('');
  for (const r of results) {
    if (r.status === 'PASS' && !VERBOSE) continue;
    const tag = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '!';
    console.log(`  ${tag} ${r.label}  ${r.status}`);
    if (r.issues) for (const i of r.issues) console.log(`        - ${i}`);
    if (r.error) console.log(`        ${r.error}`);
  }
}

if (failed > 0 || errored > 0) {
  console.log(`\nSTATUS: ${failed} FAIL${failed === 1 ? '' : 'S'}${errored ? ` + ${errored} ERROR${errored === 1 ? '' : 'S'}` : ''}`);
  process.exit(1);
}

console.log('\nSTATUS: ALL VARIANTS CLEAN');
}

main().catch((e) => { console.error(e); process.exit(1); });
