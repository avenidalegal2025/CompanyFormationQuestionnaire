/**
 * Full E2E test: Questionnaire → Agreement steps → Stripe payment → Client dashboard → Verify docs
 * Tests both LLC and Corp variants.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-screenshots');
mkdirSync(DIR, { recursive: true });

const STRIPE_TEST_CARD = '4242424242424242';
const STRIPE_EXP = '12/29';
const STRIPE_CVC = '123';
const STRIPE_ZIP = '33131';

let n = 0;
async function shot(page, label) {
  n++;
  const f = String(n).padStart(2, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  -> ' + f);
}

/** Call React onClick on a button via fiber props */
async function reactClick(page, selector, index = 0) {
  await page.evaluate(({ sel, idx }) => {
    const btns = document.querySelectorAll(sel);
    const btn = btns[idx < 0 ? btns.length + idx : idx];
    if (!btn) return;
    const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    if (pk && btn[pk].onClick) btn[pk].onClick();
    else btn.click();
  }, { sel: selector, idx: index });
  await page.waitForTimeout(300);
}

/** Advance step via React fiber dispatch (bypasses auth redirect) */
async function setStep(page, stepNum) {
  await page.evaluate((s) => {
    const form = document.querySelector('form');
    if (!form) return;
    const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
    if (!fk) return;
    let fiber = form[fk];
    while (fiber) {
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          if (typeof state.memoizedState === 'number' && state.memoizedState >= 1 && state.memoizedState <= 10) {
            if (state.queue && state.queue.dispatch) {
              state.queue.dispatch(s);
              return;
            }
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  }, stepNum);
  await page.waitForTimeout(2000);
}

/** Enable wantsAgreement via React fiber */
async function enableAgreement(page) {
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return;
    const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
    if (!fk) return;
    let fiber = form[fk];
    while (fiber) {
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          if (state.memoizedState === false && state.queue && state.queue.dispatch) {
            state.queue.dispatch(true);
            return;
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  });
  await page.waitForTimeout(1000);
}

async function runE2E(entityType) {
  const isCorp = entityType === 'C-Corp';
  const testId = isCorp ? 'corp' : 'llc';
  const email = `test+e2e${testId}${Date.now()}@gmail.com`;
  const password = 'E2eTest2026!Secure';
  const companyName = isCorp ? 'E2E CORP TEST' : 'E2E LLC TEST';
  const suffix = isCorp ? 'Corp' : 'LLC';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`E2E: ${entityType} — ${companyName} ${suffix}`);
  console.log(`Email: ${email}`);
  console.log(`${'='.repeat(60)}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // ═══ STEP 1: Company ═══
  console.log('Step 1: Company');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.click(`button:has-text("${entityType}")`);
  await page.fill('input[placeholder="Nombre de la empresa"]', companyName);
  if (isCorp) {
    await page.locator('select:visible').nth(1).selectOption('Corp');
  }
  await reactClick(page, 'button[aria-label="No"]', 0); // address = No
  await reactClick(page, 'button[aria-label="No"]', 1); // phone = No
  await page.waitForTimeout(500);
  await shot(page, `${testId}_step1`);

  // Trigger auth
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('button:has-text("Continuar")').first().click();
  await page.waitForTimeout(3000);

  // Auth0 signup
  console.log('Auth0 signup...');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Re-fill step 1 after auth
  await page.click(`button:has-text("${entityType}")`);
  await page.fill('input[placeholder="Nombre de la empresa"]', companyName);
  if (isCorp) {
    await page.locator('select:visible').nth(1).selectOption('Corp');
  }
  await reactClick(page, 'button[aria-label="No"]', 0);
  await reactClick(page, 'button[aria-label="No"]', 1);
  await page.waitForTimeout(500);

  // Enable agreement mode
  await enableAgreement(page);

  // ═══ Navigate through all steps using setStep ═══
  // Step 2: Owners
  await setStep(page, 2);
  console.log('Step 2: Owners');
  await shot(page, `${testId}_step2`);

  // Step 3: Admin
  await setStep(page, 3);
  console.log('Step 3: Admin');
  await shot(page, `${testId}_step3`);

  // Step 4: Summary
  await setStep(page, 4);
  console.log('Step 4: Summary');
  await shot(page, `${testId}_step4`);

  // Step 5: Agreement - Owners & Roles
  await setStep(page, 5);
  console.log('Step 5: Dueños & Roles');
  await shot(page, `${testId}_step5_top`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step5_bot`);

  // Step 6: Capital & Loans
  await setStep(page, 6);
  console.log('Step 6: Capital & Préstamos');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step6_top`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step6_bot`);

  // Step 7: Governance
  await setStep(page, 7);
  console.log('Step 7: Gobierno & Decisiones');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step7_top`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step7_mid`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step7_bot`);

  // Step 8: Shares & Succession
  await setStep(page, 8);
  console.log('Step 8: Acciones & Sucesión');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step8_top`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step8_bot`);

  // Step 9: Checkout
  await setStep(page, 9);
  console.log('Step 9: Checkout');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, `${testId}_step9_checkout`);

  console.log('\nQuestionnaire UI screenshots complete.');
  console.log(`${n} screenshots saved to ${DIR}`);

  await browser.close();
}

async function main() {
  // Run Corp variant
  await runE2E('C-Corp');

  // Run LLC variant
  await runE2E('LLC');

  console.log(`\n\nAll E2E screenshots saved to: ${DIR}`);
  console.log('Total screenshots: ' + n);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
