import { generateDocument } from '../src/lib/agreement-docgen.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const home = process.env.USERPROFILE || '.';

  const llc = await generateDocument({
    entity_type: 'LLC', entity_name: 'AVENIDA CONSULTING LLC', state_of_formation: 'Florida',
    date_of_formation: '2026-04-14T00:00:00Z', principal_address: '200 S Biscayne Blvd, Miami, FL 33131',
    county: 'Miami-Dade',
    owners_list: [
      { full_name: 'Antonio Regojo', shares_or_percentage: 60, capital_contribution: 60000 },
      { full_name: 'Maria Gonzalez', shares_or_percentage: 40, capital_contribution: 40000 },
    ],
    management_type: 'manager',
    directors_managers: [{ name: 'Antonio Regojo' }, { name: 'Maria Gonzalez' }],
    officers: [], tax_matters_partner: 'Antonio Regojo',
    additional_capital_voting: 'majority', shareholder_loans_voting: 'majority',
    distribution_frequency: 'quarterly', min_tax_distribution: 30, majority_threshold: 50.01,
    supermajority_threshold: 75, sale_of_company_voting: 'unanimous',
    major_decisions_voting: 'majority', major_spending_threshold: 10000, bank_signees: 'two',
    new_member_admission_voting: 'supermajority', dissolution_voting: 'unanimous',
    officer_removal_voting: 'supermajority', family_transfer: 'free',
    right_of_first_refusal: true, rofr_offer_period: 180,
    death_incapacity_forced_sale: false, drag_along: false, tag_along: false,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  } as any);
  fs.writeFileSync(path.join(home, 'Downloads', 'DEMO_LLC_Operating_Agreement.docx'), llc.buffer);
  console.log('LLC:', llc.buffer.length, 'bytes');

  const corp = await generateDocument({
    entity_type: 'CORP', entity_name: 'AVENIDA TECH Inc', state_of_formation: 'Florida',
    date_of_formation: '2026-04-14T00:00:00Z', principal_address: '100 Wall Street, Miami, FL 33131',
    county: 'Miami-Dade',
    owners_list: [
      { full_name: 'Carlos Martinez', shares_or_percentage: 55, capital_contribution: 55000 },
      { full_name: 'Laura Fernandez', shares_or_percentage: 45, capital_contribution: 45000 },
    ],
    total_authorized_shares: 10000, par_value: 0.01, management_type: 'manager',
    directors_managers: [{ name: 'Carlos Martinez' }, { name: 'Laura Fernandez' }],
    officers: [{ name: 'Carlos Martinez', title: 'President' }, { name: 'Laura Fernandez', title: 'VP' }],
    tax_matters_partner: '',
    additional_capital_voting: 'majority', shareholder_loans_voting: 'majority',
    distribution_frequency: 'quarterly', majority_threshold: 50.01, supermajority_threshold: 75,
    sale_of_company_voting: 'supermajority', major_decisions_voting: 'majority',
    major_spending_threshold: 5000, bank_signees: 'two',
    new_member_admission_voting: 'supermajority', dissolution_voting: 'unanimous',
    officer_removal_voting: 'supermajority', family_transfer: 'unanimous',
    right_of_first_refusal: true, rofr_offer_period: 90,
    death_incapacity_forced_sale: true, drag_along: true, tag_along: true,
    include_noncompete: false, include_nonsolicitation: true, include_confidentiality: true,
  } as any);
  fs.writeFileSync(path.join(home, 'Downloads', 'DEMO_Corp_Shareholder_Agreement.docx'), corp.buffer);
  console.log('Corp:', corp.buffer.length, 'bytes');
}
main().catch(e => { console.error(e); process.exit(1); });
