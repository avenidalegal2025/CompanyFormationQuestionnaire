import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';
async function main() {
  const v = baseFormData({ entity: 'C-Corp', voting: 'unanimous', ownerCount: 3, label: 'PFX14',
    rofr: false, dragTag: false, nonCompete: 'Yes', nonSolicitation: 'No', confidentiality: 'No' });
  const answers = await mapFormToDocgenAnswers(v.formData);
  const doc = await generateDocument(answers as any);
  writeFileSync('/tmp/v14_LOCAL.docx', doc.buffer);
  console.log('Wrote /tmp/v14_LOCAL.docx', doc.buffer.length);
}
main().catch(e => { console.error(e); process.exit(1); });
