import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
function extractDocxXml(docxPath) {
  const buf = readFileSync(docxPath);
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;
      if (name === 'word/document.xml') {
        if (compMethod === 0) return buf.subarray(dataStart, dataEnd).toString('utf8');
        if (compMethod === 8) return inflateRawSync(buf.subarray(dataStart, dataEnd)).toString('utf8');
      }
      offset = dataEnd;
    } else offset++;
  }
  return '';
}
const xml = extractDocxXml('/tmp/v_corp.docx');
const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');

// Find shareholder pct context — look around each shareholder name
for (const nm of ['Roberto Carlos Mendez', 'Ana Maria Garcia']) {
  const idx = text.indexOf(nm);
  if (idx > 0) {
    console.log(`\n[${nm}] @ ${idx}`);
    // Look for every occurrence
    let i = idx;
    while (i >= 0) {
      console.log(`  …${text.substring(Math.max(0, i - 20), i + 300).replace(/\s+/g, ' ')}…`);
      i = text.indexOf(nm, i + 1);
      if (i < 0 || i > idx + 50000) break;
    }
  }
}

// Any percentage-looking strings?
console.log('\n=== Percentage-like patterns ===');
for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)) {
  console.log(`  "${m[0]}" at ${m.index}: …${text.substring(Math.max(0, m.index - 30), m.index + 50)}…`);
}
