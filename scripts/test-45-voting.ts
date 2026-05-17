/** Quick test: set corp_moreCapitalDecision and verify §4.5 picks it up. */
import { baseFormData } from './lib/agreement-variants.mjs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import { writeFileSync } from 'fs';
import PizZip from 'pizzip';
async function main() {
  const v = baseFormData({
    entity: 'C-Corp', voting: 'mixed', ownerCount: 3,
    label: 'PFX03', rofr: true, dragTag: true,
    nonCompete: 'Yes', nonSolicitation: 'Yes', confidentiality: 'Yes',
  });
  // Patch in the missing field that the mapper reads for §4.5
  v.formData.agreement.corp_moreCapitalDecision = 'Supermayoría';
  const answers = await mapFormToDocgenAnswers(v.formData);
  console.log('additional_capital_voting:', (answers as any).additional_capital_voting);
  const doc = await generateDocument(answers as any);
  const zip = new PizZip(doc.buffer);
  const xml = zip.file('word/document.xml')!.asText();
  const idx = xml.indexOf('raise additional capital');
  const pStart = xml.lastIndexOf('<w:p ', idx);
  const pEnd = xml.indexOf('</w:p>', idx) + 6;
  const text = xml.substring(pStart, pEnd).match(/<w:t[^>]*>([^<]*)<\/w:t>/g)!.map(t => t.replace(/<[^>]+>/g,'')).join('').trim();
  console.log(text.substring(text.indexOf('raise')-10, text.indexOf('raise')+100));
}
main().catch(e => { console.error(e); process.exit(1); });
