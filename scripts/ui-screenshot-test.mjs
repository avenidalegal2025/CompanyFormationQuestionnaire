import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'ui-screenshots');
mkdirSync(DIR, { recursive: true });

const EMAIL = 'test+uat' + Date.now() + '@gmail.com';
const PASSWORD = 'UatTest2026!Secure';

let n = 0;
async function shot(page, label) {
  n++;
  const f = String(n).padStart(2, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  -> ' + f);
}

/** Advance to next step by directly dispatching setStep via React fiber */
async function advanceStep(page) {
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
          if (typeof state.memoizedState === 'number' && state.memoizedState >= 1 && state.memoizedState <= 10) {
            if (state.queue && state.queue.dispatch) {
              state.queue.dispatch(state.memoizedState + 1);
              return;
            }
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  });
  await page.waitForTimeout(1500);
}

/** Set wantsAgreement to true via React fiber */
async function setWantsAgreement(page) {
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
          // wantsAgreement is a boolean state, initially false
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Fill step 1, auth, return
  console.log('Step 1: fill + auth');
  await page.evaluate(() => { document.querySelectorAll('button[aria-label="No"]').forEach(b => { const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if(pk) b[pk].onClick(); }); });
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'UAT AGREEMENT CORP');
  await page.locator('select:visible').nth(1).selectOption('Corp');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('button:has-text("Continuar")').first().click();
  await page.waitForTimeout(2000);

  // Auth0 signup
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Re-fill step 1 after auth
  await page.click('button:has-text("C-Corp")');
  await page.fill('input[placeholder="Nombre de la empresa"]', 'UAT AGREEMENT CORP');
  await page.locator('select:visible').nth(1).selectOption('Corp');
  await page.evaluate(() => { document.querySelectorAll('button[aria-label="No"]').forEach(b => { const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if(pk) b[pk].onClick(); }); });
  await page.waitForTimeout(1000);

  // Enable agreement mode
  await setWantsAgreement(page);

  // Now use direct setStep to navigate through ALL steps and screenshot each
  const steps = [
    [1, 'Step1_Company'],
    [2, 'Step2_Owners'],
    [3, 'Step3_Admin'],
    [4, 'Step4_Summary'],
    [5, 'Step5_DuenosRoles'],
    [6, 'Step6_CapitalPrestamos'],
    [7, 'Step7_GobiernoDecisiones'],
    [8, 'Step8_AccionesSucesion'],
    [9, 'Step9_Checkout'],
  ];

  for (const [stepNum, label] of steps) {
    // Set the step directly
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

    const heading = await page.locator('h2').first().textContent().catch(() => '?');
    console.log(`\nStep ${stepNum} (${label}): ${heading}`);

    // Top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await shot(page, `${label}_top`);

    // Scroll through
    const h = await page.evaluate(() => document.body.scrollHeight);
    const scrollSteps = Math.max(1, Math.min(4, Math.ceil(h / 900)));
    for (let i = 1; i <= scrollSteps; i++) {
      await page.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), i / scrollSteps);
      await page.waitForTimeout(300);
      if (i < scrollSteps) await shot(page, `${label}_${Math.round(i/scrollSteps*100)}pct`);
    }
    await shot(page, `${label}_bottom`);
  }

  console.log('\n\nDone! ' + n + ' screenshots in: ' + DIR);
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
