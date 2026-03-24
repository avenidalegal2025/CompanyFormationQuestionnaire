/**
 * Generate ALL agreement variants via the PRODUCTION Vercel API
 * (same endpoint the Stripe webhook uses) and verify each one.
 */
import { inflateRawSync } from 'zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const API = 'https://company-formation-questionnaire.vercel.app/api/agreement/generate';
const S3_BUCKET = 'avenida-legal-documents';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'agreement-variants');
mkdirSync(DIR, { recursive: true });

function getText(buf) {
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const comp = buf.readUInt16LE(offset + 8);
      const cSize = buf.readUInt32LE(offset + 18);
      const nLen = buf.readUInt16LE(offset + 26);
      const eLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString('utf8', offset + 30, offset + 30 + nLen);
      const dStart = offset + 30 + nLen + eLen;
      if (name === 'word/document.xml') {
        const raw = comp === 0 ? buf.subarray(dStart, dStart + cSize) : inflateRawSync(buf.subarray(dStart, dStart + cSize));
        return (raw.toString('utf8').match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
      }
      offset = dStart + cSize;
    } else offset++;
  }
  return '';
}

const variants = [
  { name: 'Corp_V1_2owners_mixed', type: 'CORP', formData: { company: { entityType: 'C-Corp', companyNameBase: 'LAMBDA V1', entitySuffix: 'Corp', formationState: 'Florida', numberOfShares: 1000 }, ownersCount: 2, owners: [{ fullName: 'Roberto Mendez', ownership: 60 }, { fullName: 'Ana Garcia', ownership: 40 }], admin: { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }, agreement: { wants: 'Yes', corp_saleDecisionThreshold: 'Supermayoría', corp_saleDecisionMajority: 75, corp_bankSigners: 'Dos firmantes', corp_majorDecisionThreshold: 'Mayoría', corp_majorDecisionMajority: 66.67, corp_majorSpendingThreshold: '7500', corp_officerRemovalVoting: 'Supermayoría', corp_nonCompete: 'Yes', corp_nonCompeteDuration: 2, corp_nonCompeteScope: 'Florida', corp_nonSolicitation: 'Yes', corp_confidentiality: 'Yes', corp_taxOwner: 'Roberto Mendez', distributionFrequency: 'Semestral', corp_rofr: 'Yes', corp_rofrOfferPeriod: 90, corp_transferToRelatives: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.', corp_incapacityHeirsPolicy: 'Yes', corp_divorceBuyoutPolicy: 'Yes', corp_tagDragRights: 'Yes', corp_newShareholdersAdmission: 'Decisión Unánime', corp_moreCapitalProcess: 'Sí, Pro-Rata', corp_shareholderLoans: 'Yes', corp_shareholderLoansVoting: 'Supermayoría', corp_capitalPerOwner_0: '50000', corp_capitalPerOwner_1: '30000' } },
    checks: [
      ['Sale: Super Majority', t => t.includes('Super Majority consent or approval of both')],
      ['Bank: two', t => t.includes('two of the Officers')],
      ['Major: Majority', t => t.includes('Majority affirmative vote of the Board')],
      ['New members: Unanimous', t => t.includes('Unanimous of the Shareholders')],
      ['Dissolution: Majority', t => t.includes('Majority election to dissolve')],
      ['Removal: Super Majority', t => t.includes('Super Majority vote of the Shareholders')],
      ['Loans: Super Majority', t => t.includes('Super Majority approval of the Board')],
      ['ROFR: present', t => t.includes('Right of First Refusal')],
      ['Drag Along: present', t => t.includes('Drag Along')],
      ['Tag Along: present', t => t.includes('Tag Along')],
      ['Spending: 7,500', t => t.includes('7,500')],
      ['ROFR period: 90', t => t.includes('90')],
      ['Name: LAMBDA V1 Corp', t => t.includes('LAMBDA V1 Corp')],
      ['No {{}}', t => !t.includes('{{')],
    ]
  },
  { name: 'Corp_V2_1owner_noROFR', type: 'CORP', formData: { company: { entityType: 'C-Corp', companyNameBase: 'LAMBDA V2', entitySuffix: 'Inc', formationState: 'Delaware', numberOfShares: 1000 }, ownersCount: 1, owners: [{ fullName: 'Single Owner', ownership: 100 }], admin: { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }, agreement: { wants: 'Yes', corp_saleDecisionThreshold: 'Decisión Unánime', corp_bankSigners: 'Un firmante', corp_majorDecisionThreshold: 'Decisión Unánime', corp_majorSpendingThreshold: '10000', corp_officerRemovalVoting: 'Decisión Unánime', corp_nonCompete: 'No', corp_nonSolicitation: 'No', corp_confidentiality: 'No', corp_taxOwner: 'Single Owner', distributionFrequency: 'Trimestral', corp_rofr: 'No', corp_incapacityHeirsPolicy: 'No', corp_divorceBuyoutPolicy: 'No', corp_tagDragRights: 'No', corp_newShareholdersAdmission: 'Decisión Unánime', corp_moreCapitalProcess: 'Sí, Pro-Rata', corp_shareholderLoans: 'No', corp_capitalPerOwner_0: '100000' } },
    checks: [
      ['Sale: Unanimous', t => t.includes('Unanimous consent or approval of both')],
      ['Bank: one', t => t.includes('one of the Officers')],
      ['ROFR: REMOVED', t => !t.includes('Right of First Refusal')],
      ['Drag Along: REMOVED', t => !t.includes('Drag Along')],
      ['Tag Along: REMOVED', t => !t.includes('Tag Along')],
      ['State: Delaware', t => t.includes('Delaware')],
      ['Owner: Single Owner', t => t.includes('Single Owner')],
      ['No {{}}', t => !t.includes('{{')],
    ]
  },
  { name: 'Corp_V3_3owners_majority', type: 'CORP', formData: { company: { entityType: 'C-Corp', companyNameBase: 'LAMBDA V3', entitySuffix: 'Corp', formationState: 'Florida', numberOfShares: 1000 }, ownersCount: 3, owners: [{ fullName: 'John Smith', ownership: 50 }, { fullName: 'Jane Doe', ownership: 30 }, { fullName: 'Carlos Garcia', ownership: 20 }], admin: { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }, agreement: { wants: 'Yes', corp_saleDecisionThreshold: 'Mayoría', corp_saleDecisionMajority: 60, corp_bankSigners: 'Dos firmantes', corp_majorDecisionThreshold: 'Mayoría', corp_majorDecisionMajority: 60, corp_majorSpendingThreshold: '5000', corp_officerRemovalVoting: 'Mayoría', corp_nonCompete: 'No', corp_nonSolicitation: 'Yes', corp_confidentiality: 'Yes', corp_taxOwner: 'John Smith', distributionFrequency: 'Anual', corp_rofr: 'Yes', corp_rofrOfferPeriod: 180, corp_transferToRelatives: 'Sí, podrán transferir libremente sus acciones.', corp_incapacityHeirsPolicy: 'No', corp_divorceBuyoutPolicy: 'No', corp_tagDragRights: 'No', corp_newShareholdersAdmission: 'Mayoría', corp_newShareholdersMajority: 60, corp_moreCapitalProcess: 'No', corp_moreCapitalDecision: 'Mayoría', corp_moreCapitalMajority: 60, corp_shareholderLoans: 'Yes', corp_shareholderLoansVoting: 'Mayoría', corp_capitalPerOwner_0: '50000', corp_capitalPerOwner_1: '30000', corp_capitalPerOwner_2: '20000' } },
    checks: [
      ['Sale: Majority', t => t.includes('Majority consent or approval of both')],
      ['3 shareholders', t => t.includes('John Smith') && t.includes('Jane Doe') && t.includes('Carlos Garcia')],
      ['ROFR: present (180)', t => t.includes('Right of First Refusal') && t.includes('180')],
      ['Drag Along: REMOVED', t => !t.includes('Drag Along')],
      ['Spending: 5,000', t => t.includes('5,000')],
      ['No {{}}', t => !t.includes('{{')],
    ]
  },
  { name: 'LLC_V1_2members_mixed', type: 'LLC', formData: { company: { entityType: 'LLC', companyNameBase: 'LAMBDA LLC V1', entitySuffix: 'LLC', formationState: 'Florida' }, ownersCount: 2, owners: [{ fullName: 'Marco Rodriguez', ownership: 60 }, { fullName: 'Sofia Hernandez', ownership: 40 }], admin: { managersAllOwners: 'Yes', managersCount: 2 }, agreement: { wants: 'Yes', llc_capitalContributions_0: '60000', llc_capitalContributions_1: '40000', llc_managingMembers: 'Yes', llc_newMembersAdmission: 'Supermayoría', llc_newMembersMajority: 75, llc_additionalContributions: 'Sí, Pro-Rata', llc_memberLoans: 'Yes', llc_memberLoansVoting: 'Mayoría', llc_companySaleDecision: 'Decisión Unánime', llc_taxPartner: 'Marco Rodriguez', llc_nonCompete: 'No', llc_bankSigners: 'Dos firmantes', llc_majorDecisions: 'Supermayoría', llc_majorDecisionsMajority: 75, llc_majorSpendingThreshold: '15000', llc_officerRemovalVoting: 'Mayoría', llc_nonSolicitation: 'Yes', llc_confidentiality: 'Yes', distributionFrequency: 'Trimestral', llc_minTaxDistribution: 30, llc_rofr: 'Yes', llc_rofrOfferPeriod: 180, llc_incapacityHeirsPolicy: 'No', llc_dissolutionDecision: 'Decisión Unánime', llc_newPartnersAdmission: 'Supermayoría', llc_newPartnersMajority: 75 } },
    checks: [
      ['Sale: Unanimous', t => t.includes('Unanimous consent of the Members')],
      ['Bank: two', t => t.includes('any two Members or Managers')],
      ['Major: Super Majority', t => t.includes('Super Majority Approval of the Members')],
      ['Spending: $15,000', t => t.includes('$15,000') && !t.includes('$5,000')],
      ['ROFR: present', t => t.includes('Right of First Refusal')],
      ['Tax Partner: Marco', t => t.includes('Marco Rodriguez')],
      ['60%', t => t.includes('60%')],
      ['40%', t => t.includes('40%')],
      ['No {{}}', t => !t.includes('{{')],
      ['No %%', t => !t.includes('%%')],
    ]
  },
  { name: 'LLC_V2_1member_noROFR', type: 'LLC', formData: { company: { entityType: 'LLC', companyNameBase: 'LAMBDA LLC V2', entitySuffix: 'LLC', formationState: 'Texas' }, ownersCount: 1, owners: [{ fullName: 'Solo Member', ownership: 100 }], admin: { managersAllOwners: 'Yes', managersCount: 1 }, agreement: { wants: 'Yes', llc_capitalContributions_0: '10000', llc_managingMembers: 'Yes', llc_newMembersAdmission: 'Mayoría', llc_additionalContributions: 'Sí, Pro-Rata', llc_memberLoans: 'No', llc_companySaleDecision: 'Mayoría', llc_taxPartner: 'Solo Member', llc_nonCompete: 'No', llc_bankSigners: 'Un firmante', llc_majorDecisions: 'Mayoría', llc_majorSpendingThreshold: '5000', llc_officerRemovalVoting: 'Mayoría', llc_nonSolicitation: 'No', llc_confidentiality: 'No', distributionFrequency: 'Anual', llc_rofr: 'No', llc_incapacityHeirsPolicy: 'No', llc_dissolutionDecision: 'Mayoría', llc_newPartnersAdmission: 'Mayoría' } },
    checks: [
      ['ROFR: REMOVED', t => !t.includes('Right of First Refusal')],
      ['Bank: one', t => t.includes('the signature of any Member or Manager')],
      ['State: Texas', t => t.includes('Texas')],
      ['Member: Solo Member', t => t.includes('Solo Member')],
      ['Spending: $5,000', t => t.includes('$5,000')],
      ['No {{}}', t => !t.includes('{{')],
    ]
  },
];

let totalPass = 0, totalFail = 0;

async function main() {
  console.log('Generating 5 variants via PRODUCTION API + uploading to S3...\n');

  for (const v of variants) {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: v.formData, draftId: 'lambda-' + v.name.toLowerCase() }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      console.log(`  ${v.name}: FAIL ${resp.status} ${await resp.text()}`);
      totalFail += v.checks.length;
      continue;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const s3Key = resp.headers.get('X-S3-Key') || '';
    const filePath = join(DIR, v.name + '.docx');
    writeFileSync(filePath, buf);

    console.log(`\n  ${v.name}: ${buf.length} bytes → ${filePath}`);
    console.log(`  S3: ${s3Key}`);

    // Verify content
    const text = getText(buf);
    for (const [label, check] of v.checks) {
      const ok = check(text);
      if (ok) { totalPass++; console.log(`    PASS ${label}`); }
      else { totalFail++; console.log(`    FAIL ${label}`); }
    }
  }

  console.log(`\n${'='.repeat(55)}`);
  console.log(`TOTAL: ${totalPass + totalFail} checks | ${totalPass} passed | ${totalFail} failed`);
  if (totalFail === 0) console.log('STATUS: ALL VARIANTS GENERATED AND VERIFIED VIA PRODUCTION API');
  else console.log('STATUS: FAIL');
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
