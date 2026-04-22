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
function fullText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
}

const cases = [
  { file: '/tmp/v_llc.docx', name: 'LLC Full', needles: ['50.1', '50.00', '50%', 'FIFTY PERCENT'] },
  { file: '/tmp/v_corp.docx', name: 'Corp Full', needles: ['VERIFY CORP Inc', 'VERIFY CORP INC', 'June 15', '60.00', '60.00%', '60%', 'Roberto Carlos'] },
  { file: '/tmp/v_corp_min.docx', name: 'Corp Minimal', needles: ['MINIMAL CORP Inc', 'MINIMAL CORP INC', 'January 15', 'Single Owner'] },
];

for (const c of cases) {
  try {
    const xml = extractDocxXml(c.file);
    const text = fullText(xml);
    console.log(`\n=== ${c.name} ===`);
    for (const n of c.needles) {
      const idx = text.indexOf(n);
      if (idx >= 0) {
        const ctx = text.substring(Math.max(0, idx - 30), idx + n.length + 30);
        console.log(`  "${n}" @ ${idx}: …${ctx}…`);
      } else {
        console.log(`  "${n}" NOT FOUND`);
      }
    }
  } catch (e) {
    console.log(`${c.name}: ERROR ${e.message}`);
  }
}
