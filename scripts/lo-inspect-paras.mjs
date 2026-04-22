import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const buf = readFileSync(join(process.env.USERPROFILE, 'Downloads', 'LOCAL_CORP.docx'));
const zip = new PizZip(buf);
const xml = zip.file('word/document.xml').asText();

const targets = ['1.8', '1.10', '1.11', '2.1', 'Commencement', 'Dissolution', 'Authorized Shares', 'Reports', 'Records', 'Specific Responsibilities'];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

for (const t of targets) {
  const re = new RegExp('<w:p\\b[^>]*>(?:(?!</w:p>)[\\s\\S])*?<w:t[^>]*>' + esc(t) + '(?:(?!</w:p>)[\\s\\S])*?</w:p>');
  const m = xml.match(re);
  if (!m) { console.log(`[${t}] NOT FOUND`); continue; }
  const para = m[0];
  const ind = para.match(/<w:ind [^/]*\/>/);
  const tabs = para.match(/<w:tabs>[\s\S]*?<\/w:tabs>/);
  const style = para.match(/<w:pStyle w:val="([^"]+)"\/>/);
  console.log(`[${t}]`);
  console.log(`  style=${style ? style[1] : 'none'}`);
  console.log(`  ind=${ind ? ind[0] : 'none'}`);
  console.log(`  tabs=${tabs ? tabs[0].substring(0, 200) : 'none'}`);
}
