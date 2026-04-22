// Identity-repack the audit DOCX using PizZip with the exact same options
// docgen uses, to rule out zip-structure issues.
import PizZip from 'pizzip';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.env.USERPROFILE, 'Downloads', 'PROD_V2_AUDIT.docx');
const dst = join(process.env.USERPROFILE, 'Downloads', 'PROD_V2_AUDIT_repacked.docx');

const zip = new PizZip(readFileSync(src));
console.log('Files in source:', Object.keys(zip.files).length);
for (const name of Object.keys(zip.files)) {
  const f = zip.files[name];
  console.log(' ', name, f._data ? (f._data.uncompressedSize || 'n/a') : 'no _data');
}

const out = zip.generate({
  type: 'nodebuffer',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
writeFileSync(dst, out);
console.log('\nWrote:', dst, '(', out.length, 'bytes)');
