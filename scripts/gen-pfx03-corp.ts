import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';
async function main() {
  const v = baseFormData({
    entity: 'C-Corp', voting: 'mixed', ownerCount: 3,
    label: 'PFX03',
    rofr: true, dragTag: true,
    nonCompete: 'Yes', nonSolicitation: 'Yes', confidentiality: 'Yes',
  });
  const answers = await mapFormToDocgenAnswers(v.formData);
  const doc = await generateDocument(answers as any);
  writeFileSync('/tmp/v3_LOCAL.docx', doc.buffer);
  console.log('Wrote /tmp/v3_LOCAL.docx', doc.buffer.length, 'bytes');
}
main().catch(e => { console.error(e); process.exit(1); });
