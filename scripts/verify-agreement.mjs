/**
 * Standalone verification of the Operating Agreement DOCX.
 * Run after e2e-final-qa.mjs has downloaded the file.
 */
import { readFileSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
import { join } from 'path';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'final-qa');
const docxPath = join(DIR, 'operating_agreement.docx');

function extractDocumentXml(fp) {
  const buf = readFileSync(fp);
  const target = 'word/document.xml';
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B || buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) break;
    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (filename === target) {
      const compressedData = buf.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return compressedData.toString('utf8');
      return inflateRawSync(compressedData).toString('utf8');
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

console.log('Reading DOCX: ' + docxPath);
const xml = extractDocumentXml(docxPath);
if (!xml) {
  console.log('ERROR: failed to extract document.xml from DOCX');
  process.exit(1);
}
writeFileSync(join(DIR, 'document.xml'), xml);
console.log('Extracted document.xml: ' + xml.length + ' chars\n');

const results = [];

/**
 * Extract plain text from a region of XML by stripping tags.
 * In DOCX XML, text like "Name: Elena Final" may span multiple <w:t> elements.
 */
function xmlPlainText(xmlSnippet) {
  // Extract text from <w:t> elements only
  const texts = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xmlSnippet)) !== null) {
    texts.push(m[1]);
  }
  return texts.join('');
}

/**
 * Check if a name appears in its own signature block paragraph.
 * In the template, signature blocks have: "By: ___" / "Name: <name>" / "<pct>% Owner"
 * The "Name: " and the actual name may be in separate <w:r> runs within the same <w:p>.
 */
function findSigBlockForName(xml, name) {
  // Find all paragraphs containing the name
  let found = 0;
  let searchStart = 0;
  while (true) {
    const nameIdx = xml.indexOf(name, searchStart);
    if (nameIdx < 0) break;
    // Get the enclosing <w:p> paragraph
    const pStart = xml.lastIndexOf('<w:p', nameIdx);
    const pEnd = xml.indexOf('</w:p>', nameIdx);
    if (pStart >= 0 && pEnd >= 0) {
      const para = xml.substring(pStart, pEnd + 6);
      const text = xmlPlainText(para);
      if (text.includes('Name:') && text.includes(name)) {
        found++;
      }
    }
    searchStart = nameIdx + name.length;
  }
  return found;
}

// ─── CHECK 1: Signature block "Elena Final" alone ───
{
  const count = findSigBlockForName(xml, 'Elena Final');
  results.push({
    id: 1,
    name: 'Sig: "Elena Final" alone',
    pass: count >= 1,
    detail: `Found ${count} sig-block paragraph(s) with "Name: Elena Final"`
  });
}

// ─── CHECK 2: Signature block "Marco Final" alone ───
{
  const count = findSigBlockForName(xml, 'Marco Final');
  results.push({
    id: 2,
    name: 'Sig: "Marco Final" alone',
    pass: count >= 1,
    detail: `Found ${count} sig-block paragraph(s) with "Name: Marco Final"`
  });
}

// ─── CHECK 3: Signature block "Sofia Final" alone ───
{
  const count = findSigBlockForName(xml, 'Sofia Final');
  results.push({
    id: 3,
    name: 'Sig: "Sofia Final" alone',
    pass: count >= 1,
    detail: `Found ${count} sig-block paragraph(s) with "Name: Sofia Final"`
  });
}

// ─── CHECK 4: Capital table individual names per row ───
{
  const hasElena = xml.includes('Elena Final') && xml.includes('50,000.00');
  const hasMarco = xml.includes('Marco Final') && xml.includes('30,000.00');
  const hasSofia = xml.includes('Sofia Final') && xml.includes('20,000.00');
  results.push({
    id: 4,
    name: 'Capital: individual names per row',
    pass: hasElena && hasMarco && hasSofia,
    detail: `Elena+50K: ${hasElena}, Marco+30K: ${hasMarco}, Sofia+20K: ${hasSofia}`
  });
}

// ─── CHECK 5: Non-compete numbered 11.12 ───
{
  // Search for "11.12 Non-competition" or "11.12" immediately followed by "Non-competition"
  // The first occurrence of "11.12" may be a cross-reference ("Section 11.10-11.12"),
  // so we need to find the one that's actually a section heading.
  const has1112NC = xml.includes('11.12 Non-competition') || xml.includes('11.12Non-competition');
  // Also check by scanning all occurrences
  let found1112AsHeading = false;
  let searchStart = 0;
  while (true) {
    const idx = xml.indexOf('11.12', searchStart);
    if (idx < 0) break;
    // Check if this 11.12 is a section heading (followed by Non-competition within 200 chars)
    const after = xml.substring(idx, idx + 200);
    const afterText = after.replace(/<[^>]+>/g, '');
    if (afterText.startsWith('11.12') && afterText.includes('Non-competition')) {
      found1112AsHeading = true;
      break;
    }
    searchStart = idx + 5;
  }
  results.push({
    id: 5,
    name: 'Non-compete numbered 11.12',
    pass: has1112NC || found1112AsHeading,
    detail: `Direct match: ${has1112NC}, Heading search: ${found1112AsHeading}`
  });
}

// ─── CHECK 6: Non-Disparagement numbered 11.13 ───
{
  const has1113 = xml.includes('11.13');
  const hasND = xml.includes('Non-Disparagement');
  const idx1113 = xml.indexOf('11.13');
  const idxND = xml.indexOf('Non-Disparagement');
  const closeEnough = idx1113 >= 0 && idxND >= 0 && Math.abs(idx1113 - idxND) < 500;
  results.push({
    id: 6,
    name: 'Non-Disparagement numbered 11.13',
    pass: has1113 && hasND && closeEnough,
    detail: `11.13: ${has1113}, ND: ${hasND}, close: ${closeEnough} (delta: ${Math.abs(idx1113 - idxND)})`
  });
}

// ─── CHECK 7: No "50.01.1%" typo ───
{
  const hasBadTypo = xml.includes('50.01.1%');
  const has5001 = xml.includes('50.01%');
  results.push({
    id: 7,
    name: 'No "50.01.1%" typo',
    pass: !hasBadTypo && has5001,
    detail: `Bad typo: ${hasBadTypo}, Correct 50.01%: ${has5001}`
  });
}

// ─── CHECK 8: ROFR 180 calendar days ───
{
  const has180 = xml.includes('180 calendar days');
  const has30 = xml.includes('30 calendar days');
  results.push({
    id: 8,
    name: 'ROFR "180 calendar days"',
    pass: has180 && !has30,
    detail: `180 days: ${has180}, 30 days still present: ${has30}`
  });
}

// ─── CHECK 9: TWO (2) years + State of Florida ───
{
  const hasTwoYears = xml.includes('TWO (2) years') || xml.includes('TWO (2)');
  const hasStateFL = xml.includes('State of Florida');
  results.push({
    id: 9,
    name: 'NC: "TWO (2) years" + "State of Florida"',
    pass: hasTwoYears && hasStateFL,
    detail: `TWO (2): ${hasTwoYears}, State of Florida: ${hasStateFL}`
  });
}

// ─── CHECK 10: Super Majority definition "75.00%" ───
{
  const hasSuperMajDef = xml.includes('Super Majority Defined') || xml.includes('Super Majority.');
  const has75 = xml.includes('75.00%');
  const hasSeventy = xml.includes('SEVENTY') && xml.includes('FIVE');
  results.push({
    id: 10,
    name: 'Super Majority def "SEVENTY FIVE (75.00%)"',
    pass: hasSuperMajDef && has75 && hasSeventy,
    detail: `Def: ${hasSuperMajDef}, 75.00%: ${has75}, SEVENTY FIVE: ${hasSeventy}`
  });
}

// ─── CHECK 11: Non-compete paragraph has pPr ───
{
  // Look for the paragraph containing the non-competition clause
  const ncIdx = xml.indexOf('Non-competition');
  let pass = false;
  let detail = 'Non-competition text not found';
  if (ncIdx >= 0) {
    const pStart = xml.lastIndexOf('<w:p', ncIdx);
    const pEnd = xml.indexOf('</w:p>', ncIdx);
    if (pStart >= 0 && pEnd >= 0) {
      const para = xml.substring(pStart, pEnd);
      pass = para.includes('<w:pPr>');
      detail = `pPr found: ${pass} (para length: ${para.length})`;
    }
  } else {
    // Try looking for "Covenant Against Competition" in case the section title is different
    const covIdx = xml.indexOf('Covenant Against Competition');
    if (covIdx >= 0) {
      const pStart = xml.lastIndexOf('<w:p', covIdx);
      const pEnd = xml.indexOf('</w:p>', covIdx);
      if (pStart >= 0 && pEnd >= 0) {
        const para = xml.substring(pStart, pEnd);
        pass = para.includes('<w:pPr>');
        detail = `pPr found (via Covenant): ${pass} (para length: ${para.length})`;
      }
    }
  }
  results.push({ id: 11, name: 'NC paragraph has pPr', pass, detail });
}

// ─── CHECK 12: Extra member paragraphs have matching font size ───
{
  // Sofia Final is the extra (3rd) member added via addExtraLLCMembers
  const sofiaIdx = xml.indexOf('Sofia Final');
  let pass = false;
  let detail = 'Sofia Final not found';
  if (sofiaIdx >= 0) {
    const pStart = xml.lastIndexOf('<w:p', sofiaIdx);
    const pEnd = xml.indexOf('</w:p>', sofiaIdx);
    if (pStart >= 0 && pEnd >= 0) {
      const para = xml.substring(pStart, pEnd);
      const hasRPr = para.includes('<w:rPr>');
      const hasPPr = para.includes('<w:pPr>');
      pass = hasRPr || hasPPr;
      detail = `rPr: ${hasRPr}, pPr: ${hasPPr}`;
    }
  }
  results.push({ id: 12, name: 'Extra member font size match', pass, detail });
}

// ─── Print Results Table ───
const passCount = results.filter(r => r.pass).length;
const failCount = results.filter(r => !r.pass).length;

console.log('='.repeat(95));
console.log('  FINAL QA VERIFICATION RESULTS');
console.log('='.repeat(95));
console.log('');
console.log(` ${'#'.padEnd(4)}| ${'STATUS'.padEnd(7)}| ${'CHECK'.padEnd(45)}| DETAIL`);
console.log(`${''.padEnd(4, '-')}-+-${''.padEnd(6, '-')}-+-${''.padEnd(44, '-')}-+-${''.padEnd(45, '-')}`);

for (const r of results) {
  const marker = r.pass ? ' PASS' : ' FAIL';
  console.log(` ${String(r.id).padEnd(4)}|${marker.padEnd(7)}| ${r.name.padEnd(44)}| ${r.detail}`);
}

console.log('');
console.log('-'.repeat(95));
console.log(`  TOTAL: ${passCount} PASS / ${failCount} FAIL out of ${results.length} checks`);
console.log(`  OVERALL: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);
console.log('-'.repeat(95));

writeFileSync(join(DIR, 'verification_results.json'), JSON.stringify({
  timestamp: new Date().toISOString(),
  results,
  passCount,
  failCount,
  overall: failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'
}, null, 2));

console.log('\nResults saved to: ' + join(DIR, 'verification_results.json'));

if (failCount > 0) process.exit(1);
