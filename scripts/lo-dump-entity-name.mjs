import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const buf = readFileSync(join(process.env.USERPROFILE, 'Downloads', 'pw-verify-real-api', 'REAL_API_CORP.docx'));
const zip = new PizZip(buf);
const xml = zip.file('word/document.xml').asText();
const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');

// Find variants
for (const needle of ['PW REAL', 'PW', 'REAL API', 'LO REPRO', 'PW REAL API']) {
  const idx = text.indexOf(needle);
  console.log(`"${needle}" at ${idx}:`, idx >= 0 ? JSON.stringify(text.substring(Math.max(0, idx - 30), idx + 80)) : '(not found)');
}
// Dump first 500 chars of text
console.log('\nFirst 500 chars:', JSON.stringify(text.substring(0, 500)));
