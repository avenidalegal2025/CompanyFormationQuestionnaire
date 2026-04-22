// Walk through document.xml tracking <w:p>...</w:p> depth; report the byte
// offset and surrounding context where the depth goes wrong.
import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.env.USERPROFILE, 'Downloads', 'PROD_V2_AUDIT.docx');
const zip = new PizZip(readFileSync(src));
const xml = zip.file('word/document.xml').asText();

// Tokenize just <w:p ...> opens, </w:p> closes, and self-closing <w:p/>
const re = /<w:p(?:\s[^>]*)?(\/)?>|<\/w:p>/g;
let depth = 0;
let m;
let maxDepth = 0;
const events = [];
while ((m = re.exec(xml))) {
  const tag = m[0];
  const selfClose = tag.endsWith('/>');
  const isClose = tag.startsWith('</w:p>');
  if (isClose) {
    depth--;
    events.push({ at: m.index, depth, tag });
  } else if (!selfClose) {
    depth++;
    if (depth > maxDepth) maxDepth = depth;
    events.push({ at: m.index, depth, tag: tag.substring(0, 60) });
  }
  if (depth < 0 || depth > 1) {
    // In Word docs <w:p> never nests, so depth should alternate 0-1
    console.log(`!! Unexpected depth ${depth} at offset ${m.index}: ${tag.substring(0, 80)}`);
    console.log(`   context: ...${xml.substring(Math.max(0, m.index - 120), m.index + 80).replace(/\s+/g, ' ')}...`);
    console.log(`   after:   ...${xml.substring(m.index + tag.length, m.index + tag.length + 200).replace(/\s+/g, ' ')}...`);
    if (depth < 0) {
      depth = 0; // recover to keep scanning
    }
    if (events.length > 0 && depth > 1) break; // report first issue
  }
}
console.log(`\nFinal depth: ${depth}  (expected 0)  maxDepth: ${maxDepth}`);
console.log(`Total open+close events: ${events.length}`);

// Show the last 20 transitions
console.log('\nLast 20 events:');
for (const e of events.slice(-20)) {
  console.log(`  @${String(e.at).padStart(6)}  d=${e.depth}  ${e.tag.substring(0, 90)}`);
}
