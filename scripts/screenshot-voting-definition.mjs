// Dev-server screenshot of the steps with the voting definition section
// and voting toggles. Auth-bypass by directly manipulating React fiber
// (setStep + setWantsAgreement) after filling the minimum Step 1 fields.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const URL = 'http://localhost:3000/';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'voting-def-screenshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

console.log('loading dev server…');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Minimal step 1 fill so later steps have valid state
await page.click('button:has-text("C-Corp")').catch(() => {});
await page.fill('input[placeholder="Nombre de la empresa"]', 'VOTING DEF TEST').catch(() => {});
await page.waitForTimeout(500);

// Jump directly to the target step via React fiber dispatch. Look for
// both `step` state (number 1..10) and `wantsAgreement` state (boolean).
async function setState(step, wants) {
  await page.evaluate(({ s, w }) => {
    const form = document.querySelector('form');
    if (!form) return;
    const fk = Object.keys(form).find((k) => k.startsWith('__reactFiber'));
    if (!fk) return;
    let fiber = form[fk];
    while (fiber) {
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          // wantsAgreement: boolean
          if (typeof state.memoizedState === 'boolean' && state.queue?.dispatch) {
            state.queue.dispatch(w);
          }
          // step: number
          if (typeof state.memoizedState === 'number' &&
              state.memoizedState >= 1 && state.memoizedState <= 10 &&
              state.queue?.dispatch) {
            state.queue.dispatch(s);
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  }, { s: step, w: wants });
  await page.waitForTimeout(1500);
}

// Enable agreement mode and jump through the relevant steps.
for (const { stepIdx, label } of [
  { stepIdx: 6, label: 'step6-capital-prestamos-voting-definition' }, // Step7Agreement2.tsx — has definition at top
  { stepIdx: 7, label: 'step7-gobierno-decisiones-voting-toggles' }, // Step8Agreement3.tsx — voting toggles
  { stepIdx: 5, label: 'step5-duenos-roles-responsibilities' }, // Step6Agreement1.tsx — responsibilities
]) {
  await setState(stepIdx, true);
  const h = await page.locator('h2').first().textContent().catch(() => '?');
  console.log(`  step=${stepIdx}: h2="${h}"`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const p = join(OUT, `${label}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  ✓ ${p}`);
}

await browser.close();
console.log(`\n✓ screenshots in ${OUT}`);
