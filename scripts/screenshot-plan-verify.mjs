// Verifies the Owner Responsibilities + Voting Definition plan landed on
// prod. Navigates the agreement flow, fills the minimum needed to unlock
// Steps 5–8, enables "Sí" on specific responsibilities so the textarea
// appears, and screenshots full-page of each relevant step.
//
// Run: node scripts/screenshot-plan-verify.mjs

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const URL = process.env.TARGET_URL ||
  'https://company-formation-questionnaire.vercel.app/';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'plan-verify');
mkdirSync(OUT, { recursive: true });

console.log(`target: ${URL}`);
console.log(`out:    ${OUT}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Dispatch state directly through React fiber — the existing
// screenshot-voting-definition.mjs pattern. Walks all hook states
// reachable from the form element's fiber.
async function setStateFromFiber(stateUpdates) {
  return page.evaluate((updates) => {
    const form = document.querySelector('form');
    if (!form) return 'no-form';
    const fk = Object.keys(form).find((k) => k.startsWith('__reactFiber'));
    if (!fk) return 'no-fiber';
    const hits = [];
    let fiber = form[fk];
    while (fiber) {
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          if (state.queue?.dispatch) {
            const cur = state.memoizedState;
            // step (number 1..10)
            if (typeof cur === 'number' && cur >= 1 && cur <= 10 && updates.step != null) {
              state.queue.dispatch(updates.step);
              hits.push(`step:${cur}->${updates.step}`);
            }
            // wantsAgreement (boolean)
            if (typeof cur === 'boolean' && updates.wantsAgreement != null) {
              state.queue.dispatch(updates.wantsAgreement);
              hits.push(`bool:${cur}->${updates.wantsAgreement}`);
            }
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
    return hits.join(', ');
  }, stateUpdates);
}

// Step 1: pick C-Corp, minimal name
await page.click('button:has-text("C-Corp")').catch(() => {});
await page.waitForTimeout(300);
const nameInput = page.locator('input').first();
await nameInput.fill('PLAN VERIFY').catch(() => {});
await page.waitForTimeout(300);

// Jump to step 5 with agreement enabled
let res = await setStateFromFiber({ step: 5, wantsAgreement: true });
console.log(`  fiber dispatch -> ${res}`);
await page.waitForTimeout(1500);
let h2 = await page.locator('h2').first().textContent().catch(() => '?');
console.log(`  step 5 h2: "${h2}"`);

// On Step 5, click "Sí" for specific responsibilities so textareas render.
// The SegmentedToggle exposes buttons with data-value or aria-label; try
// clicking the Sí button inside the responsibilities section.
await page.evaluate(() => {
  // Find the section that has "Responsabilidades específicas" label and
  // click its "Sí" button.
  const labels = [...document.querySelectorAll('label')];
  const target = labels.find((l) =>
    l.textContent?.includes('responsabilidades espec') ||
    l.textContent?.includes('Habrán responsabilidades'));
  if (!target) return 'no-responsibilities-label';
  const card = target.closest('div.mt-12, div.pt-10, div');
  if (!card) return 'no-card';
  const siBtn = [...card.querySelectorAll('button')].find((b) =>
    b.textContent?.trim() === 'Sí');
  if (!siBtn) return 'no-si-btn';
  siBtn.click();
  return 'clicked';
}).then((r) => console.log(`  click Sí responsibilities: ${r}`));
await page.waitForTimeout(1500);

// Screenshot step 5 with responsibilities open
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({
  path: join(OUT, '01-step5-duenos-roles-responsibilities.png'),
  fullPage: true,
});
console.log(`  ✓ step 5 saved`);

// Step 6 — Capital & Préstamos, should have voting threshold definition at top
res = await setStateFromFiber({ step: 6 });
console.log(`  fiber dispatch -> ${res}`);
await page.waitForTimeout(1500);
h2 = await page.locator('h2').first().textContent().catch(() => '?');
console.log(`  step 6 h2: "${h2}"`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({
  path: join(OUT, '02-step6-capital-voting-threshold.png'),
  fullPage: true,
});
console.log(`  ✓ step 6 saved`);

// Step 7 — Gobierno & Decisiones, voting toggles (no per-question % inputs)
res = await setStateFromFiber({ step: 7 });
await page.waitForTimeout(1500);
h2 = await page.locator('h2').first().textContent().catch(() => '?');
console.log(`  step 7 h2: "${h2}"`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({
  path: join(OUT, '03-step7-gobierno-voting.png'),
  fullPage: true,
});
console.log(`  ✓ step 7 saved`);

// Step 8 — Acciones & Sucesión
res = await setStateFromFiber({ step: 8 });
await page.waitForTimeout(1500);
h2 = await page.locator('h2').first().textContent().catch(() => '?');
console.log(`  step 8 h2: "${h2}"`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({
  path: join(OUT, '04-step8-sucesion.png'),
  fullPage: true,
});
console.log(`  ✓ step 8 saved`);

await browser.close();
console.log(`\n✓ screenshots in ${OUT}`);
