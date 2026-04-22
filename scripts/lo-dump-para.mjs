import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const buf = readFileSync(join(process.env.USERPROFILE, 'Downloads', 'LOCAL_CORP.docx'));
const zip = new PizZip(buf);
const xml = zip.file('word/document.xml').asText();

const targets = ['1.10', 'Commencement', 'Dissolution', 'Specific Responsibilities'];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

for (const t of targets) {
  const re = new RegExp('<w:p\\b[^>]*>(?:(?!</w:p>)[\\s\\S])*?<w:t[^>]*>' + esc(t) + '(?:(?!</w:p>)[\\s\\S])*?</w:p>');
  const m = xml.match(re);
  if (!m) { console.log(`[${t}] NOT FOUND`); continue; }
  console.log(`\n=== [${t}] ===`);
  console.log(m[0].replace(/></g, '>\n<'));
}
