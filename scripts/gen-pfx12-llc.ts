import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';
async function main() {
  const v = baseFormData({ entity: 'LLC', voting: 'unanimous', ownerCount: 3, label: 'PFX12',
    rofr: false, dragTag: false, nonCompete: 'No', nonSolicitation: 'Yes', confidentiality: 'No' });
  const answers = await mapFormToDocgenAnswers(v.formData);
  const doc = await generateDocument(answers as any);
  writeFileSync('/tmp/v12_LOCAL.docx', doc.buffer);
  console.log('Wrote /tmp/v12_LOCAL.docx', doc.buffer.length);
}
main().catch(e => { console.error(e); process.exit(1); });
