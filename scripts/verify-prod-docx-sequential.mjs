// Given a locally saved DOCX (e.g. the fixed.docx written by
// verify-numbering-fix-on-prod.mjs), assert the Heading3 numbering is
// sequential per article with no gaps, and list every cross-reference
// in the body text so we can eyeball whether they still resolve.

import PizZip from 'pizzip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const docx = process.argv[2] ||
  join(process.env.USERPROFILE, 'Downloads', 'numbering-fix-verify', 'fixed.docx');

const buf = readFileSync(docx);
const xml = new PizZip(buf).file('word/document.xml').asText();

// Detect all 4 template shapes the renumberer handles:
//   (a) Heading3, (b) <w:t>N.M</w:t><w:tab/>, (c) first <w:t> "N.M …",
//   (d) Heading4 with leading N.M (e.g. "15.11 WAIVER OF JURY TRIAL")
const pattern = /<w:p[^>]*>([^]*?)<\/w:p>/g;
const rows = [];
let match;
while ((match = pattern.exec(xml)) !== null) {
  const body = match[1];
  const isH3 = body.includes('<w:pStyle w:val="Heading3"/>');
  const hasNumTab = /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(body);
  const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
  if (!text) continue;
  const startsWithNumSpace = /^\d+\.\d+\s/.test(text);
  const isH4WithNum =
    body.includes('<w:pStyle w:val="Heading4"/>') && /^\d+\.\d+/.test(text);
  if (!isH3 && !hasNumTab && !startsWithNumSpace && !isH4WithNum) continue;
  rows.push(text.substring(0, 100));
}

console.log(`\n${docx}`);
console.log(`Found ${rows.length} Heading3 paragraphs.\n`);

const byArticle = new Map();
let failures = 0;
for (const r of rows) {
  const m = r.match(/^(\d+)\.(\d+)/);
  if (!m) {
    console.log(`  ✗ UNNUMBERED: ${r}`);
    failures++;
    continue;
  }
  const art = parseInt(m[1], 10);
  const sub = parseInt(m[2], 10);
  if (!byArticle.has(art)) byArticle.set(art, []);
  byArticle.get(art).push({ sub, text: r });
}

for (const art of [...byArticle.keys()].sort((a, b) => a - b)) {
  const subs = byArticle.get(art);
  let expected = 1;
  let allOk = true;
  for (const { sub } of subs) {
    if (sub !== expected) allOk = false;
    expected++;
  }
  console.log(`  ${allOk ? '✓' : '✗'} Article ${art}: ${subs.length} items — ${
    subs.map(s => `${art}.${s.sub}`).join(', ')
  }`);
  if (!allOk) {
    for (const { sub, text } of subs) console.log(`      ${sub} ${text}`);
    failures++;
  }
}

// Cross-ref summary
const bodyText = xml.replace(/<[^>]+>/g, ' ');
const validSections = new Set();
for (const [art, subs] of byArticle.entries()) {
  for (const { sub } of subs) validSections.add(`${art}.${sub}`);
}
const orphans = [];
const refs = new Set();
for (const m of bodyText.matchAll(/\b(Sections?|Paragraphs?|Articles?)\s+(\d+\.\d+)/gi)) {
  refs.add(`${m[1]} ${m[2]}`);
  if (!validSections.has(m[2])) orphans.push(`${m[1]} ${m[2]}`);
}
console.log(`\n  Cross-refs: ${refs.size} total, ${orphans.length} orphan(s)`);
for (const o of orphans) console.log(`      ⚠ ${o}`);

if (failures > 0) {
  console.log(`\n✗ ${failures} numbering failures on prod docx`);
  process.exit(1);
}
console.log(`\n✓ Prod DOCX: every article sequentially numbered, no gaps.`);
