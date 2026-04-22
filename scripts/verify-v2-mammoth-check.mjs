import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(
  join(process.env.USERPROFILE, 'Downloads', 'v2-mammoth', 'doc.html'),
  'utf8',
);

// Strip HTML tags for readable text
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('=== KEY STRINGS IN RENDERED TEXT ===\n');

const checks = [
  ['#13 $25,000.00 present', /\$25,000\.00/, true],
  ['#13 $225,000 ABSENT',    /\$225,000/, false],
  ['#13 excess of $25,000',  /excess of \$25,000/, true],
  ['#16 Chief Executive Officer', /Chief Executive Officer/, true],
  ['#16 Chief Technology Officer', /Chief Technology Officer/, true],
  ['#16 John TestOne present', /John TestOne/, true],
  ['#16 Jane TestTwo present', /Jane TestTwo/, true],
  ['#17 [SIGNATURE PAGE BELOW] ABSENT', /\[SIGNATURE PAGE BELOW\]/i, false],
];

let fails = 0;
for (const [label, re, expect] of checks) {
  const found = re.test(text);
  const ok = found === expect;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (${expect ? 'expected' : 'unexpected'}: ${found ? 'found' : 'missing'})`);
  if (!ok) fails++;
}

console.log('\n=== CONTEXT SNIPPETS ===\n');
const showSnippet = (label, re, window = 120) => {
  const m = text.match(new RegExp(`(.{0,${window}})${re.source}(.{0,${window}})`));
  if (m) {
    console.log(`[${label}]`);
    console.log('  ...' + m[0].replace(/\s+/g, ' ').trim() + '...\n');
  } else {
    console.log(`[${label}] (not found)\n`);
  }
};

showSnippet('#13 spending threshold', /\$25,000\.00/);
showSnippet('#16 John signature',    /Name:\s*John TestOne/);
showSnippet('#16 Jane signature',    /Name:\s*Jane TestTwo/);
showSnippet('#11/12 §9.2 (i) romanette', /\(i\)\s+/);

// Romanette check — count how many (i)..(iv) appear in 9.2 region
const m92 = text.match(/9\.2[\s\S]{0,2000}/);
if (m92) {
  const roms = (m92[0].match(/\((?:i|ii|iii|iv)\)/g) || []);
  console.log(`§ 9.2 region: ${roms.length} romanette markers: ${roms.slice(0, 8).join(', ')}`);
}

process.exit(fails === 0 ? 0 : 1);
