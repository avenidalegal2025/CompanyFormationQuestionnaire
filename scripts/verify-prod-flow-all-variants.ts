/**
 * Verify all 288 variants through the PRODUCTION code path:
 *   formData → mapFormToDocgenAnswers → generateDocument
 *
 * vs the synthetic audit (which feeds answers directly, skipping the mapper).
 *
 * Per-variant assertions:
 *   1. rPrDefault has explicit <w:rFonts> with Times New Roman   (font fix)
 *   2. word/styles.xml + word/theme/theme1.xml have NO Arial/Calibri/Aptos
 *   3. Corp only: §10.6 Officers table has populated title column
 *
 * Output: scripts/__verify_out__/verify-prod-flow.json
 */
import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import PizZip from 'pizzip';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OWNER_COUNTS = [1, 2, 3, 4, 5, 6];
const VOTING = ['majority', 'mixed', 'unanimous'];
const COVENANTS = [
  { rofr: false, drag: false, tag: false, nc: false, ns: false, conf: false },
  { rofr: false, drag: false, tag: false, nc: false, ns: true,  conf: true  },
  { rofr: false, drag: true,  tag: false, nc: true,  ns: false, conf: true  },
  { rofr: false, drag: true,  tag: true,  nc: true,  ns: true,  conf: false },
  { rofr: true,  drag: false, tag: false, nc: true,  ns: false, conf: false },
  { rofr: true,  drag: false, tag: true,  nc: false, ns: false, conf: true  },
  { rofr: true,  drag: true,  tag: false, nc: false, ns: true,  conf: false },
  { rofr: true,  drag: true,  tag: true,  nc: true,  ns: true,  conf: true  },
];

interface VariantResult {
  label: string;
  entity: 'Corp' | 'LLC';
  ownerCount: number;
  voting: string;
  flags: string;
  status: 'PASS' | 'FAIL';
  issues: string[];
}

function flagsStr(c: any) {
  return `${c.rofr?'R':'-'}${c.drag?'D':'-'}${c.tag?'T':'-'}${c.nc?'N':'-'}${c.ns?'S':'-'}${c.conf?'C':'-'}`;
}

async function verifyOne(entity: 'C-Corp'|'LLC', voting: string, ownerCount: number, c: any): Promise<VariantResult> {
  const flags = flagsStr(c);
  const ent = entity === 'C-Corp' ? 'Corp' : 'LLC';
  const label = `${ent}-${ownerCount}o-${voting}-${flags}`;
  const issues: string[] = [];

  try {
    const v = baseFormData({
      entity, voting: voting as any, ownerCount, label,
      rofr: c.rofr, dragTag: c.drag || c.tag,
      nonCompete: c.nc ? 'Yes' : 'No',
      nonSolicitation: c.ns ? 'Yes' : 'No',
      confidentiality: c.conf ? 'Yes' : 'No',
    });

    const answers = await mapFormToDocgenAnswers(v.formData);
    const doc = await generateDocument(answers as any);
    const zip = new PizZip(doc.buffer);

    // CHECK 1: rPrDefault has rFonts with TNR
    const styles = zip.file('word/styles.xml')!.asText();
    const rprDef = styles.match(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/)?.[0] || '';
    if (!/<w:rFonts[^/]*Times New Roman/.test(rprDef)) {
      issues.push('rPrDefault missing <w:rFonts Times New Roman>');
    }

    // CHECK 2: no Arial/Calibri/Aptos in styles or theme
    const theme = zip.file('word/theme/theme1.xml')!.asText();
    for (const banned of ['Arial', 'Calibri', 'Aptos']) {
      if (styles.includes(banned)) issues.push(`styles.xml still references ${banned}`);
      if (theme.includes(banned)) issues.push(`theme1.xml still references ${banned}`);
    }

    // CHECK 3 (Corp only): officers table has all 6 (or N) name+title rows
    if (entity === 'C-Corp') {
      const xml = zip.file('word/document.xml')!.asText();
      const tbls = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
      // Heuristic: officers table contains an owner name (e.g. "Roberto Mendez") + a role
      let officersTable: RegExpMatchArray | undefined;
      for (const t of tbls) {
        if (/Roberto Mendez/.test(t[0]) && /(President|Vice-President|Director|Secretary|Treasurer)/.test(t[0]) && !/Capital Contribution/.test(t[0])) {
          officersTable = t; break;
        }
      }
      if (!officersTable) {
        issues.push('officers table not found (or has no role column)');
      } else {
        const cells = [...officersTable[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
        // Expect ownerCount × 2 cells (name, title pairs)
        if (cells.length < ownerCount * 2) {
          issues.push(`officers table has ${cells.length} cells, expected ${ownerCount*2}`);
        }
        for (let i = 0; i < ownerCount; i++) {
          const title = cells[i*2 + 1];
          if (!title || title.trim() === '') {
            issues.push(`officer ${i+1} (${cells[i*2]}) has empty title`);
            break;
          }
        }
      }
    }
  } catch (e: any) {
    issues.push(`THREW: ${e.message?.slice(0, 200)}`);
  }

  return {
    label, entity: entity === 'C-Corp' ? 'Corp' : 'LLC',
    ownerCount, voting, flags,
    status: issues.length ? 'FAIL' : 'PASS',
    issues,
  };
}

async function main() {
  const start = Date.now();
  const results: VariantResult[] = [];
  let count = 0;
  const total = 2 * OWNER_COUNTS.length * VOTING.length * COVENANTS.length; // 288

  for (const entity of ['C-Corp', 'LLC'] as const) {
    for (const owners of OWNER_COUNTS) {
      for (const voting of VOTING) {
        for (const c of COVENANTS) {
          count++;
          const r = await verifyOne(entity, voting, owners, c);
          results.push(r);
          if (r.status === 'FAIL') {
            console.log(`✗ ${count}/${total} ${r.label}: ${r.issues.join(' | ')}`);
          } else if (count % 36 === 0) {
            const elapsed = Math.round((Date.now()-start)/1000);
            console.log(`  ${count}/${total} done (${elapsed}s, ${results.filter(r=>r.status==='PASS').length} PASS so far)`);
          }
        }
      }
    }
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const elapsed = ((Date.now()-start)/1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}  (${elapsed}s)`);

  const outDir = join(__dirname, '__verify_out__');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'verify-prod-flow.json');
  writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    elapsed_sec: parseFloat(elapsed),
    total: results.length, pass, fail,
    failures: results.filter((r) => r.status === 'FAIL'),
    all: results,
  }, null, 2));
  console.log(`Report: ${outPath}`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
