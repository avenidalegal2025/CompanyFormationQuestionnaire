/**
 * Generate ALL 144 variant combinations via the production API.
 * Matrix: entity(2) × voting(3) × ROFR(2) × dragTag(2) × bank(2) × owners(3) = 144
 * Each variant is generated, verified for content correctness, and saved locally.
 */
import { inflateRawSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const API = 'https://company-formation-questionnaire.vercel.app/api/agreement/generate';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'all-144-variants');
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

// Matrix dimensions
const entities = ['C-Corp', 'LLC'];
const votingProfiles = ['unanimous', 'majority', 'mixed'];
const rofrOptions = [true, false];
const dragTagOptions = [true, false];
const bankOptions = ['one', 'two'];
const ownerCounts = [1, 2, 3];

const NAMES = ['Roberto Mendez', 'Ana Garcia', 'Carlos Lopez', 'Maria Torres', 'Pedro Ramirez', 'Sofia Flores'];

function buildFormData(entity, voting, rofr, dragTag, bank, ownerCount) {
  const isCorp = entity === 'C-Corp';
  const prefix = isCorp ? 'corp' : 'llc';
  const suffix = isCorp ? 'Corp' : 'LLC';
  const label = `${entity}_${voting}_rofr${rofr?'Y':'N'}_dt${dragTag?'Y':'N'}_bank${bank}_${ownerCount}own`;

  const votingMap = {
    unanimous: { sale: 'Decisión Unánime', major: 'Decisión Unánime', newMember: 'Decisión Unánime', dissolution: 'Decisión Unánime', removal: 'Decisión Unánime', loans: 'Decisión Unánime', capital: 'Decisión Unánime' },
    majority: { sale: 'Mayoría', major: 'Mayoría', newMember: 'Mayoría', dissolution: 'Mayoría', removal: 'Mayoría', loans: 'Mayoría', capital: 'Mayoría' },
    mixed: { sale: 'Supermayoría', major: 'Mayoría', newMember: 'Decisión Unánime', dissolution: 'Mayoría', removal: 'Supermayoría', loans: 'Mayoría', capital: 'Supermayoría', saleExpectCorp: 'Super Majority consent or approval', saleExpectLLC: 'Super Majority consent of the Members' },
  };
  const v = votingMap[voting];

  const owners = [];
  const pctEach = Math.floor(100 / ownerCount);
  for (let i = 0; i < ownerCount; i++) {
    owners.push({ fullName: NAMES[i], ownership: i === ownerCount - 1 ? 100 - pctEach * (ownerCount - 1) : pctEach });
  }

  const agreement = { wants: 'Yes' };

  if (isCorp) {
    Object.assign(agreement, {
      corp_saleDecisionThreshold: v.sale, corp_saleDecisionMajority: 75,
      corp_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      corp_majorDecisionThreshold: v.major, corp_majorDecisionMajority: 66.67,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: v.removal,
      corp_nonCompete: 'No', corp_nonSolicitation: 'Yes', corp_confidentiality: 'Yes',
      corp_taxOwner: NAMES[0],
      distributionFrequency: 'Trimestral',
      corp_rofr: rofr ? 'Yes' : 'No', corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: 'Sí, podrán transferir libremente sus acciones.',
      corp_incapacityHeirsPolicy: 'Yes',
      corp_divorceBuyoutPolicy: 'Yes',
      corp_tagDragRights: dragTag ? 'Yes' : 'No',
      corp_newShareholdersAdmission: v.newMember, corp_newShareholdersMajority: 75,
      corp_moreCapitalProcess: 'Sí, Pro-Rata',
      corp_shareholderLoans: 'Yes', corp_shareholderLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(agreement, {
      llc_companySaleDecision: v.sale, llc_companySaleDecisionMajority: 75,
      llc_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      llc_majorDecisions: v.major, llc_majorDecisionsMajority: 66.67,
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: v.removal,
      llc_nonCompete: 'No', llc_nonSolicitation: 'Yes', llc_confidentiality: 'Yes',
      llc_nonDisparagement: 'Yes',
      llc_taxPartner: NAMES[0],
      distributionFrequency: 'Trimestral',
      llc_minTaxDistribution: 30,
      llc_rofr: rofr ? 'Yes' : 'No', llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: 'No',
      llc_dissolutionDecision: v.dissolution, llc_dissolutionDecisionMajority: 75,
      llc_newMembersAdmission: v.newMember, llc_newMembersMajority: 75,
      llc_newPartnersAdmission: v.newMember, llc_newPartnersMajority: 75,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: 'Sí, Pro-Rata',
      llc_memberLoans: 'Yes', llc_memberLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`llc_capitalContributions_${i}`] = '50000';
  }

  return {
    label,
    formData: {
      company: { entityType: entity, companyNameBase: label.substring(0, 20), entitySuffix: suffix, formationState: 'Florida', companyName: label.substring(0, 20) + ' ' + suffix, hasUsaAddress: 'No', hasUsPhone: 'No', numberOfShares: 1000 },
      ownersCount: ownerCount,
      owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
      admin: isCorp ? { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' } : { managersAllOwners: 'Yes' },
      agreement,
    },
    checks: {
      entity,
      voting,
      rofr,
      dragTag,
      bank,
      ownerCount,
    }
  };
}

function verifyDoc(text, checks) {
  const errors = [];
  const { entity, voting, rofr, dragTag, bank, ownerCount } = checks;
  const isCorp = entity === 'C-Corp';

  // No leftover {{}}
  if (text.includes('{{')) errors.push('leftover {{}}');
  if (text.includes('%%')) errors.push('double %%');

  // ROFR
  if (rofr && !text.includes('Right of First Refusal')) errors.push('ROFR missing');
  if (!rofr && text.includes('Right of First Refusal')) errors.push('ROFR not removed');

  // Drag/Tag Along
  if (isCorp) {
    if (dragTag && !text.includes('Drag Along')) errors.push('Drag Along missing');
    if (!dragTag && text.includes('Drag Along')) errors.push('Drag Along not removed');
  }

  // Bank signees
  if (isCorp) {
    if (bank === 'two' && !text.includes('two of the Officers')) errors.push('Bank two missing');
    if (bank === 'one' && !text.includes('one of the Officers')) errors.push('Bank one missing');
  } else {
    if (bank === 'two' && !text.includes('any two Members or Managers')) errors.push('Bank two missing');
    if (bank === 'one' && !text.includes('the signature of any Member or Manager')) errors.push('Bank one missing');
  }

  // Owner names (LLC template only supports 2 member slots)
  const maxOwnerCheck = isCorp ? ownerCount : Math.min(ownerCount, 2);
  for (let i = 0; i < maxOwnerCheck; i++) {
    if (!text.includes(NAMES[i])) errors.push(`Owner ${NAMES[i]} missing`);
  }

  // Voting text (check sale of company)
  const votingExpect = {
    unanimous: isCorp ? 'Unanimous consent or approval' : 'Unanimous consent of the Members',
    majority: isCorp ? 'Majority consent or approval' : 'Majority consent of the Members',
    mixed: isCorp ? 'Super Majority consent or approval' : 'Super Majority consent of the Members',
  };
  if (!text.includes(votingExpect[voting])) errors.push(`Sale voting "${votingExpect[voting]}" missing`);

  return errors;
}

async function main() {
  let total = 0, passed = 0, failed = 0;
  const failures = [];

  console.log('Generating ALL 144 variants...\n');

  for (const entity of entities) {
    for (const voting of votingProfiles) {
      for (const rofr of rofrOptions) {
        for (const dragTag of dragTagOptions) {
          for (const bank of bankOptions) {
            for (const ownerCount of ownerCounts) {
              total++;
              const variant = buildFormData(entity, voting, rofr, dragTag, bank, ownerCount);

              try {
                const resp = await fetch(API, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ formData: variant.formData, draftId: `v${total}` }),
                  signal: AbortSignal.timeout(30000),
                });

                if (!resp.ok) {
                  failed++;
                  failures.push({ label: variant.label, error: `HTTP ${resp.status}` });
                  console.log(`  FAIL #${total} ${variant.label}: HTTP ${resp.status}`);
                  continue;
                }

                const buf = Buffer.from(await resp.arrayBuffer());
                const text = getText(buf);
                const errors = verifyDoc(text, variant.checks);

                if (errors.length === 0) {
                  passed++;
                  process.stdout.write('.');
                } else {
                  failed++;
                  failures.push({ label: variant.label, errors });
                  console.log(`\n  FAIL #${total} ${variant.label}: ${errors.join(', ')}`);
                }

                // Save locally
                writeFileSync(join(DIR, `${String(total).padStart(3, '0')}_${variant.label}.docx`), buf);

              } catch (e) {
                failed++;
                failures.push({ label: variant.label, error: e.message });
                console.log(`\n  ERROR #${total} ${variant.label}: ${e.message}`);
              }
            }
          }
        }
      }
    }
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`TOTAL: ${total} variants | ${passed} passed | ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(`  ${f.label}: ${f.errors?.join(', ') || f.error}`));
  }

  if (failed === 0) console.log('STATUS: ALL 144 VARIANTS GENERATED AND VERIFIED');
  else console.log('STATUS: FAIL');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
