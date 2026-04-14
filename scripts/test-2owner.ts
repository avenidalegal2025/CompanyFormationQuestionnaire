import { generateDocument } from '../src/lib/agreement-docgen.js';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

async function main() {
  const r = await generateDocument({
    entity_type: 'CORP', entity_name: 'TWO OWNER Corp', state_of_formation: 'Florida',
    date_of_formation: '2026-04-14T00:00:00Z', principal_address: '100 Test St', county: 'Miami-Dade',
    owners_list: [
      { full_name: 'Carlos Martinez', shares_or_percentage: 55, capital_contribution: 55000 },
      { full_name: 'Laura Fernandez', shares_or_percentage: 45, capital_contribution: 45000 },
    ],
    total_authorized_shares: 10000, par_value: 0.01, management_type: 'manager',
    directors_managers: [{ name: 'Carlos Martinez' }, { name: 'Laura Fernandez' }],
    officers: [{ name: 'Carlos Martinez', title: 'President' }, { name: 'Laura Fernandez', title: 'VP' }],
    tax_matters_partner: '', additional_capital_voting: 'majority', shareholder_loans_voting: 'majority',
    distribution_frequency: 'quarterly', majority_threshold: 50.01,
    sale_of_company_voting: 'unanimous', major_decisions_voting: 'majority',
    major_spending_threshold: 5000, bank_signees: 'two',
    new_member_admission_voting: 'unanimous', dissolution_voting: 'unanimous',
    officer_removal_voting: 'majority', family_transfer: 'free',
    right_of_first_refusal: true, rofr_offer_period: 90,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  } as any);
  const home = process.env.USERPROFILE || '.';
  fs.writeFileSync(path.join(home, 'Downloads', 'test_2owner_corp.docx'), r.buffer);
  console.log('Generated:', r.buffer.length, 'bytes');

  const zip = new PizZip(r.buffer);
  const xml = zip.file('word/document.xml')!.asText();
  const texts = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  const ft = texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join('');

  console.log('\n=== 2-OWNER CLEANUP CHECKS ===');
  console.log('No empty $%:', !ft.includes('$%') ? 'PASS' : 'FAIL');
  console.log('No 12.5% Owner:', !ft.includes('12.5% Owner') ? 'PASS' : 'FAIL');
  console.log('Carlos Martinez:', ft.includes('Carlos Martinez') ? 'PASS' : 'FAIL');
  console.log('Laura Fernandez:', ft.includes('Laura Fernandez') ? 'PASS' : 'FAIL');

  // Check signatures
  const sigIdx = ft.lastIndexOf('"SHAREHOLDERS"');
  if (sigIdx >= 0) {
    const sigText = ft.substring(sigIdx, ft.indexOf('"CORPORATION"', sigIdx) || undefined);
    console.log('\nSignature section:');
    console.log(sigText);
    console.log('\nNo empty Name:', !sigText.match(/Name:\s{2,}$/) ? 'PASS' : 'FAIL');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
