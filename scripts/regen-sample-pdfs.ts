/**
 * Regenerate the 5 sample DOCXes + PDFs + PNG renders the user uses
 * for visual review of every Corp variant change.
 *
 * Each sample exercises a different combination of owner count, voting
 * profile, and covenant toggles to surface different code paths.
 *
 * Usage: npx tsx scripts/regen-sample-pdfs.ts [--no-render]
 *   --no-render  skip PDF/PNG generation, just rewrite the DOCXes
 */
import { generateDocument } from '../src/lib/agreement-docgen.js';
import { execSync, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const NO_RENDER = process.argv.includes('--no-render');
const OUT_DIR = '/mnt/c/Users/neotr/Downloads/sample-corp-pdfs';

const NAMES = ['Roberto Mendez', 'Ana Garcia', 'Carlos Lopez', 'Maria Torres', 'Pedro Ramirez', 'Sofia Flores'];

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

const SAMPLES = [
  { o: 1, v: 'majority',       cov: { rofr: true,  drag: true,  tag: true,  nc: true,  ns: true,  conf: true  }, label: 'corp-1o-majority.....-RDTNSC' },
  { o: 2, v: 'unanimous',      cov: { rofr: false, drag: false, tag: false, nc: false, ns: false, conf: false }, label: 'corp-2o-unanimous....-------' },
  { o: 3, v: 'supermajority',  cov: { rofr: false, drag: true,  tag: false, nc: true,  ns: false, conf: true  }, label: 'corp-3o-supermajority--D-N-C' },
  { o: 5, v: 'majority',       cov: { rofr: true,  drag: false, tag: true,  nc: false, ns: false, conf: true  }, label: 'corp-5o-majority.....-R-T--C' },
  { o: 6, v: 'unanimous',      cov: { rofr: true,  drag: true,  tag: true,  nc: true,  ns: true,  conf: true  }, label: 'corp-6o-unanimous....-RDTNSC' },
];

function docxToPdf(docxPath: string, outDir: string) {
  const winDocx = docxPath.replace(/^\/mnt\/c\//, 'C:\\').replace(/\//g, '\\');
  const winOut = outDir.replace(/^\/mnt\/c\//, 'C:\\').replace(/\//g, '\\');
  const profileSuffix = basename(docxPath).replace(/\W/g, '').slice(0, 12);
  const userProfile = `C:\\Users\\neotr\\AppData\\Local\\LibreOffice-${profileSuffix}`;
  const cmd =
    `Set-Location '${winOut}'; ` +
    `& 'C:\\Program Files\\LibreOffice\\program\\soffice.com' ` +
    `--headless --convert-to pdf '${winDocx}' --outdir '${winOut}' ` +
    `-env:UserInstallation=file:///${userProfile.replace(/\\/g, '/')}`;
  execSync(`powershell.exe -Command "${cmd.replace(/"/g, '\\"')}"`, {
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function pdfToPngs(pdfPath: string, outPrefix: string) {
  execFileSync('pdftoppm', ['-r', '180', pdfPath, outPrefix, '-png'], { stdio: 'pipe' });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const s of SAMPLES) {
    process.stdout.write(`${s.label.padEnd(40)} `);
    const answers = buildAnswers(s.o, s.v, s.cov);
    const result = await generateDocument(answers as any);
    const docxPath = join(OUT_DIR, `${s.label}.docx`);
    writeFileSync(docxPath, result.buffer);
    process.stdout.write('docx ');

    if (NO_RENDER) {
      console.log('');
      continue;
    }

    // Strip any old PNG slices for this label so old renders don't linger.
    const slicePrefix = s.label.replace(/^corp-(\d+)o.*/, 'c$1o');
    for (const f of readdirSync(OUT_DIR)) {
      if (f.startsWith(`${s.label}-`) || f.startsWith(`${slicePrefix}-`)) {
        if (f.endsWith('.png')) {
          try { unlinkSync(join(OUT_DIR, f)); } catch {}
        }
      }
    }

    try {
      docxToPdf(docxPath, OUT_DIR);
      process.stdout.write('pdf ');
    } catch (e: any) {
      console.log(`PDF FAIL: ${e.message.slice(0, 80)}`);
      continue;
    }

    const pdfPath = join(OUT_DIR, `${s.label}.pdf`);
    try {
      pdfToPngs(pdfPath, join(OUT_DIR, s.label));
      process.stdout.write('png ');
    } catch (e: any) {
      console.log(`PNG FAIL: ${e.message.slice(0, 80)}`);
      continue;
    }

    console.log('OK');
  }

  console.log(`\nAll samples regenerated in ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
