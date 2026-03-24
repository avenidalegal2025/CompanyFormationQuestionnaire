/**
 * Fix formatting issues in attorney templates:
 * 1. Fix zero-width tab stops (pos="0") to proper width (720 twips = 0.5in)
 * 2. Ensure section numbers have visible tab separation
 */
import PizZip from 'pizzip';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

function fixTemplate(inputPath) {
  const content = readFileSync(inputPath);
  const zip = new PizZip(content);
  let xml = zip.file('word/document.xml').asText();

  let fixes = 0;

  // Fix 1: Replace zero-width tab stops with 720 twips (0.5 inch)
  // Pattern: w:pos="0" in tab definitions
  const before = (xml.match(/w:pos="0"/g) || []).length;
  xml = xml.replace(/<w:tab w:val="left" w:leader="none" w:pos="0"\/>/g, (match) => {
    fixes++;
    return '<w:tab w:val="left" w:leader="none" w:pos="720"/>';
  });
  const after = (xml.match(/w:pos="0"/g) || []).length;
  console.log(`  Zero-width tabs: ${before} -> ${after} (fixed ${fixes})`);

  // Fix 2: In paragraphs where section numbers have no tabs at all,
  // ensure there's at least a space between number and text
  // This is done by the xmlTextReplace in docgen, so we just need the templates right

  zip.file('word/document.xml', xml);
  const output = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  writeFileSync(inputPath, output);
  console.log(`  Saved: ${inputPath} (${output.length} bytes)`);
  return fixes;
}

// Backup originals first
copyFileSync('templates/llc_template.docx', 'templates/llc_template_pre_fix.docx');
copyFileSync('templates/corp_template.docx', 'templates/corp_template_pre_fix.docx');

console.log('Fixing LLC template...');
const llcFixes = fixTemplate('templates/llc_template.docx');

console.log('\nFixing Corp template...');
const corpFixes = fixTemplate('templates/corp_template.docx');

console.log(`\nTotal fixes: LLC=${llcFixes}, Corp=${corpFixes}`);
