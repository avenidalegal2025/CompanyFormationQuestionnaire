/**
 * E2E: Create Corp with agreement data injected → Stripe payment → verify dashboard has agreement doc
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-payment');
mkdirSync(DIR, { recursive: true });

async function main() {
  const email = `test+agr${Date.now()}@gmail.com`;
  console.log('Email:', email);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // Step 1 + Auth
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'AGRDOC FINAL');
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

  // Re-fill step 1
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'AGRDOC FINAL');
  await page.locator('select:visible').nth(1).selectOption('Corp');
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label="No"]').forEach(b => {
      const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
      if (pk) b[pk].onClick();
    });
  });
  await page.waitForTimeout(500);

  // Inject agreement data via React Hook Form setValue (found on ASIDE element fiber)
  console.log('Injecting agreement form data...');
  const injected = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const keys = Object.keys(el);
      for (const key of keys) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key];
        let depth = 0;
        while (fiber && depth < 5) {
          if (fiber.memoizedProps?.form?.setValue) {
            const sv = fiber.memoizedProps.form.setValue;
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
            const gv = fiber.memoizedProps.form.getValues;
            return { ok: true, wants: gv('agreement.wants') };
          }
          fiber = fiber.return;
          depth++;
        }
      }
    }
    return { ok: false };
  });
  console.log('Injection:', JSON.stringify(injected));

  // Enable wantsAgreement + set step 9
  await page.evaluate(() => {
    const form = document.querySelector('form');
    const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
    let fiber = form[fk];
    while (fiber) {
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          if (state.memoizedState === false && state.queue && state.queue.dispatch) {
            state.queue.dispatch(true); // wantsAgreement
          }
          if (typeof state.memoizedState === 'number' && state.memoizedState >= 1 && state.memoizedState <= 10 && state.queue && state.queue.dispatch) {
            state.queue.dispatch(9); // step 9 (checkout)
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  });
  await page.waitForTimeout(2000);

  // Verify
  const stepText = await page.evaluate(() => document.body.innerText.substring(0, 100));
  console.log('Step:', stepText.substring(0, 50).replace(/\n/g, '|'));

  // Save draft with agreement data to DynamoDB via API
  console.log('Saving draft with agreement data to DynamoDB...');
  const draftId = await page.evaluate(() => localStorage.getItem('draftId'));
  console.log('Draft ID:', draftId);

  // Get current form values and save with agreement data
  const saveResult = await page.evaluate(async () => {
    // Get form values
    const allElements = document.querySelectorAll('*');
    let formValues = null;
    for (const el of allElements) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key];
        let d = 0;
        while (fiber && d < 5) {
          if (fiber.memoizedProps?.form?.getValues) {
            formValues = fiber.memoizedProps.form.getValues();
            break;
          }
          fiber = fiber.return; d++;
        }
        if (formValues) break;
      }
      if (formValues) break;
    }

    if (!formValues) return 'no form values';

    const draftId = localStorage.getItem('draftId');
    if (!draftId) return 'no draftId';

    // Save to DynamoDB
    const resp = await fetch('/api/db/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draftId, data: formValues })
    });
    const json = await resp.json();
    return { ok: json.ok, agreement: !!formValues.agreement, wants: formValues.agreement?.wants };
  });
  console.log('Save result:', JSON.stringify(saveResult));

  // Checkout flow — handle auth at each step
  async function clickAndHandleAuth(buttonText) {
    await page.locator(`button:has-text("${buttonText}")`).click();
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      console.log('  Re-auth needed...');
      const loginLink = page.locator('a:has-text("Log in")');
      if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loginLink.click();
        await page.waitForTimeout(2000);
      }
      await page.waitForSelector('input[name="email"], input[name="username"]', { timeout: 5000 }).catch(() => {});
      await page.locator('input[name="email"], input[name="username"]').first().fill(email).catch(() => {});
      await page.fill('input[name="password"]', 'Test2026!Secure').catch(() => {});
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(5000);
      if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
        await page.click('button:has-text("Accept")');
      await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  console.log('Clicking Revisar Paquete...');
  await clickAndHandleAuth('Revisar Paquete');
  await page.screenshot({ path: join(DIR, 'agr_services.png'), fullPage: true });

  // After auth, we might be back on the app. Need to re-inject data, re-navigate to checkout, re-click
  if (!page.url().includes('stripe')) {
    console.log('Not on Stripe yet, re-injecting and retrying...');
    // Re-fill step 1
    await page.click('button:has-text("C-Corp")').catch(() => {});
    await page.fill('input[placeholder="Nombre de la empresa"]', 'AGRDOC FINAL').catch(() => {});
    await page.locator('select:visible').nth(1).selectOption('Corp').catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('button[aria-label="No"]').forEach(b => {
        const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
        if (pk) b[pk].onClick();
      });
    });
    await page.waitForTimeout(500);

    // Re-inject agreement
    await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key];
          let d = 0;
          while (fiber && d < 5) {
            if (fiber.memoizedProps?.form?.setValue) {
              const sv = fiber.memoizedProps.form.setValue;
              sv('agreement.wants', 'Yes');
              sv('agreement.corp_saleDecisionThreshold', 'Supermayoría');
              sv('agreement.corp_bankSigners', 'Dos firmantes');
              sv('agreement.corp_majorDecisionThreshold', 'Mayoría');
              sv('agreement.corp_rofr', 'Yes');
              sv('agreement.corp_rofrOfferPeriod', 90);
              sv('agreement.corp_tagDragRights', 'Yes');
              return;
            }
            fiber = fiber.return; d++;
          }
        }
      }
    });

    // Re-enable agreement + step 9
    await page.evaluate(() => {
      const form = document.querySelector('form');
      const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
      let fiber = form[fk];
      while (fiber) {
        if (fiber.memoizedState) {
          let state = fiber.memoizedState;
          while (state) {
            if (state.memoizedState === false && state.queue?.dispatch) state.queue.dispatch(true);
            if (typeof state.memoizedState === 'number' && state.memoizedState >= 1 && state.memoizedState <= 10 && state.queue?.dispatch) state.queue.dispatch(9);
            state = state.next;
          }
        }
        fiber = fiber.return;
      }
    });
    await page.waitForTimeout(2000);

    // Retry checkout
    console.log('Retrying Revisar...');
    await page.locator('button:has-text("Revisar Paquete")').click();
    await page.waitForTimeout(3000);
    console.log('Retrying Proceder...');
    await page.locator('button:has-text("Proceder al Pago")').click();
    await page.waitForTimeout(10000);
  }

  console.log('Stripe:', page.url().substring(0, 60));

  // Fill card
  console.log('Paying with test card...');
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12/29');
  await page.locator('#cardCvc').fill('123');
  const nameInput = page.locator('input[name="billingName"]');
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('Test User');
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
  await page.waitForTimeout(20000);

  console.log('After pay:', page.url().substring(0, 80));
  await page.screenshot({ path: join(DIR, 'agr_after_pay.png'), fullPage: true });

  // Wait for webhook
  console.log('Waiting 30s for webhook...');
  await page.waitForTimeout(30000);

  // Dashboard
  console.log('Checking dashboard...');
  await page.goto(URL + '/client', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(DIR, 'agr_dashboard.png'), fullPage: true });

  // Documents
  await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(DIR, 'agr_documents.png'), fullPage: true });

  // Check for agreement doc
  const docText = await page.evaluate(() => document.body.innerText);
  console.log('Has Shareholder Agreement:', docText.includes('Shareholder Agreement') || docText.includes('shareholder-agreement'));
  console.log('Has Operating Agreement:', docText.includes('Operating Agreement') || docText.includes('operating-agreement'));

  // Scroll down to see all docs
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(DIR, 'agr_documents_scroll.png'), fullPage: true });

  console.log('Done!');
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
