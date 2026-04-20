/**
 * After the Playwright E2E completes, find the most-recent PLAYWRIGHT QA
 * Shareholder Agreement in S3, download it, and verify:
 *   - 0 Arial font references in styles.xml / theme1.xml / document.xml
 *   - County placeholders populated (no bare "County, Florida" leftover)
 *   - TNR references present
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';

const BUCKET = 'avenida-legal-documents';
const HOME = process.env.USERPROFILE || '.';

function aws(cmd) {
  return execSync(`aws ${cmd} --profile llc-admin --region us-west-1`, { encoding: 'utf8' });
}

// Find the most-recent PLAYWRIGHT QA agreement in S3
const ls = aws(`s3 ls s3://${BUCKET}/ --recursive`);
const agreements = ls.split('\n')
  .filter(l => /PLAYWRIGHT.*(Shareholder|Operating).*Agreement\.docx/i.test(l))
  .map(l => {
    const parts = l.trim().split(/\s+/);
    return { date: parts[0] + ' ' + parts[1], size: parts[2], key: parts.slice(3).join(' ') };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

if (agreements.length === 0) {
  console.error('FAIL: No PLAYWRIGHT agreement found in S3');
  process.exit(1);
}

const latest = agreements[0];
console.log(`Latest: ${latest.date}  ${latest.key}  (${latest.size} bytes)`);

const localPath = join(HOME, 'Downloads', 'PROD_verify.docx');
aws(`s3 cp "s3://${BUCKET}/${latest.key}" "${localPath}"`);
console.log(`Downloaded to ${localPath}`);

// Inspect
const zip = new PizZip(readFileSync(localPath));
const styles = zip.file('word/styles.xml')?.asText() || '';
const theme = zip.file('word/theme/theme1.xml')?.asText() || '';
const doc = zip.file('word/document.xml')?.asText() || '';

const counts = {
  'styles.xml Arial': (styles.match(/Arial/g) || []).length,
  'styles.xml TNR':   (styles.match(/Times New Roman/g) || []).length,
  'theme1.xml Arial': (theme.match(/Arial/g) || []).length,
  'theme1.xml TNR':   (theme.match(/Times New Roman/g) || []).length,
  'document.xml Arial': (doc.match(/Arial/g) || []).length,
  'document.xml TNR':   (doc.match(/Times New Roman/g) || []).length,
};
console.log('\n=== Font audit ===');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);

// Look for "County, Florida" → should either be "Miami-Dade County, Florida"
// or whatever real county was resolved; we just want NO bare "  County, Florida"
const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
  .map(t => t.replace(/<[^>]+>/g, '')).join('');

const bareCounty = [...texts.matchAll(/(\s|in)\s+County,\s*Florida/gi)];
const resolvedCounty = [...texts.matchAll(/in\s+([A-Z][A-Za-z-]+(?: County)?),\s*Florida/g)]
  .map(m => m[1]).filter(c => c !== 'County');

console.log('\n=== County audit ===');
console.log(`  Bare "County, Florida" occurrences: ${bareCounty.length}  ${bareCounty.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  Resolved county fills: ${JSON.stringify([...new Set(resolvedCounty)])}`);

// Final verdict
const pass =
  counts['styles.xml Arial'] === 0 &&
  counts['theme1.xml Arial'] === 0 &&
  counts['document.xml Arial'] === 0 &&
  bareCounty.length === 0;

console.log(`\n=== VERDICT: ${pass ? '✓ PASS' : '✗ FAIL'} ===`);
process.exit(pass ? 0 : 1);
