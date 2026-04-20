/**
 * End-to-end audit of all v2 fixes against the newest PLAYWRIGHT QA Corp
 * Shareholder Agreement in S3 (generated via full Stripe webhook flow).
 *
 *   #7  fonts: only TNR + preserved set
 *   #10 capital table fits in margins (tblW=9000)
 *   #11/12 §9.2 romanette list has tight hanging indent, no 8640 tab stop
 *   #13 spending threshold $25,000 renders exactly (no $225,000)
 *   #16 signature block: titled owner shows title, untitled has no Owner line
 *   #17 [SIGNATURE PAGE BELOW] heading gone
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';

const BUCKET = 'avenida-legal-documents';
const HOME = process.env.USERPROFILE || '.';

const listing = execSync(
  `aws s3 ls s3://${BUCKET}/ --recursive --profile llc-admin --region us-west-1`,
  { encoding: 'utf8' },
);
const agreement = listing.split('\n')
  .filter((l) => /PLAYWRIGHT.*Shareholder Agreement\.docx/i.test(l))
  .map((l) => {
    const parts = l.trim().split(/\s+/);
    return { date: parts[0] + ' ' + parts[1], key: parts.slice(3).join(' ') };
  })
  .sort((a, b) => b.date.localeCompare(a.date))[0];

if (!agreement) {
  console.error('FAIL: no PLAYWRIGHT Shareholder Agreement in S3');
  process.exit(1);
}
console.log(`Auditing: ${agreement.date}  ${agreement.key}`);

const localPath = join(HOME, 'Downloads', 'PROD_V2_AUDIT.docx');
execSync(
  `aws s3 cp "s3://${BUCKET}/${agreement.key}" "${localPath}" --profile llc-admin --region us-west-1`,
  { encoding: 'utf8' },
);
console.log(`Downloaded to ${localPath}\n`);

const zip = new PizZip(readFileSync(localPath));
const doc = zip.file('word/document.xml').asText();
const styles = zip.file('word/styles.xml').asText();
const theme = zip.file('word/theme/theme1.xml')?.asText() || '';
const texts = (doc.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
  .map((t) => t.replace(/<[^>]+>/g, ''))
  .join('');

const results = [];
const add = (id, ok, detail = '') => results.push({ id, ok, detail });

// ─── #7 FONTS ─────────────────────────────────────────────
const allowedFonts = new Set(['Times New Roman', 'Symbol', 'Courier New', 'Wingdings']);
const docFonts = [...new Set([...doc.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]))];
const stylesFonts = [...new Set([...styles.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]))];
const themeFonts = [...new Set([...theme.matchAll(/typeface="([^"]+)"/g)].map((m) => m[1]))];
const docBad = docFonts.filter((f) => !allowedFonts.has(f));
const stylesBad = stylesFonts.filter((f) => !allowedFonts.has(f));
const themeBad = themeFonts.filter((f) => !allowedFonts.has(f));
add('#7a document.xml fonts', docBad.length === 0, `found: ${docFonts.join(',')} | bad: ${docBad.join(',') || 'none'}`);
add('#7b styles.xml fonts', stylesBad.length === 0, `found: ${stylesFonts.join(',')} | bad: ${stylesBad.join(',') || 'none'}`);
add('#7c theme1.xml fonts', themeBad.length === 0, `found: ${themeFonts.join(',')} | bad: ${themeBad.join(',') || 'none'}`);

// ─── #10 CAPITAL TABLE ────────────────────────────────────
const anchor = doc.indexOf('Number of Shares');
if (anchor > 0) {
  const tblStart = doc.lastIndexOf('<w:tbl>', anchor);
  const tblEnd = doc.indexOf('</w:tbl>', anchor);
  const tbl = doc.substring(tblStart, tblEnd);
  const tblW = tbl.match(/<w:tblW\s+w:w="(\d+)"/)?.[1];
  add('#10a capital tblW <= 9360', Number(tblW) <= 9360, `tblW=${tblW} (page content 9360)`);
  add('#10b tblLayout fixed', /<w:tblLayout\s+w:type="fixed"\s*\/>/.test(tbl), '');
  add('#10c tblGrid 4-col 2700/1800/2250/2250',
    /<w:gridCol\s+w:w="2700"\s*\/>/.test(tbl) &&
    /<w:gridCol\s+w:w="1800"\s*\/>/.test(tbl) &&
    /<w:gridCol\s+w:w="2250"\s*\/>/.test(tbl), '');
}

// ─── #11/12 § 9.2 ROMANETTE LIST ──────────────────────────
const allParas = [...doc.matchAll(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)];
const badRoms = allParas.filter((m) => {
  const p = m[0];
  const txt = (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('');
  if (!/^\((?:i|ii|iii|iv)\)/.test(txt)) return false;
  return /w:pos="8640"/.test(p) && !/<w:ind\s+w:left="720"\s+w:hanging="360"/.test(p);
});
add('#11 no §9.2 romanette left with wide tabs', badRoms.length === 0, `bad count: ${badRoms.length}`);
add('#11 some romanette has hanging indent',
  allParas.some((m) => /<w:ind\s+w:left="720"\s+w:hanging="360"/.test(m[0])), '');

// ─── #13 SPENDING THRESHOLD ───────────────────────────────
const excessMatch = texts.match(/excess of\s*\$([\d,]+(?:\.\d+)?)/);
const renderedSpending = excessMatch?.[1] || '(not found)';
add('#13 $25,000.00 (not $225,000)',
  excessMatch?.[1] === '25,000.00',
  `'excess of $' -> $${renderedSpending}`);

// ─── #16 SIGNATURE BLOCK ──────────────────────────────────
// The Corp E2E sets per-owner responsibilities:
//   Accionista 1: "Chief Executive Officer" + desc
//   Accionista 2: "Chief Technology Officer" + desc
const johnBlock = texts.match(/Name:\s*John TestOne[\s\S]{0,150}/)?.[0] || '';
const janeBlock = texts.match(/Name:\s*Jane TestTwo[\s\S]{0,150}/)?.[0] || '';
add('#16 John signature shows "Chief Executive Officer"',
  /Chief Executive Officer/.test(johnBlock),
  `John block: ${johnBlock.substring(0, 100).replace(/\s+/g, ' ')}`);
add('#16 Jane signature shows "Chief Technology Officer"',
  /Chief Technology Officer/.test(janeBlock),
  `Jane block: ${janeBlock.substring(0, 100).replace(/\s+/g, ' ')}`);
add('#16 no "Owner" directly after Name: lines',
  !/Name:\s*\S[^<]{0,60}\s+Owner\b\s/.test(texts), '');

// ─── #17 SIGNATURE PAGE HEADING ──────────────────────────
add('#17 [SIGNATURE PAGE BELOW] removed',
  !/\[SIGNATURE PAGE BELOW\]/.test(texts), '');
add('#17 no SIGNATURE PAGE BELOW in raw XML',
  !/SIGNATURE PAGE BELOW/i.test(doc), '');

// ─── Report ──────────────────────────────────────────────
console.log('\n=== v2 AUDIT RESULTS ===');
let fails = 0;
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.id}${r.detail ? '  — ' + r.detail : ''}`);
  if (!r.ok) fails++;
}
console.log(`\n${fails === 0 ? '✓ ALL v2 FIXES VERIFIED' : `✗ ${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
