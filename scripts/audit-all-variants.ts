/**
 * Run mechanical structural audit on all 288 variants (144 Corp +
 * 144 LLC) and emit a single JSON report consumable by the xlsx
 * generator and the qa-ui-pipeline runner.
 *
 * Usage:
 *   npx tsx scripts/audit-all-variants.ts                    # full 288
 *   npx tsx scripts/audit-all-variants.ts --quick            # 4 variants
 *   npx tsx scripts/audit-all-variants.ts --save             # +DOCX to disk
 *   npx tsx scripts/audit-all-variants.ts --out=path.json    # custom out
 *
 * Output JSON shape:
 *   {
 *     timestamp: ISO,
 *     elapsed_sec: number,
 *     total: number, pass: number, fail: number, error: number,
 *     variants: [
 *       { label, entity: "CORP"|"LLC", owners, voting,
 *         covenants: { rofr, drag, tag, nc, ns, conf },
 *         status: "PASS"|"FAIL"|"ERROR",
 *         issues: string[], docx_path?: string,
 *         elapsed_ms: number }
 *     ]
 *   }
 *
 * Exit code: 0 if all PASS, 1 if any FAIL/ERROR.
 */
import { generateDocument } from '../src/lib/agreement-docgen.js';
import PizZip from 'pizzip';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const QUICK = process.argv.includes('--quick');
const SAVE = process.argv.includes('--save');
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='));
const OUT_PATH = OUT_ARG
  ? OUT_ARG.split('=').slice(1).join('=')
  : process.env.HOME && process.env.HOME.startsWith('/home/')
    ? '/mnt/c/Users/neotr/Downloads/audit-all/audit-all-results.json'
    : join(tmpdir(), 'audit-all-results.json');

const SAVE_DIR_BASE = process.env.HOME && process.env.HOME.startsWith('/home/')
  ? '/mnt/c/Users/neotr/Downloads'
  : '/tmp';

const NAMES = ['Roberto Mendez', 'Ana Garcia', 'Carlos Lopez', 'Maria Torres', 'Pedro Ramirez', 'Sofia Flores'];
const OWNER_COUNTS = QUICK ? [2] : [1, 2, 3, 4, 5, 6];
const VOTING_PROFILES = QUICK ? ['majority'] : ['majority', 'unanimous', 'supermajority'];
const COVENANT_MATRIX = QUICK
  ? [
      { rofr: true,  drag: true,  tag: true,  nc: true,  ns: true,  conf: true  },
      { rofr: false, drag: false, tag: false, nc: false, ns: false, conf: false },
    ]
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

type Cov = { rofr: boolean; drag: boolean; tag: boolean; nc: boolean; ns: boolean; conf: boolean };

function buildAnswers(entity: 'CORP' | 'LLC', ownerCount: number, voting: string, cov: Cov) {
  const owners = Array.from({ length: ownerCount }, (_, i) => ({
    full_name: NAMES[i],
    shares_or_percentage: i === ownerCount - 1
      ? 100 - Math.floor(100 / ownerCount) * (ownerCount - 1)
      : Math.floor(100 / ownerCount),
    capital_contribution: 50000,
  }));
  const officers = entity === 'CORP'
    ? [
        { name: NAMES[0], title: 'President' },
        ...(ownerCount >= 2 ? [{ name: NAMES[1], title: 'Vice-President' }] : []),
        ...(ownerCount >= 3 ? [{ name: NAMES[2], title: 'Treasurer' }] : []),
      ]
    : [];
  const directors = entity === 'CORP'
    ? owners.slice(0, Math.min(3, ownerCount)).map((o) => ({ name: o.full_name }))
    : owners.slice(0, Math.min(2, ownerCount)).map((o) => ({ name: o.full_name }));
  const entityLabel = entity === 'CORP' ? 'Corp' : 'LLC';
  return {
    entity_type: entity,
    entity_name: `${entityLabel} ${ownerCount}o ${voting}`,
    state_of_formation: 'Florida',
    date_of_formation: '2026-04-08T00:00:00Z',
    principal_address: '100 Test St, Miami, FL 33131',
    county: 'Miami-Dade',
    owners_list: owners,
    total_authorized_shares: 10000,
    par_value: 0.01,
    management_type: 'manager',
    directors_managers: directors,
    officers,
    tax_matters_partner: entity === 'LLC' ? NAMES[0] : '',
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
    noncompete_duration: 2,
    noncompete_scope: 'Miami-Dade County',
    include_nonsolicitation: cov.ns,
    include_confidentiality: cov.conf,
  };
}

interface VariantResult {
  label: string;
  entity: 'CORP' | 'LLC';
  owners: number;
  voting: string;
  covenants: Cov;
  status: 'PASS' | 'FAIL' | 'ERROR';
  issues: string[];
  docx_path?: string;
  elapsed_ms: number;
}

const TMP_DIR = join(tmpdir(), 'audit-all-variants');
mkdirSync(TMP_DIR, { recursive: true });

async function main() {
  const results: VariantResult[] = [];
  const startTime = Date.now();
  let total = 0;

  for (const entity of ['CORP', 'LLC'] as const) {
    const saveDir = join(SAVE_DIR_BASE, entity === 'CORP' ? 'corp-variants' : 'llc-variants');
    if (SAVE) mkdirSync(saveDir, { recursive: true });

    for (const ownerCount of OWNER_COUNTS) {
      for (const voting of VOTING_PROFILES) {
        for (const cov of COVENANT_MATRIX) {
          total++;
          const flags = [
            cov.rofr ? 'R' : '-',
            cov.drag ? 'D' : '-',
            cov.tag  ? 'T' : '-',
            cov.nc   ? 'N' : '-',
            cov.ns   ? 'S' : '-',
            cov.conf ? 'C' : '-',
          ].join('');
          const prefix = entity === 'CORP' ? 'corp' : 'llc';
          const label = `${prefix}-${ownerCount}o-${voting.padEnd(13, '.')}-${flags}`;
          const t0 = Date.now();
          try {
            const answers = buildAnswers(entity, ownerCount, voting, cov);
            const result = await generateDocument(answers as any);
            const zip = new PizZip(result.buffer);
            const xml = zip.file('word/document.xml')!.asText();
            const xmlPath = join(TMP_DIR, `${label}.xml`);
            writeFileSync(xmlPath, xml);
            let docxPath: string | undefined;
            if (SAVE) {
              docxPath = join(saveDir, `${label}.docx`);
              writeFileSync(docxPath, result.buffer);
            }
            try {
              execFileSync('node', ['scripts/audit-corp-structure.mjs', xmlPath], { stdio: 'pipe' });
              results.push({
                label, entity, owners: ownerCount, voting, covenants: cov,
                status: 'PASS', issues: [], docx_path: docxPath,
                elapsed_ms: Date.now() - t0,
              });
              process.stdout.write('.');
            } catch (auditErr: any) {
              const out = (auditErr.stdout?.toString() || '').trim();
              const issues = out
                .split('\n')
                .filter((l: string) => l.trim().startsWith('-'))
                .map((l: string) => l.trim().replace(/^-\s*/, ''));
              results.push({
                label, entity, owners: ownerCount, voting, covenants: cov,
                status: 'FAIL', issues, docx_path: docxPath,
                elapsed_ms: Date.now() - t0,
              });
              process.stdout.write('F');
            }
          } catch (e: any) {
            results.push({
              label, entity, owners: ownerCount, voting, covenants: cov,
              status: 'ERROR', issues: [e.message],
              elapsed_ms: Date.now() - t0,
            });
            process.stdout.write('E');
          }
        }
      }
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const error = results.filter((r) => r.status === 'ERROR').length;

  console.log(`\n\n${'='.repeat(64)}`);
  console.log(`TOTAL: ${total}  PASS: ${pass}  FAIL: ${fail}  ERROR: ${error}  (${elapsed.toFixed(1)}s)`);
  const corpRows = results.filter((r) => r.entity === 'CORP');
  const llcRows = results.filter((r) => r.entity === 'LLC');
  console.log(`  CORP: ${corpRows.filter(r=>r.status==='PASS').length}/${corpRows.length} PASS`);
  console.log(`  LLC:  ${llcRows.filter(r=>r.status==='PASS').length}/${llcRows.length} PASS`);

  // Issue category aggregation
  const issueCounts = new Map<string, number>();
  for (const r of results) {
    for (const iss of r.issues) {
      // Normalize: strip the variable text after ":" to get a category
      const cat = iss.split(':')[0]?.trim() || iss.slice(0, 60);
      issueCounts.set(cat, (issueCounts.get(cat) || 0) + 1);
    }
  }
  if (issueCounts.size > 0) {
    console.log('\nTop issue categories:');
    [...issueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([cat, n]) => console.log(`  ${n.toString().padStart(4)} × ${cat}`));
  }

  mkdirSync(join(OUT_PATH, '..'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({
    timestamp: new Date().toISOString(),
    elapsed_sec: parseFloat(elapsed.toFixed(1)),
    total, pass, fail, error,
    variants: results,
  }, null, 2));
  console.log(`\nReport: ${OUT_PATH}`);

  if (fail > 0 || error > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
