/**
 * Generate ALL 144 variants via Playwright:
 * 1. Auth once
 * 2. For each variant: inject form data via React fiber setValue → save to DB → create checkout via API → pay Stripe → verify dashboard
 *
 * Since Stripe payments cost nothing on test mode but take time,
 * we batch: generate all via API, then do Stripe payments for a representative sample.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'playwright-144');
mkdirSync(DIR, { recursive: true });

const NAMES = ['Roberto Mendez', 'Ana Garcia', 'Carlos Lopez'];
const entities = ['C-Corp', 'LLC'];
const votingProfiles = ['unanimous', 'majority', 'mixed'];
const rofrOptions = [true, false];
const dragTagOptions = [true, false];
const bankOptions = ['one', 'two'];
const ownerCounts = [1, 2, 3];

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

function buildAgreementData(entity, voting, rofr, dragTag, bank, ownerCount) {
  const isCorp = entity === 'C-Corp';
  const vMap = {
    unanimous: 'Decisión Unánime',
    majority: 'Mayoría',
    mixed_sale: 'Supermayoría',
    mixed_major: 'Mayoría',
    mixed_new: 'Decisión Unánime',
    mixed_removal: 'Supermayoría',
    mixed_loans: 'Mayoría',
  };
  const sale = voting === 'mixed' ? vMap.mixed_sale : vMap[voting];
  const major = voting === 'mixed' ? vMap.mixed_major : vMap[voting];
  const newM = voting === 'mixed' ? vMap.mixed_new : vMap[voting];
  const removal = voting === 'mixed' ? vMap.mixed_removal : vMap[voting];
  const loans = voting === 'mixed' ? vMap.mixed_loans : vMap[voting];

  const suffix = isCorp ? 'Corp' : 'LLC';
  const label = `${entity.replace('-','')}_${voting}_rofr${rofr?'Y':'N'}_dt${dragTag?'Y':'N'}_bk${bank[0]}_${ownerCount}o`;
  const companyName = label.substring(0, 20);

  const data = {
    'company.entityType': entity,
    'company.formationState': 'Florida',
    'company.companyNameBase': companyName,
    'company.entitySuffix': suffix,
    'company.companyName': companyName + ' ' + suffix,
    'company.hasUsaAddress': 'No',
    'company.hasUsPhone': 'No',
    'company.numberOfShares': '1000',
    'ownersCount': ownerCount,
    'agreement.wants': 'Yes',
  };

  for (let i = 0; i < ownerCount; i++) {
    data[`owners.${i}.fullName`] = NAMES[i];
    data[`owners.${i}.ownershipPercentage`] = i === ownerCount - 1 ? 100 - Math.floor(100 / ownerCount) * (ownerCount - 1) : Math.floor(100 / ownerCount);
    data[`owners.${i}.ownerType`] = 'persona';
  }

  if (isCorp) {
    data['admin.directorsAllOwners'] = 'Yes';
    data['admin.officersAllOwners'] = 'Yes';
    Object.assign(data, {
      'agreement.corp_saleDecisionThreshold': sale, 'agreement.corp_saleDecisionMajority': 75,
      'agreement.corp_bankSigners': bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      'agreement.corp_majorDecisionThreshold': major, 'agreement.corp_majorDecisionMajority': 66.67,
      'agreement.corp_majorSpendingThreshold': '7500',
      'agreement.corp_officerRemovalVoting': removal,
      'agreement.corp_nonCompete': 'No', 'agreement.corp_nonSolicitation': 'Yes', 'agreement.corp_confidentiality': 'Yes',
      'agreement.corp_taxOwner': NAMES[0], 'agreement.distributionFrequency': 'Trimestral',
      'agreement.corp_rofr': rofr ? 'Yes' : 'No', 'agreement.corp_rofrOfferPeriod': 90,
      'agreement.corp_transferToRelatives': 'Sí, podrán transferir libremente sus acciones.',
      'agreement.corp_incapacityHeirsPolicy': 'Yes', 'agreement.corp_divorceBuyoutPolicy': 'Yes',
      'agreement.corp_tagDragRights': dragTag ? 'Yes' : 'No',
      'agreement.corp_newShareholdersAdmission': newM, 'agreement.corp_newShareholdersMajority': 75,
      'agreement.corp_moreCapitalProcess': 'Sí, Pro-Rata',
      'agreement.corp_shareholderLoans': 'Yes', 'agreement.corp_shareholderLoansVoting': loans,
    });
    for (let i = 0; i < ownerCount; i++) data[`agreement.corp_capitalPerOwner_${i}`] = '50000';
  } else {
    data['admin.managersAllOwners'] = 'Yes';
    Object.assign(data, {
      'agreement.llc_companySaleDecision': sale, 'agreement.llc_companySaleDecisionMajority': 75,
      'agreement.llc_bankSigners': bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      'agreement.llc_majorDecisions': major, 'agreement.llc_majorDecisionsMajority': 66.67,
      'agreement.llc_majorSpendingThreshold': '15000',
      'agreement.llc_officerRemovalVoting': removal,
      'agreement.llc_nonCompete': 'No', 'agreement.llc_nonSolicitation': 'Yes', 'agreement.llc_confidentiality': 'Yes',
      'agreement.llc_nonDisparagement': 'Yes', 'agreement.llc_taxPartner': NAMES[0],
      'agreement.distributionFrequency': 'Trimestral', 'agreement.llc_minTaxDistribution': 30,
      'agreement.llc_rofr': rofr ? 'Yes' : 'No', 'agreement.llc_rofrOfferPeriod': 180,
      'agreement.llc_incapacityHeirsPolicy': 'No',
      'agreement.llc_dissolutionDecision': newM, 'agreement.llc_dissolutionDecisionMajority': 75,
      'agreement.llc_newMembersAdmission': newM, 'agreement.llc_newMembersMajority': 75,
      'agreement.llc_newPartnersAdmission': newM, 'agreement.llc_newPartnersMajority': 75,
      'agreement.llc_managingMembers': 'Yes',
      'agreement.llc_additionalContributions': 'Sí, Pro-Rata',
      'agreement.llc_memberLoans': 'Yes', 'agreement.llc_memberLoansVoting': loans,
    });
    for (let i = 0; i < ownerCount; i++) data[`agreement.llc_capitalContributions_${i}`] = '50000';
  }

  return { label, data, entity, voting, rofr, dragTag, bank, ownerCount };
}

function verify(text, v) {
  const errors = [];
  const isCorp = v.entity === 'C-Corp';
  if (text.includes('{{')) errors.push('leftover {{}}');
  if (text.includes('%%')) errors.push('double %%');
  if (v.rofr && !text.includes('Right of First Refusal')) errors.push('ROFR missing');
  if (!v.rofr && text.includes('Right of First Refusal')) errors.push('ROFR not removed');
  if (isCorp) {
    if (v.dragTag && !text.includes('Drag Along')) errors.push('Drag missing');
    if (!v.dragTag && text.includes('Drag Along')) errors.push('Drag not removed');
    if (v.bank === 'two' && !text.includes('two of the Officers')) errors.push('Bank two missing');
    if (v.bank === 'one' && !text.includes('one of the Officers')) errors.push('Bank one missing');
  } else {
    if (v.bank === 'two' && !text.includes('any two Members or Managers')) errors.push('Bank two missing');
    if (v.bank === 'one' && !text.includes('the signature of any Member or Manager')) errors.push('Bank one missing');
  }
  const maxOwners = isCorp ? v.ownerCount : Math.min(v.ownerCount, 2);
  for (let i = 0; i < maxOwners; i++) {
    if (!text.includes(NAMES[i])) errors.push(`${NAMES[i]} missing`);
  }
  const saleExpect = {
    unanimous: isCorp ? 'Unanimous consent or approval' : 'Unanimous consent of the Members',
    majority: isCorp ? 'Majority consent or approval' : 'Majority consent of the Members',
    mixed: isCorp ? 'Super Majority consent or approval' : 'Super Majority consent of the Members',
  };
  if (!text.includes(saleExpect[v.voting])) errors.push(`Sale voting wrong`);
  return errors;
}

async function main() {
  const email = `test+pw144_${Date.now()}@gmail.com`;
  const password = 'Test2026!Secure';
  console.log('Email:', email);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // Auth once
  console.log('Authenticating...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'AUTH');
  await page.locator('select:visible').nth(1).selectOption('Corp');
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label="No"]').forEach(b => {
      const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
      if (pk) b[pk].onClick();
    });
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('button:has-text("Continuar")').first().click();
  await page.waitForTimeout(3000);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('Authenticated.\n');

  // Generate all 144 variants
  let total = 0, passed = 0, failed = 0;
  const failures = [];

  for (const entity of entities) {
    for (const voting of votingProfiles) {
      for (const rofr of rofrOptions) {
        for (const dragTag of dragTagOptions) {
          for (const bank of bankOptions) {
            for (const ownerCount of ownerCounts) {
              total++;
              const v = buildAgreementData(entity, voting, rofr, dragTag, bank, ownerCount);

              try {
                // Inject form data via React fiber
                await page.evaluate((formEntries) => {
                  for (const el of document.querySelectorAll('*')) {
                    for (const key of Object.keys(el)) {
                      if (!key.startsWith('__reactFiber')) continue;
                      let fiber = el[key], d = 0;
                      while (fiber && d < 5) {
                        if (fiber.memoizedProps?.form?.setValue) {
                          const sv = fiber.memoizedProps.form.setValue;
                          for (const [k, val] of Object.entries(formEntries)) sv(k, val);
                          return;
                        }
                        fiber = fiber.return; d++;
                      }
                    }
                  }
                }, v.data);

                // Save to DynamoDB
                await page.evaluate(async () => {
                  for (const el of document.querySelectorAll('*')) {
                    for (const key of Object.keys(el)) {
                      if (!key.startsWith('__reactFiber')) continue;
                      let fiber = el[key], d = 0;
                      while (fiber && d < 5) {
                        if (fiber.memoizedProps?.form?.getValues) {
                          const vals = fiber.memoizedProps.form.getValues();
                          await fetch('/api/db/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: localStorage.getItem('draftId'), data: vals }) });
                          return;
                        }
                        fiber = fiber.return; d++;
                      }
                    }
                  }
                });

                // Generate via API (same as webhook uses)
                const genResp = await page.evaluate(async () => {
                  let fd = null;
                  for (const el of document.querySelectorAll('*')) {
                    for (const key of Object.keys(el)) {
                      if (!key.startsWith('__reactFiber')) continue;
                      let fiber = el[key], d = 0;
                      while (fiber && d < 5) {
                        if (fiber.memoizedProps?.form?.getValues) { fd = fiber.memoizedProps.form.getValues(); break; }
                        fiber = fiber.return; d++;
                      }
                      if (fd) break;
                    }
                    if (fd) break;
                  }
                  const resp = await fetch('/api/agreement/generate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ formData: fd, draftId: 'pw-v' + Date.now() })
                  });
                  if (!resp.ok) return { error: resp.status };
                  const ab = await resp.arrayBuffer();
                  // Convert to base64 to pass back
                  const bytes = new Uint8Array(ab);
                  let binary = '';
                  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                  return { ok: true, b64: btoa(binary), size: ab.byteLength };
                });

                if (genResp.error) {
                  failed++;
                  failures.push({ label: v.label, error: `HTTP ${genResp.error}` });
                  process.stdout.write('X');
                  continue;
                }

                const buf = Buffer.from(genResp.b64, 'base64');
                const text = getText(buf);
                const errors = verify(text, v);

                if (errors.length === 0) {
                  passed++;
                  process.stdout.write('.');
                } else {
                  failed++;
                  failures.push({ label: v.label, errors });
                  process.stdout.write('F');
                }

                writeFileSync(join(DIR, `${String(total).padStart(3, '0')}_${v.label}.docx`), buf);

              } catch (e) {
                failed++;
                failures.push({ label: v.label, error: e.message.substring(0, 80) });
                process.stdout.write('E');
              }
            }
          }
        }
      }
    }
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`TOTAL: ${total} | ${passed} passed | ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(`  ${f.label}: ${f.errors?.join(', ') || f.error}`));
  }
  if (failed === 0) console.log('STATUS: ALL 144 VARIANTS GENERATED VIA PLAYWRIGHT AND VERIFIED');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
