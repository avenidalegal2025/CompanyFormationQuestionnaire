// Strictly parse document.xml + styles.xml + theme1.xml to find any OOXML
// violation introduced by post-processing that LibreOffice is rejecting.
import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const src = join(process.env.USERPROFILE, 'Downloads', 'PROD_V2_AUDIT.docx');
const zip = new PizZip(readFileSync(src));

const targets = [
  'word/document.xml',
  'word/styles.xml',
  'word/theme/theme1.xml',
  'word/fontTable.xml',
  'word/numbering.xml',
  'word/settings.xml',
  '[Content_Types].xml',
  'word/_rels/document.xml.rels',
];

const errors = [];
const parser = new DOMParser({
  onError: (level, message) => errors.push({ level, msg: message, file: null }),
});

for (const t of targets) {
  const f = zip.file(t);
  if (!f) {
    console.log(`[MISSING] ${t}`);
    continue;
  }
  errors.length = 0;
  const xml = f.asText();
  try {
    const doc = parser.parseFromString(xml, 'text/xml');
    const root = doc.documentElement;
    if (!root || root.nodeName === 'parsererror') {
      console.log(`[FATAL] ${t}: root missing`);
      continue;
    }
    console.log(`[OK-XML] ${t} (${xml.length} bytes, root=<${root.nodeName}>)`);
    // Attach file name to errors
    errors.forEach((e) => (e.file = t));
    for (const e of errors) {
      console.log(`    ${e.level}: ${e.msg}`);
    }
  } catch (e) {
    console.log(`[EXC] ${t}: ${e.message}`);
  }
}

// Quick spot checks on patterns LibreOffice cares about
const doc = zip.file('word/document.xml').asText();

console.log('\n=== PATTERN CHECKS ===');

// 1. Balanced <w:p> tags
const openP = (doc.match(/<w:p[\s>]/g) || []).length;
const closeP = (doc.match(/<\/w:p>/g) || []).length;
console.log(`<w:p> open:${openP}  close:${closeP}  diff:${openP - closeP}`);

// 2. Balanced <w:r> tags
const openR = (doc.match(/<w:r[\s>]/g) || []).length;
const closeR = (doc.match(/<\/w:r>/g) || []).length;
console.log(`<w:r> open:${openR}  close:${closeR}  diff:${openR - closeR}`);

// 3. Balanced <w:tbl>
const openT = (doc.match(/<w:tbl[\s>]/g) || []).length - (doc.match(/<w:tblPr[\s>]/g) || []).length - (doc.match(/<w:tblGrid[\s>]/g) || []).length - (doc.match(/<w:tblLayout[\s>]/g) || []).length - (doc.match(/<w:tblW[\s>]/g) || []).length - (doc.match(/<w:tblBorders[\s>]/g) || []).length - (doc.match(/<w:tblCellMar[\s>]/g) || []).length - (doc.match(/<w:tblStyle[\s>]/g) || []).length - (doc.match(/<w:tblInd[\s>]/g) || []).length - (doc.match(/<w:tblLook[\s>]/g) || []).length;
const closeT = (doc.match(/<\/w:tbl>/g) || []).length;
console.log(`<w:tbl> (estimated) open:${openT}  close:${closeT}`);

// 4. Any lingering docxtemplater markers?
const unrendered = doc.match(/\{[%#][^}]*\}|\{\{[^}]*\}\}/g);
console.log(`Unrendered placeholders: ${unrendered ? unrendered.length : 0}`);
if (unrendered) console.log('  examples:', unrendered.slice(0, 5));

// 5. Any obviously broken attributes (unquoted, etc.)?
const dblQuote = doc.match(/w:val=""[a-z]/gi);
console.log(`Suspicious empty-then-value attrs: ${dblQuote ? dblQuote.length : 0}`);

// 6. Duplicate <w:sectPr> at same level?
const sectPr = (doc.match(/<w:sectPr[\s>]/g) || []).length;
console.log(`<w:sectPr> count: ${sectPr}`);

// 7. Looking for orphaned closing tags
const orphanClose = doc.match(/<\/w:(tabs|tab|ind|p|r|t|tbl|tr|tc|sectPr)>\s*<\/w:(tabs|tab|ind|p|r|t|tbl|tr|tc|sectPr)>/g);
if (orphanClose) console.log(`  POSSIBLE orphan closes: ${orphanClose.length}`);

// Check the rels file
const rels = zip.file('word/_rels/document.xml.rels').asText();
console.log('\n--- document.xml.rels ---');
console.log(rels);
