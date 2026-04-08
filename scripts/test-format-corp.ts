import { generateDocument } from '../src/lib/agreement-docgen.js';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';

async function main() {
  const answers: any = {
    entity_type: 'CORP',
    entity_name: 'CORP QA FINAL Corp',
    state_of_formation: 'Florida',
    date_of_formation: '2026-04-08T00:00:00Z',
    principal_address: '100 Test St, Miami, FL 33131',
    county: 'Miami-Dade',
    owners_list: [
      { full_name: 'Roberto Uno', shares_or_percentage: 50, capital_contribution: 50000 },
      { full_name: 'Diana Dos', shares_or_percentage: 30, capital_contribution: 30000 },
      { full_name: 'Pablo Tres', shares_or_percentage: 20, capital_contribution: 20000 },
    ],
    total_authorized_shares: 10000,
    par_value: 0.01,
    management_type: 'manager',
    directors_managers: [{ name: 'Roberto Uno' }, { name: 'Diana Dos' }, { name: 'Pablo Tres' }],
    officers: [
      { name: 'Roberto Uno', title: 'President' },
      { name: 'Diana Dos', title: 'Vice-President' },
      { name: 'Pablo Tres', title: 'Treasurer' },
    ],
    tax_matters_partner: '',
    additional_capital_voting: 'majority',
    shareholder_loans_voting: 'majority',
    distribution_frequency: 'semi_annual',
    majority_threshold: 50.01,
    supermajority_threshold: 75,
    sale_of_company_voting: 'supermajority',
    major_decisions_voting: 'majority',
    major_spending_threshold: 7500,
    bank_signees: 'two',
    new_member_admission_voting: 'supermajority',
    dissolution_voting: 'unanimous',
    officer_removal_voting: 'supermajority',
    family_transfer: 'unanimous',
    right_of_first_refusal: true,
    rofr_offer_period: 90,
    death_incapacity_forced_sale: true,
    drag_along: true,
    tag_along: true,
    include_noncompete: true,
    noncompete_duration: 3,
    noncompete_scope: 'Miami-Dade County',
    include_nonsolicitation: true,
    include_confidentiality: true,
  };

  const result = await generateDocument(answers);
  const buf = result.buffer;
  const home = process.env.USERPROFILE || '.';
  fs.writeFileSync(path.join(home, 'Downloads', 'format_test_corp.docx'), buf);
  console.log('Generated:', buf.length, 'bytes');

  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml')!.asText();
  const texts = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  const ft = texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join('');

  console.log('\n=== CORP VERIFICATION ===');

  // 1. Section numbering
  const has17SM = ft.includes('1.7') && ft.includes('Super Majority');
  const sec17Count = (ft.match(/>1\.7</g) || []).length; // In raw XML
  console.log('1.7 Super Majority:', has17SM ? 'PASS' : 'FAIL');

  // Check Officers is now 1.8
  const offIdx = ft.indexOf('Officers.');
  const before = ft.substring(Math.max(0, offIdx - 10), offIdx);
  console.log('Officers section number:', before.includes('1.8') ? 'PASS (1.8)' : 'FAIL (' + before.trim() + ')');

  // 2. Non-compete as 10.10
  console.log('10.10 Covenant:', ft.includes('10.10') && ft.includes('Covenant') ? 'PASS' : 'FAIL');

  // 3. Non-compete formatting
  const ncIdx = xml.indexOf('Covenant Against Competition');
  if (ncIdx >= 0) {
    const pStart = xml.lastIndexOf('<w:p', ncIdx);
    const snippet = xml.substring(pStart, pStart + 300);
    console.log('NC pPr:', snippet.includes('<w:pPr') ? 'PASS' : 'FAIL');
    console.log('NC sz:', snippet.includes('<w:sz') ? 'PASS' : 'FAIL');
  } else {
    console.log('NC: NOT FOUND');
  }

  // 4. Content checks
  console.log('THREE (3) years:', ft.includes('THREE (3)') ? 'PASS' : 'FAIL');
  console.log('Miami-Dade County:', ft.includes('Miami-Dade County') ? 'PASS' : 'FAIL');
  console.log('SEVENTY-FIVE PERCENT (75.00%):', ft.includes('SEVENTY-FIVE PERCENT (75.00%)') ? 'PASS' : 'FAIL');
  console.log('ALL CAPS name:', ft.includes('CORP QA FINAL CORP') ? 'PASS' : 'FAIL');
  console.log('Super Majority consent:', ft.includes('Super Majority consent') ? 'PASS' : 'FAIL');
  console.log('two of the Officers:', ft.includes('two of the Officers') ? 'PASS' : 'FAIL');
  console.log('No {{placeholders}}:', !ft.includes('{{') ? 'PASS' : 'FAIL');

  // 5. Signatures separate
  const sigText = ft.substring(ft.lastIndexOf('SHAREHOLDERS'));
  console.log('Sig Roberto alone:', sigText.includes('Roberto Uno') && !sigText.includes('Roberto Uno, Diana') ? 'PASS' : 'FAIL');
  console.log('Sig Diana:', sigText.includes('Diana Dos') ? 'PASS' : 'FAIL');
  console.log('Sig Pablo:', sigText.includes('Pablo Tres') ? 'PASS' : 'FAIL');
}

main().catch(e => { console.error(e); process.exit(1); });
