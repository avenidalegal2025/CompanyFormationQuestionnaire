import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';
async function main() {
  const v = baseFormData({
    entity: 'LLC', voting: 'majority', ownerCount: 4,
    label: 'PFX02',
    rofr: true, dragTag: false,
    nonCompete: 'No', nonSolicitation: 'No', confidentiality: 'No',
  });
  const answers = await mapFormToDocgenAnswers(v.formData);
  const doc = await generateDocument(answers as any);
  const out = '/tmp/v2_LOCAL.docx';
  writeFileSync(out, doc.buffer);
  console.log('Wrote', out, '(' + doc.buffer.length + ' bytes)');
}
main().catch((e) => { console.error(e); process.exit(1); });
