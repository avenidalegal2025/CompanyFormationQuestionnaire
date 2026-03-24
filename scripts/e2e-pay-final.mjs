/**
 * FINAL E2E: Fill form via React fiber setValue → create checkout via API → pay → verify dashboard
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-payment');
mkdirSync(DIR, { recursive: true });

function findFormSetValue(pageEvalCode) {
  return `
    (function() {
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key]; let d = 0;
          while (fiber && d < 5) {
            if (fiber.memoizedProps?.form?.setValue) {
              ${pageEvalCode}
            }
            fiber = fiber.return; d++;
          }
        }
      }
      return null;
    })()
  `;
}

async function main() {
  const email = `test+epf${Date.now()}@gmail.com`;
  console.log('Email:', email);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // Step 1 + Auth
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'EPFINAL');
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

  // Auth0
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'Test2026!Secure');
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Re-fill + inject ALL data
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'EPFINAL');
  await page.locator('select:visible').nth(1).selectOption('Corp');
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label="No"]').forEach(b => {
      const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
      if (pk) b[pk].onClick();
    });
  });
  await page.waitForTimeout(500);

  console.log('Injecting form data...');
  const injected = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 5) {
          if (fiber.memoizedProps?.form?.setValue) {
            const sv = fiber.memoizedProps.form.setValue;
            sv('company.entityType', 'C-Corp');
            sv('company.formationState', 'Florida');
            sv('company.companyNameBase', 'EPFINAL');
            sv('company.entitySuffix', 'Corp');
            sv('company.companyName', 'EPFINAL Corp');
            sv('company.hasUsaAddress', 'No');
            sv('company.hasUsPhone', 'No');
            sv('ownersCount', 1);
            sv('owners.0.fullName', 'Roberto Mendez');
            sv('owners.0.ownershipPercentage', 100);
            sv('owners.0.ownerType', 'persona');
            sv('admin.directorsAllOwners', 'Yes');
            sv('admin.officersAllOwners', 'Yes');
            sv('agreement.wants', 'Yes');
            sv('agreement.corp_saleDecisionThreshold', 'Supermayoría');
            sv('agreement.corp_saleDecisionMajority', 75);
            sv('agreement.corp_bankSigners', 'Dos firmantes');
            sv('agreement.corp_majorDecisionThreshold', 'Mayoría');
            sv('agreement.corp_majorDecisionMajority', 66.67);
            sv('agreement.corp_majorSpendingThreshold', '7500');
            sv('agreement.corp_officerRemovalVoting', 'Supermayoría');
            sv('agreement.corp_nonCompete', 'No');
            sv('agreement.corp_nonSolicitation', 'Yes');
            sv('agreement.corp_confidentiality', 'Yes');
            sv('agreement.distributionFrequency', 'Trimestral');
            sv('agreement.corp_rofr', 'Yes');
            sv('agreement.corp_rofrOfferPeriod', 90);
            sv('agreement.corp_incapacityHeirsPolicy', 'Yes');
            sv('agreement.corp_divorceBuyoutPolicy', 'Yes');
            sv('agreement.corp_tagDragRights', 'Yes');
            sv('agreement.corp_newShareholdersAdmission', 'Decisión Unánime');
            sv('agreement.corp_moreCapitalProcess', 'Sí, Pro-Rata');
            sv('agreement.corp_shareholderLoans', 'Yes');
            sv('agreement.corp_shareholderLoansVoting', 'Mayoría');
            sv('agreement.corp_capitalPerOwner_0', '50000');
            sv('agreement.corp_taxOwner', 'Roberto Mendez');
            return true;
          }
          fiber = fiber.return; d++;
        }
      }
    }
    return false;
  });
  console.log('Injected:', injected);

  // Save to DB
  console.log('Saving to DynamoDB...');
  const saved = await page.evaluate(async () => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 5) {
          if (fiber.memoizedProps?.form?.getValues) {
            const vals = fiber.memoizedProps.form.getValues();
            const resp = await fetch('/api/db/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: localStorage.getItem('draftId'), data: vals })
            });
            const json = await resp.json();
            return { ok: json.ok, hasAgreement: !!vals.agreement?.wants };
          }
          fiber = fiber.return; d++;
        }
      }
    }
    return { ok: false };
  });
  console.log('Saved:', JSON.stringify(saved));

  // Create checkout session via API
  console.log('Creating checkout session...');
  const checkout = await page.evaluate(async () => {
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formData: fd,
        selectedServices: ['formation', 'shareholder_agreement'],
        entityType: 'C-Corp',
        state: 'Florida',
        hasUsAddress: 'No',
        hasUsPhone: 'No',
        skipAgreement: 'false',
        totalPrice: 79500
      })
    });
    const json = await resp.json();
    return { status: resp.status, url: json.paymentLinkUrl || json.url || json.checkoutUrl, error: json.error, sessionId: json.sessionId };
  });
  console.log('Checkout:', JSON.stringify(checkout));

  if (!checkout.url) {
    console.error('FAILED to create checkout session');
    await browser.close();
    process.exit(1);
  }

  // Go to Stripe
  await page.goto(checkout.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('On Stripe checkout');

  // Fill card
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12/29');
  await page.locator('#cardCvc').fill('123');
  const nameInput = page.locator('input[name="billingName"]');
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('Test User');
  await page.waitForTimeout(1000);

  // Pay
  console.log('Paying...');
  await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
  await page.waitForTimeout(20000);
  console.log('After pay:', page.url().substring(0, 80));
  await page.screenshot({ path: join(DIR, 'epf_after_pay.png'), fullPage: true });

  // Wait for webhook
  console.log('Waiting 30s for webhook to process...');
  await page.waitForTimeout(30000);

  // Check dashboard
  await page.goto(URL + '/client', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(DIR, 'epf_dashboard.png'), fullPage: true });

  // Check documents
  await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(DIR, 'epf_documents.png'), fullPage: true });

  const docText = await page.evaluate(() => document.body.innerText);
  const hasShareholder = docText.includes('Shareholder');
  console.log('\nHas Shareholder Agreement in dashboard:', hasShareholder);

  // List all document names found
  const docNames = docText.match(/(Shareholder[^\n]*|Operating[^\n]*|Bylaws[^\n]*|Organizational[^\n]*|Form \d+[^\n]*|SS4[^\n]*|Registry[^\n]*)/g);
  console.log('Documents found:', docNames?.join('\n  '));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
