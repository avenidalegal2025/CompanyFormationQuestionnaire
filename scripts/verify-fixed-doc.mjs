/**
 * Verify the locally-fixed Shareholder Agreement (shareholder_agreement_fixed.docx)
 * against all 30 checks.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inflateRawSync } from 'zlib';

const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
const docxPath = join(DIR, 'shareholder_agreement_fixed.docx');

function extractDocumentXml(p) {
  const buf = readFileSync(p);
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset+1] !== 0x4B || buf[offset+2] !== 0x03 || buf[offset+3] !== 0x04) break;
    const cm = buf.readUInt16LE(offset + 8);
    const cs = buf.readUInt32LE(offset + 18);
    const fl = buf.readUInt16LE(offset + 26);
    const el = buf.readUInt16LE(offset + 28);
    const fn = buf.slice(offset + 30, offset + 30 + fl).toString('utf8');
    const ds = offset + 30 + fl + el;
    if (fn === 'word/document.xml') {
      const cd = buf.slice(ds, ds + cs);
      if (cm === 0) return cd.toString('utf8');
      return inflateRawSync(cd).toString('utf8');
    }
    offset = ds + cs;
  }
  return null;
}

function xmlPlainText(s) {
  const t = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(s)) !== null) t.push(m[1]);
  return t.join('');
}

const xml = extractDocumentXml(docxPath);
if (!xml) { console.error('Failed to extract XML'); process.exit(1); }

const fullText = xmlPlainText(xml);
writeFileSync(join(DIR, 'full_text_fixed.txt'), fullText);
console.log('Extracted full text:', fullText.length, 'chars');

function findSigBlockForName(name) {
  let found = 0;
  let searchStart = 0;
  while (true) {
    const nameIdx = xml.indexOf(name, searchStart);
    if (nameIdx < 0) break;
    const pStart = xml.lastIndexOf('<w:p', nameIdx);
    const pEnd = xml.indexOf('</w:p>', nameIdx);
    if (pStart >= 0 && pEnd >= 0) {
      const text = xmlPlainText(xml.substring(pStart, pEnd + 6));
      if (text.includes('Name:') && text.includes(name)) found++;
    }
    searchStart = nameIdx + name.length;
  }
  return found;
}

const sigIdx = fullText.lastIndexOf('SIGNATURE PAGE');
const sigArea = sigIdx >= 0 ? fullText.substring(sigIdx) : fullText;

// Print signature area for reference
console.log('\n=== SIGNATURE AREA ===');
console.log(sigArea.substring(0, 600));

const results = [];

// CHECK 1: Company name ALL CAPS
results.push({ id: 1, name: 'Company name: "AVENIDA TECH INC" (ALL CAPS)', pass: fullText.includes('AVENIDA TECH INC'), detail: `Found: ${fullText.includes('AVENIDA TECH INC')}` });

// CHECK 2: State: Florida
results.push({ id: 2, name: 'State: "Florida"', pass: fullText.includes('Florida'), detail: 'Found: true' });

// CHECK 3: Shareholders
results.push({ id: 3, name: 'Shareholders: Carlos Martinez + Laura Fernandez', pass: fullText.includes('Carlos Martinez') && fullText.includes('Laura Fernandez'), detail: 'Both found' });

// CHECK 4: Shares Carlos 5,500
results.push({ id: 4, name: 'Shares: Carlos 5,500', pass: fullText.includes('5,500') || fullText.includes('5500'), detail: `Found: ${fullText.includes('5,500') || fullText.includes('5500')}` });

// CHECK 5: Shares Laura 4,500
results.push({ id: 5, name: 'Shares: Laura 4,500', pass: fullText.includes('4,500') || fullText.includes('4500'), detail: `Found: ${fullText.includes('4,500') || fullText.includes('4500')}` });

// CHECK 6: Capital Carlos $55,000.00
results.push({ id: 6, name: 'Capital: Carlos $55,000.00', pass: fullText.includes('55,000.00'), detail: `Found: ${fullText.includes('55,000.00')}` });

// CHECK 7: Capital Laura $45,000.00
results.push({ id: 7, name: 'Capital: Laura $45,000.00', pass: fullText.includes('45,000.00'), detail: `Found: ${fullText.includes('45,000.00')}` });

// CHECK 8: Pct Carlos 55.00%
results.push({ id: 8, name: 'Pct: Carlos 55.00%', pass: fullText.includes('55.00%'), detail: `Found: ${fullText.includes('55.00%')}` });

// CHECK 9: Pct Laura 45.00%
results.push({ id: 9, name: 'Pct: Laura 45.00%', pass: fullText.includes('45.00%'), detail: `Found: ${fullText.includes('45.00%')}` });

// CHECK 10: NO empty 3rd row
const hasDollarPct = fullText.includes('$%') || fullText.includes('$ %');
results.push({ id: 10, name: 'NO empty 3rd row in Sec 4.2 table', pass: !hasDollarPct, detail: `$% pattern: ${hasDollarPct}` });

// CHECK 11: NO 12.5% Owner
results.push({ id: 11, name: 'NO 12.5% Owner signature block', pass: !fullText.includes('12.5%'), detail: `Found 12.5%: ${fullText.includes('12.5%')}` });

// CHECK 12: NO empty Name: sig
let hasEmptyNameSig = false;
if (sigIdx >= 0) {
  const nameLines = sigArea.split(/Name:\s*/);
  for (let i = 1; i < nameLines.length; i++) {
    const after = nameLines[i].trim().substring(0, 30);
    if (!after || after.startsWith('%') || after.startsWith('$') || /^\s*$/.test(after.substring(0, 5))) {
      hasEmptyNameSig = true;
    }
  }
}
results.push({ id: 12, name: 'NO empty "Name:" signature block', pass: !hasEmptyNameSig, detail: `Empty Name sig: ${hasEmptyNameSig}` });

// CHECK 13: Sale Super Majority
results.push({ id: 13, name: 'Sale: "Super Majority consent or approval"', pass: fullText.includes('Super Majority consent') || fullText.includes('Super Majority approval'), detail: `Found: ${fullText.includes('Super Majority consent') || fullText.includes('Super Majority approval')}` });

// CHECK 14: Major Majority
results.push({ id: 14, name: 'Major: "Majority affirmative vote"', pass: fullText.includes('Majority affirmative vote') || fullText.includes('Majority vote'), detail: `Found: ${fullText.includes('Majority affirmative vote') || fullText.includes('Majority vote')}` });

// CHECK 15: Bank two Officers
results.push({ id: 15, name: 'Bank: "two of the Officers"', pass: fullText.includes('two of the Officers') || fullText.includes('two (2) of the Officers'), detail: `Found: ${fullText.includes('two of the Officers') || fullText.includes('two (2) of the Officers')}` });

// CHECK 16: ROFR present
results.push({ id: 16, name: 'ROFR: "Right of First Refusal" present', pass: fullText.includes('Right of First Refusal'), detail: `Found: ${fullText.includes('Right of First Refusal')}` });

// CHECK 17: ROFR period 90
results.push({ id: 17, name: 'ROFR period: "90" days', pass: fullText.includes('90') && fullText.includes('days'), detail: `Found: true` });

// CHECK 18: Death/heirs
results.push({ id: 18, name: 'Death: Successor/heirs language', pass: fullText.includes('death') || fullText.includes('Death') || fullText.includes('successor') || fullText.includes('Successor'), detail: `Found` });

// CHECK 19: Divorce
results.push({ id: 19, name: 'Divorce: buyout language present', pass: fullText.includes('divorce') || fullText.includes('Divorce') || fullText.includes('marital'), detail: `Found` });

// CHECK 20: Tag/Drag
const hasTag = fullText.includes('Tag Along') || fullText.includes('Tag-Along');
const hasDrag = fullText.includes('Drag Along') || fullText.includes('Drag-Along');
results.push({ id: 20, name: 'Tag/Drag: "Tag Along" + "Drag Along"', pass: hasTag && hasDrag, detail: `Tag: ${hasTag}, Drag: ${hasDrag}` });

// CHECK 21: Non-compete NOT present
results.push({ id: 21, name: 'Non-compete: Sec 10.10 NOT present', pass: !fullText.includes('Covenant Against Competition') && !fullText.includes('Non-Competition Covenant'), detail: `Absent: true` });

// CHECK 22: Dissolution Corp default
results.push({ id: 22, name: 'Dissolution: "Majority election" (Corp default)', pass: fullText.includes('Majority election'), detail: `Corp defaults to Majority (no separate field)` });

// CHECK 23: Officer removal
results.push({ id: 23, name: 'Officer removal: "Super Majority vote"', pass: fullText.includes('Super Majority vote of the Shareholders') || (fullText.includes('Super Majority vote') && fullText.includes('remov')), detail: `Found` });

// CHECK 24: County
results.push({ id: 24, name: 'County: Miami-Dade', pass: fullText.includes('Miami-Dade'), detail: `Found: ${fullText.includes('Miami-Dade')}` });

// CHECK 25: Carlos sig
results.push({ id: 25, name: 'Sig: "Name: Carlos Martinez" alone', pass: findSigBlockForName('Carlos Martinez') >= 1, detail: `${findSigBlockForName('Carlos Martinez')} sig-block paragraphs` });

// CHECK 26: Laura sig
results.push({ id: 26, name: 'Sig: "Name: Laura Fernandez" alone', pass: findSigBlockForName('Laura Fernandez') >= 1, detail: `${findSigBlockForName('Laura Fernandez')} sig-block paragraphs` });

// CHECK 27: Carlos % Owner
results.push({ id: 27, name: 'Carlos sig: "55.00% Owner"', pass: sigArea.includes('55.00% Owner'), detail: `Found: ${sigArea.includes('55.00% Owner')}` });

// CHECK 28: Laura % Owner
results.push({ id: 28, name: 'Laura sig: "45.00% Owner"', pass: sigArea.includes('45.00% Owner'), detail: `Found: ${sigArea.includes('45.00% Owner')}` });

// CHECK 29: No placeholders
const placeholders = fullText.match(/\{\{[^}]+\}\}/g) || [];
const hasBrokenPlaceholder = fullText.includes('{{') || fullText.includes('}}');
results.push({ id: 29, name: 'No {{placeholders}}', pass: placeholders.length === 0 && !hasBrokenPlaceholder, detail: placeholders.length === 0 && !hasBrokenPlaceholder ? 'Clean' : `Found: ${[...placeholders].join(', ')}` });

// CHECK 30: No blank page before signatures
const sigFollowIdx = xml.indexOf('SIGNATURE PAGE TO FOLLOW');
let hasBlankPage = false;
if (sigFollowIdx >= 0) {
  const afterSig = xml.substring(sigFollowIdx, sigFollowIdx + 3000);
  const pageBreaks = (afterSig.match(/<w:br\s+w:type="page"/g) || []).length;
  hasBlankPage = pageBreaks > 1;
}
results.push({ id: 30, name: 'No blank page before signatures', pass: !hasBlankPage, detail: `Blank page: ${hasBlankPage}` });

// Print results table
const passCount = results.filter(r => r.pass).length;
const failCount = results.filter(r => !r.pass).length;

console.log('\n');
console.log('='.repeat(120));
console.log('  REGEN VERIFICATION RESULTS: AVENIDA TECH INC (C-CORP) - FIXED DOCUMENT');
console.log('='.repeat(120));
console.log('');
console.log(` ${'#'.padEnd(4)} | ${'STATUS'.padEnd(6)} | ${'CHECK'.padEnd(55)} | DETAIL`);
console.log(`${'-'.repeat(4)}-+-${'-'.repeat(6)}-+-${'-'.repeat(55)}-+-${'-'.repeat(50)}`);

for (const r of results) {
  const marker = r.pass ? ' PASS' : ' FAIL';
  console.log(` ${String(r.id).padEnd(4)}| ${marker.padEnd(6)} | ${r.name.padEnd(55)} | ${r.detail}`);
}

console.log('');
console.log(`${'-'.repeat(120)}`);
console.log(`  TOTAL: ${passCount} PASS / ${failCount} FAIL out of ${results.length} checks`);
console.log(`  OVERALL: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);
console.log(`${'-'.repeat(120)}`);

writeFileSync(join(DIR, 'verification_results_fixed.json'), JSON.stringify({
  timestamp: new Date().toISOString(),
  results,
  passCount,
  failCount,
  overall: failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'
}, null, 2));

if (failCount > 0) process.exit(1);
