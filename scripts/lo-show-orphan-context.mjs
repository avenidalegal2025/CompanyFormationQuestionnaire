// Show full textual content around offset 488062-488195 where the orphan <w:p> is
import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.env.USERPROFILE, 'Downloads', 'PROD_V2_AUDIT.docx');
const zip = new PizZip(readFileSync(src));
const xml = zip.file('word/document.xml').asText();

// Grab the broken region
const start = 487700;  // a few paragraphs before
const end = 488900;    // a few after
console.log(`Offset ${start}..${end}:\n`);
const snippet = xml.substring(start, end);
// Pretty-indent
const pretty = snippet
  .replace(/></g, '>\n<')
  .split('\n')
  .map((l, i) => `  ${String(i).padStart(3)}| ${l}`)
  .join('\n');
console.log(pretty);

// Also extract text content from the broken paragraphs
console.log('\n\n=== TEXT CONTENT around offset ===');
// Grab 3000 chars, regex extract text runs
const chunk = xml.substring(487000, 490000);
const texts = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
console.log(texts.join(' | '));
