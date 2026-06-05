// Robust DOCX -> plain text (central-directory based, handles data descriptors).
// Usage: node scripts/_docx_text.mjs <file.docx> [grepRegex]
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function docxText(path) {
  const buf = readFileSync(path);
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no EOCD');
  let cd = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  let xml = '';
  for (let e = 0; e < total; e++) {
    if (buf.readUInt32LE(cd) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cd + 10);
    const csize = buf.readUInt32LE(cd + 20);
    const nl = buf.readUInt16LE(cd + 28);
    const el = buf.readUInt16LE(cd + 32);
    const cl = buf.readUInt16LE(cd + 34);
    const lho = buf.readUInt32LE(cd + 42);
    const name = buf.toString('utf8', cd + 46, cd + 46 + nl);
    if (name === 'word/document.xml') {
      const lnl = buf.readUInt16LE(lho + 26);
      const lel = buf.readUInt16LE(lho + 28);
      const ds = lho + 30 + lnl + lel;
      const comp = buf.subarray(ds, ds + csize);
      xml = method === 0 ? comp.toString('utf8') : inflateRawSync(comp).toString('utf8');
      break;
    }
    cd += 46 + nl + el + cl;
  }
  if (!xml) throw new Error('word/document.xml not found');
  // paragraph-aware: newline per <w:p>, tab per <w:tab/>, keep text
  const text = xml
    .replace(/<w:p\b[^>]*>/g, '\n')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.split('\n').map(s => s.replace(/\s+$/,'').replace(/^\s+/,'')).filter(Boolean);
}

const path = process.argv[2];
const re = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const lines = docxText(path);
if (re) lines.forEach((l, i) => { if (re.test(l)) console.log(String(i).padStart(4) + ': ' + l.slice(0, 200)); });
else lines.forEach((l, i) => console.log(String(i).padStart(4) + ': ' + l.slice(0, 200)));
