/**
 * Regenerate POSTFIX_corp_6o.docx (6-owner C-Corp, majority voting, all
 * covenants on) so Antonio can spot-check the 2026-05-15 review fixes
 * (todos 1/2/4/5) before merge.
 */
import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';

async function main() {
  const v = baseFormData({
    entity: 'C-Corp',
    voting: 'majority',
    ownerCount: 6,
    label: 'POSTFIX',
    rofr: true,
    dragTag: true,
    nonCompete: 'Yes',
    nonSolicitation: 'Yes',
    confidentiality: 'Yes',
  });
  const answers = await mapFormToDocgenAnswers(v.formData);
  const doc = await generateDocument(answers as any);
  const out = '/mnt/c/Users/neotr/Downloads/POSTFIX_corp_6o_20260515.docx';
  writeFileSync(out, doc.buffer);
  console.log('Wrote', out, '(' + doc.buffer.length + ' bytes)');
}
main().catch((e) => { console.error(e); process.exit(1); });
