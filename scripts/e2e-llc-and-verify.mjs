/**
 * E2E: LLC Operating Agreement + download both Corp & LLC agreements from dashboard + verify in Word Online
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-final');
mkdirSync(DIR, { recursive: true });

let n = 0;
async function shot(page, label) {
  n++;
  const f = String(n).padStart(2, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  -> ' + f);
}

async function injectFormData(page, data) {
  return page.evaluate((d) => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], depth = 0;
        while (fiber && depth < 5) {
          if (fiber.memoizedProps?.form?.setValue) {
            const sv = fiber.memoizedProps.form.setValue;
            for (const [k, v] of Object.entries(d)) sv(k, v);
            return true;
          }
          fiber = fiber.return; depth++;
        }
      }
    }
    return false;
  }, data);
}

async function saveAndCheckout(page, entityType, services) {
  // Save to DynamoDB
  const saved = await page.evaluate(async () => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 5) {
          if (fiber.memoizedProps?.form?.getValues) {
            const vals = fiber.memoizedProps.form.getValues();
            await fetch('/api/db/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: localStorage.getItem('draftId'), data: vals }) });
            return { ok: true, wants: vals.agreement?.wants };
          }
          fiber = fiber.return; d++;
        }
      }
    }
    return { ok: false };
  });
  console.log('  Saved:', JSON.stringify(saved));

  // Create checkout session
  const state = 'Florida';
  const checkout = await page.evaluate(async ({ et, svc, st }) => {
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
    const resp = await fetch('/api/create-checkout-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: fd, selectedServices: svc, entityType: et, state: st, hasUsAddress: 'No', hasUsPhone: 'No', skipAgreement: 'false', totalPrice: 79500 })
    });
    const json = await resp.json();
    return { url: json.paymentLinkUrl, sessionId: json.sessionId, status: resp.status };
  }, { et: entityType, svc: services, st: state });

  return checkout;
}

async function payStripe(page, checkoutUrl) {
  await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12/29');
  await page.locator('#cardCvc').fill('123');
  const nameInput = page.locator('input[name="billingName"]');
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('Test');
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
  await page.waitForTimeout(20000);
}

async function setupAuth(page, email) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("LLC")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'TEMP');
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
  await page.fill('input[name="password"]', 'Test2026!Secure');
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // ═══ LLC E2E ═══
  const llcEmail = `test+llce2e${Date.now()}@gmail.com`;
  console.log('=== LLC E2E ===');
  console.log('Email:', llcEmail);

  await setupAuth(page, llcEmail);

  // Re-fill as LLC
  await page.click('button:has-text("LLC")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'LLC E2E FINAL');
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label="No"]').forEach(b => {
      const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
      if (pk) b[pk].onClick();
    });
  });
  await page.waitForTimeout(500);

  // Inject LLC agreement data
  console.log('Injecting LLC form data...');
  await injectFormData(page, {
    'company.entityType': 'LLC',
    'company.formationState': 'Florida',
    'company.companyNameBase': 'LLC E2E FINAL',
    'company.entitySuffix': 'LLC',
    'company.companyName': 'LLC E2E FINAL LLC',
    'company.hasUsaAddress': 'No',
    'company.hasUsPhone': 'No',
    'ownersCount': 1,
    'owners.0.fullName': 'Marco Rodriguez',
    'owners.0.ownershipPercentage': 100,
    'owners.0.ownerType': 'persona',
    'admin.managersAllOwners': 'Yes',
    'agreement.wants': 'Yes',
    'agreement.llc_companySaleDecision': 'Decisión Unánime',
    'agreement.llc_bankSigners': 'Dos firmantes',
    'agreement.llc_majorDecisions': 'Supermayoría',
    'agreement.llc_majorDecisionsMajority': 75,
    'agreement.llc_majorSpendingThreshold': '15000',
    'agreement.llc_officerRemovalVoting': 'Mayoría',
    'agreement.llc_nonCompete': 'No',
    'agreement.llc_nonSolicitation': 'Yes',
    'agreement.llc_confidentiality': 'Yes',
    'agreement.llc_nonDisparagement': 'Yes',
    'agreement.distributionFrequency': 'Trimestral',
    'agreement.llc_minTaxDistribution': 30,
    'agreement.llc_rofr': 'Yes',
    'agreement.llc_rofrOfferPeriod': 180,
    'agreement.llc_incapacityHeirsPolicy': 'No',
    'agreement.llc_dissolutionDecision': 'Decisión Unánime',
    'agreement.llc_newMembersAdmission': 'Supermayoría',
    'agreement.llc_newMembersMajority': 75,
    'agreement.llc_managingMembers': 'Yes',
    'agreement.llc_taxPartner': 'Marco Rodriguez',
    'agreement.llc_capitalContributions_0': '50000',
    'agreement.llc_additionalContributions': 'Sí, Pro-Rata',
    'agreement.llc_memberLoans': 'Yes',
    'agreement.llc_memberLoansVoting': 'Mayoría',
    'agreement.llc_newPartnersAdmission': 'Supermayoría',
    'agreement.llc_newPartnersMajority': 75,
  });

  const llcCheckout = await saveAndCheckout(page, 'LLC', ['formation', 'operating_agreement']);
  console.log('LLC checkout:', llcCheckout.url ? 'OK' : 'FAIL');

  if (llcCheckout.url) {
    await payStripe(page, llcCheckout.url);
    console.log('LLC payment done:', page.url().substring(0, 60));
    console.log('Waiting 30s for webhook...');
    await page.waitForTimeout(30000);

    // Check dashboard
    await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, 'llc_documents');

    const llcText = await page.evaluate(() => document.body.innerText);
    console.log('Has Operating Agreement:', llcText.includes('Operating Agreement'));
    const llcDocs = llcText.match(/(Operating[^\n]*|Membership[^\n]*|Organizational[^\n]*|Form \d+[^\n]*|SS4[^\n]*)/g);
    console.log('LLC docs:', llcDocs?.join(', '));
  }

  // ═══ VERIFY BOTH IN WORD ONLINE ═══
  console.log('\n=== Verifying documents in Word Online ===');

  // Find the agreement docs in S3
  const s3List = execSync('aws s3 ls s3://avenida-legal-documents/ --recursive --profile llc-admin --region us-west-1 2>&1', { encoding: 'utf8' });
  const agreementFiles = s3List.split('\n').filter(l => l.includes('agreements/') && l.includes('.docx') && (l.includes('EPFINAL') || l.includes('LLC_E2E')));
  console.log('Agreement files in S3:');
  agreementFiles.forEach(f => console.log('  ' + f.trim()));

  // Also check the vault directories for the companies
  const vaultFiles = s3List.split('\n').filter(l => (l.includes('epfinal') || l.includes('llc-e2e-final') || l.includes('EPFINAL') || l.includes('LLC_E2E')) && l.includes('.docx'));
  console.log('\nAll company docs in S3:');
  vaultFiles.forEach(f => console.log('  ' + f.trim()));

  // Open Corp agreement in Word Online
  for (const file of agreementFiles.slice(0, 2)) {
    const s3Key = file.trim().split(/\s+/).pop();
    if (!s3Key) continue;
    console.log('\nOpening in Word Online:', s3Key);
    const presigned = execSync(`aws s3 presign "s3://avenida-legal-documents/${s3Key}" --profile llc-admin --region us-west-1 --expires-in 3600`, { encoding: 'utf8' }).trim();
    const wordUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presigned)}`;

    await page.goto(wordUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(10000);
    const docName = s3Key.split('/').pop().replace('.docx', '');
    await shot(page, `word_${docName}_page1`);

    // Navigate a few pages
    await page.mouse.click(660, 450);
    await page.waitForTimeout(500);
    for (let p = 2; p <= 5; p++) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1000);
      await shot(page, `word_${docName}_page${p}`);
    }
  }

  console.log('\n\nDone! ' + n + ' screenshots in: ' + DIR);
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
