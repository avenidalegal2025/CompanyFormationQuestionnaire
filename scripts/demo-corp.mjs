/**
 * DEMO: C-Corp "AVENIDA TECH Inc" formation with Shareholder Agreement
 *
 * Company: AVENIDA TECH (C-Corp, Florida, Inc suffix)
 * Owners: Carlos Martinez (55%), Laura Fernandez (45%)
 * 10,000 authorized shares
 * All owners are directors AND officers
 *   - Carlos = President, Laura = Vice-President
 * Agreement: Yes
 *   - Majority: 50.01%, Supermajority: 75%
 *   - Capital: $55,000 / $45,000
 *   - New shareholders: Supermayoria
 *   - Pro-Rata contributions
 *   - Shareholder loans: No
 *   - Sale: Supermayoria
 *   - Non-compete: No
 *   - Bank: Dos firmantes
 *   - Major decisions: Mayoria
 *   - Spending: $5,000
 *   - Officer removal: Supermayoria
 *   - Distribution: Trimestral
 *   - Non-solicitation: Yes
 *   - Confidentiality: Yes
 *   - ROFR: Yes (90 days)
 *   - Transfer to relatives: Unanimous
 *   - Death/incapacity: Yes (forced sale)
 *   - Divorce buyout: Yes
 *   - Tag/Drag along: Yes
 *
 * Auth0: test+demo_corp_TIMESTAMP@gmail.com / DemoPass2026!
 * Stripe: 4242 4242 4242 4242
 *
 * After payment, waits for documents and screenshots the dashboard.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'demo-companies', 'corp');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+demo_corp_${TIMESTAMP}@gmail.com`;
const PASSWORD = 'DemoPass2026!';

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  [screenshot] ' + f);
}

/** Click Continuar/Enviar/Finalizar via React onClick handler */
async function clickContinuar(page) {
  await dismissModals(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const clicked = await page.evaluate(() => {
    for (const t of ['Continuar', 'Enviar', 'Finalizar']) {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent?.trim() === t && btn.offsetHeight > 0) {
          const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
          if (pk && btn[pk]?.onClick) { btn[pk].onClick(); return t + ' (react)'; }
          btn.click();
          return t + ' (native)';
        }
      }
    }
    return null;
  });
  if (clicked) console.log(`  [click] ${clicked}`);
  else console.log('  [warn] No Continuar/Enviar button found');
  await page.waitForTimeout(3000);
}

/** Click a SegmentedToggle option via evaluate */
async function clickToggle(page, groupLabel, optionLabel) {
  const clicked = await page.evaluate(({ gl, ol }) => {
    const group = document.querySelector(`[role="radiogroup"][aria-label="${gl}"]`);
    if (!group) return false;
    const btn = group.querySelector(`button[aria-label="${ol}"]`);
    if (!btn) return false;
    const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    if (pk && btn[pk]?.onClick) { btn[pk].onClick(); return true; }
    btn.click();
    return true;
  }, { gl: groupLabel, ol: optionLabel });
  if (clicked) console.log(`  [toggle] ${groupLabel} -> ${optionLabel}`);
  else console.log(`  [warn] Toggle not found: ${groupLabel} -> ${optionLabel}`);
  await page.waitForTimeout(300);
  return clicked;
}

/** Dismiss any modal/overlay */
async function dismissModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el.classList.contains('bg-black/40') || el.classList.contains('bg-black/80')) el.click();
    });
    document.querySelectorAll('[aria-label="Cerrar"], [aria-label="Close"]').forEach(el => el.click());
  });
  await page.waitForTimeout(300);
}

/** Set form value via React fiber */
async function setFormValue(page, path, value) {
  await page.evaluate(({ p, v }) => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 12) {
          if (fiber.memoizedProps?.form?.setValue) {
            fiber.memoizedProps.form.setValue(p, v, { shouldDirty: true, shouldValidate: false });
            return;
          }
          fiber = fiber.return; d++;
        }
      }
    }
  }, { p: path, v: value });
}

/** Wait for page stability */
async function waitForStable(page, ms = 2000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Handle Auth0 signup/login flow */
async function handleAuth0(page) {
  if (!page.url().includes('auth0')) return false;
  console.log('  Auth0 detected: ' + page.url().substring(0, 80));
  await shot(page, 'auth0_page');

  const emailInput = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(EMAIL);
    console.log('  Filled email: ' + EMAIL);
  }

  const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pwdInput.fill(PASSWORD);
    console.log('  Filled password');
  }

  await shot(page, 'auth0_filled');

  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Log In"), button:has-text("Sign Up")').first();
  await submitBtn.click();
  console.log('  Clicked submit');
  await page.waitForTimeout(10000);

  const acceptBtn = page.locator('button:has-text("Accept")');
  if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await acceptBtn.click();
    console.log('  Clicked Accept (consent)');
    await page.waitForTimeout(5000);
  }

  try {
    await page.waitForURL(`${BASE_URL}**`, { timeout: 30000 });
  } catch {
    if (page.url().includes('auth0')) {
      console.log('  Still on Auth0 after submit, trying login...');
      const loginLink = page.locator('a:has-text("Log in"), a:has-text("Log In")');
      if (await loginLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginLink.click();
        await page.waitForTimeout(3000);
        const emailInput2 = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
        await emailInput2.fill(EMAIL);
        const pwdInput2 = page.locator('input[name="password"], input[type="password"]').first();
        if (await pwdInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await pwdInput2.fill(PASSWORD);
        }
        await page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Log In")').first().click();
        await page.waitForTimeout(10000);
        const acc2 = page.locator('button:has-text("Accept")');
        if (await acc2.isVisible({ timeout: 3000 }).catch(() => false)) { await acc2.click(); await page.waitForTimeout(5000); }
        try { await page.waitForURL(`${BASE_URL}**`, { timeout: 20000 }); } catch { await page.waitForTimeout(5000); }
      }
    }
  }

  await waitForStable(page, 5000);
  console.log('  Returned to app: ' + page.url().substring(0, 80));
  await shot(page, 'auth0_returned');
  return true;
}

/** Fill Step 1 fields for C-Corp */
async function fillStep1(page) {
  // Select C-Corp entity type
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="C-Corp"]');
    if (btn) {
      const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
      if (pk && btn[pk]?.onClick) btn[pk].onClick();
      else btn.click();
    }
  });
  await page.waitForTimeout(1500);
  console.log('  Selected C-Corp');

  // Fill company name
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('AVENIDA TECH');
  console.log('  Filled name: AVENIDA TECH');
  await page.waitForTimeout(500);

  // Select Inc suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'Inc')) {
      await sel.selectOption('Inc');
      console.log('  Selected suffix: Inc');
      break;
    }
  }

  // Select Florida state
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'Florida')) {
      await sel.selectOption('Florida');
      console.log('  Selected state: Florida');
      break;
    }
  }

  // No for address and phone
  await page.evaluate(() => {
    document.querySelectorAll('[role="radiogroup"]').forEach(g => {
      const label = g.getAttribute('aria-label') || '';
      if (label.includes('dirección') || label.includes('teléfono') || label.includes('address') || label.includes('phone')) {
        const noBtn = g.querySelector('button[aria-label="No"]');
        if (noBtn) {
          const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps'));
          if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick();
          else noBtn.click();
        }
      }
    });
  });
  console.log('  Set No for address & phone');

  // Set 10,000 authorized shares
  await setFormValue(page, 'company.numberOfShares', 10000);
  console.log('  Set 10,000 authorized shares');
}

/** Fill Step 2 owners: Carlos Martinez 55%, Laura Fernandez 45% */
async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 2);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 2');

  // Owner 1: Carlos Martinez (55%)
  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Carlos');
    await page.locator('input[name="owners.0.lastName"]').fill('Martinez');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Carlos Martinez').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('55').catch(() => {});
  console.log('  Owner 1: Carlos Martinez 55%');

  // Owner 2: Laura Fernandez (45%)
  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Laura');
    await page.locator('input[name="owners.1.lastName"]').fill('Fernandez');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Laura Fernandez').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('45').catch(() => {});
  console.log('  Owner 2: Laura Fernandez 45%');

  // Citizenship = No for all
  await page.evaluate(() => {
    document.querySelectorAll('[role="radiogroup"]').forEach(g => {
      const l = g.getAttribute('aria-label') || '';
      if (l.includes('Residencia') || l.includes('citizen')) {
        const noBtn = g.querySelector('button[aria-label="No"]');
        if (noBtn) {
          const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps'));
          if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick();
          else noBtn.click();
        }
      }
    });
  });
  console.log('  Set citizenship: No for all');
}

// ─── Main Test ──────────────────────────────────────────────────────

async function main() {
  console.log('=== DEMO C-CORP: AVENIDA TECH Inc ===');
  console.log('Dir: ' + DIR);
  console.log('Email: ' + EMAIL);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ========================== STEP 1: COMPANY ==========================
    console.log('=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    await fillStep1(page);
    await shot(page, 'step1_company');
    await clickContinuar(page);

    // Auth0
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    const isStep1 = await page.locator('button[aria-label="C-Corp"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await fillStep1(page);
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page);
      await waitForStable(page, 3000);
    }

    await shot(page, 'step2_initial');
    await fillStep2(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    // Auth0 redirect after Step 2
    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2 (expected)');
      await handleAuth0(page);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 'post_auth');

    let pageText = await page.evaluate(() => document.body.innerText);

    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    pageText = await page.evaluate(() => document.body.innerText);
    if ((pageText.includes('accionistas') || pageText.includes('Nombre')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), checking data...');
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await fillStep2(page);
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ========================== STEP 3: ADMIN (Directors & Officers) ==========================
    console.log('=== STEP 3: Admin (Directors & Officers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "directores": ' + pageText.includes('directores'));
    console.log('  Page contains "oficiales": ' + pageText.includes('oficiales'));
    await shot(page, 'step3_initial');

    // All owners are directors (default Yes)
    // All owners are officers (default Yes)
    await page.waitForTimeout(2000);

    // Assign officer roles via React fiber
    // Carlos = President, Laura = Vice-President
    await setFormValue(page, 'admin.shareholderOfficer1Role', 'President');
    await setFormValue(page, 'admin.shareholderOfficer2Role', 'Vice-President');
    console.log('  Set roles: Carlos=President, Laura=Vice-President');

    // Also try to select via UI dropdowns
    const roleSelects = await page.locator('select:visible').all();
    let rolesAssigned = 0;
    const roleOrder = ['President', 'Vice-President'];
    for (const sel of roleSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'President') && rolesAssigned < roleOrder.length) {
        await sel.selectOption(roleOrder[rolesAssigned]);
        console.log(`  UI: Assigned ${roleOrder[rolesAssigned]}`);
        rolesAssigned++;
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step3_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step3_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 4: SUMMARY ==========================
    console.log('=== STEP 4: Summary ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step4_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step4_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // "Lo quiero" in agreement modal
    const loQuiero = page.locator('button:has-text("Lo quiero")');
    if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, 'step4_agreement_modal');
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent?.includes('Lo quiero')) {
            const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
            if (pk && btn[pk]?.onClick) btn[pk].onClick();
            else btn.click();
            return;
          }
        }
      });
      console.log('  Clicked "Lo quiero" - wants agreement');
      await waitForStable(page, 3000);
    } else {
      console.log('  [warn] No agreement modal found');
    }

    // ========================== STEP 5: AGREEMENT 1 - Duenos & Roles ==========================
    console.log('=== STEP 5: Agreement - Duenos & Roles ===');
    await shot(page, 'step5_initial');

    // Fill capital contributions: $55,000 / $45,000
    await setFormValue(page, 'agreement.corp_capitalPerOwner_0', '55000');
    await setFormValue(page, 'agreement.corp_capitalPerOwner_1', '45000');
    console.log('  Set capital: $55,000 / $45,000');

    // Also try to fill via UI inputs
    const capInputs = await page.locator('input[name*="capitalPerOwner"]').all();
    if (capInputs.length >= 2) {
      await capInputs[0].fill('55000').catch(() => {});
      await capInputs[1].fill('45000').catch(() => {});
      console.log('  UI: Filled capital inputs');
    }

    // Specific responsibilities = No (default)
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step5_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step5_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Prestamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Prestamos ===');
    await shot(page, 'step6_initial');

    // Majority threshold: 50.01%
    const majorityInput = page.locator('input[name="agreement.majorityThreshold"]');
    if (await majorityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await majorityInput.fill('');
      await majorityInput.fill('50.01');
      console.log('  Majority threshold: 50.01%');
    }

    // Supermajority threshold: 75%
    const superInput = page.locator('input[name="agreement.supermajorityThreshold"]');
    if (await superInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await superInput.fill('');
      await superInput.fill('75');
      console.log('  Supermajority threshold: 75%');
    }

    // New shareholders admission: Supermayoria
    await clickToggle(page, 'New shareholders admission', 'Supermayoría');

    // Additional contributions: Pro-Rata
    await clickToggle(page, 'More capital process', 'Sí, Pro-Rata');

    // Shareholder loans: No
    await clickToggle(page, 'Shareholder loans', 'No');
    console.log('  Shareholder loans: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step6_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step6_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale: Supermayoria
    await clickToggle(page, 'Sale decision threshold', 'Supermayoría');

    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    // Bank: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');

    // Major decisions: Mayoria
    await clickToggle(page, 'Major decision threshold', 'Mayoría');

    // Spending threshold: $5,000
    await setFormValue(page, 'agreement.corp_majorSpendingThreshold', '5000');
    // Also try UI input
    const spendingInput = page.locator('input[name="agreement.corp_majorSpendingThreshold"]');
    if (await spendingInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spendingInput.fill('');
      await spendingInput.fill('5000');
    }
    console.log('  Set spending threshold: $5,000');

    // Officer removal: Supermayoria
    await clickToggle(page, 'Officer removal voting', 'Supermayoría');

    // Non-solicitation: Yes (visible because non-compete = No)
    await clickToggle(page, 'Non solicitation covenant', 'Sí');
    console.log('  Non-solicitation: Yes');

    // Confidentiality: Yes
    await clickToggle(page, 'Confidentiality NDA', 'Sí');

    // Distribution: Trimestral
    await setFormValue(page, 'agreement.distributionFrequency', 'Trimestral');
    // Also try UI toggle
    await clickToggle(page, 'Distribution frequency', 'Trimestral');
    console.log('  Distribution frequency: Trimestral');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 8: AGREEMENT 4 - Acciones & Sucesion ==========================
    console.log('=== STEP 8: Agreement - Acciones & Sucesion ===');
    await shot(page, 'step8_initial');

    // ROFR: Yes
    await clickToggle(page, 'Right of first refusal', 'Sí');
    await page.waitForTimeout(1000);

    // ROFR period: 90 days
    const rofrInput = page.locator('input[name="agreement.corp_rofrOfferPeriod"]');
    if (await rofrInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rofrInput.fill('');
      await rofrInput.fill('90');
      console.log('  ROFR period: 90 days');
    } else {
      await setFormValue(page, 'agreement.corp_rofrOfferPeriod', 90);
      console.log('  ROFR period (via fiber): 90 days');
    }

    // Transfer to relatives: Unanimous
    await setFormValue(page, 'agreement.corp_transferToRelatives', 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.');
    console.log('  Transfer to relatives: Unanimous');
    // Also try UI select
    const transferSels = await page.locator('select:visible').all();
    for (const sel of transferSels) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o.includes('unánime'))) {
        const opt = opts.find(o => o.includes('unánime'));
        await sel.selectOption({ label: opt });
        console.log('  UI: Selected ' + opt.substring(0, 50));
        break;
      }
    }

    // Death/Incapacity: Yes (forced sale)
    await clickToggle(page, 'Incapacity heirs policy', 'Sí');

    // Divorce buyout: Yes
    await clickToggle(page, 'Divorce buyout policy', 'Sí');

    // Tag/Drag along: Yes
    await clickToggle(page, 'Tag along drag along rights', 'Sí');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 9: CHECKOUT ==========================
    console.log('=== STEP 9: Checkout ===');
    await shot(page, 'step9_initial');

    const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
    if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await revBtn.click();
      console.log('  Clicked Revisar Paquete');
      await waitForStable(page, 3000);
    }

    await shot(page, 'step9_services');

    const payBtn = page.locator('button:has-text("Proceder al Pago")').first();
    if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await payBtn.click();
      console.log('  Clicked Proceder al Pago');
    } else {
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent?.includes('Pago') && btn.offsetHeight > 0) { btn.click(); return; }
        }
      });
    }

    // Wait for Stripe redirect
    console.log('  Waiting for Stripe...');
    await page.waitForTimeout(15000);

    const stripeUrl = page.url();
    console.log('  URL: ' + stripeUrl.substring(0, 100));

    if (stripeUrl.includes('stripe') || stripeUrl.includes('checkout.stripe')) {
      // ========================== STRIPE PAYMENT ==========================
      console.log('=== STRIPE PAYMENT ===');
      await shot(page, 'stripe_checkout');

      await page.locator('#cardNumber').fill('4242424242424242').catch(async () => {
        await page.locator('input[name="cardNumber"]').fill('4242424242424242').catch(() => {});
      });
      console.log('  Filled card number');

      await page.locator('#cardExpiry').fill('12/29').catch(async () => {
        await page.locator('input[name="cardExpiry"]').fill('12/29').catch(() => {});
      });
      console.log('  Filled expiry');

      await page.locator('#cardCvc').fill('123').catch(async () => {
        await page.locator('input[name="cardCvc"]').fill('123').catch(() => {});
      });
      console.log('  Filled CVC');

      await page.locator('#billingName, input[name="billingName"]').first().fill('Carlos Martinez').catch(() => {});
      await page.locator('#billingPostalCode, input[name="billingPostalCode"]').first().fill('33101').catch(() => {});

      await shot(page, 'stripe_filled');

      console.log('  Clicking Pay...');
      await page.locator('.SubmitButton, button[type="submit"]').first().click();

      console.log('  Processing payment (30s)...');
      await page.waitForTimeout(30000);
      await shot(page, 'payment_result');
      console.log('  Post-payment URL: ' + page.url().substring(0, 100));

      // ========================== DASHBOARD ==========================
      console.log('=== DASHBOARD ===');

      let docs = [];
      const maxPolls = 15;
      for (let poll = 0; poll < maxPolls; poll++) {
        console.log(`  Polling dashboard (${poll + 1}/${maxPolls})...`);

        if (poll === 0) {
          console.log('  Waiting 60s for document generation...');
          await page.waitForTimeout(60000);
        } else {
          await page.waitForTimeout(15000);
        }

        await page.goto(BASE_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 60000 });
        await waitForStable(page, 5000);

        docs = await page.evaluate(async () => {
          try {
            const resp = await fetch('/api/documents');
            if (!resp.ok) return [];
            const data = await resp.json();
            if (data.documents && data.documents.length > 0) {
              return data.documents.map(d => ({
                id: d.id, name: d.name || d.documentType, s3Key: d.s3Key, status: d.status
              }));
            }
          } catch {}
          return [];
        });

        if (docs.length === 0) {
          docs = await page.evaluate(() => {
            for (const el of document.querySelectorAll('*')) {
              for (const key of Object.keys(el)) {
                if (!key.startsWith('__reactFiber')) continue;
                let fiber = el[key], d = 0;
                while (fiber && d < 15) {
                  const state = fiber.memoizedState;
                  let s = state;
                  while (s) {
                    if (s.queue?.lastRenderedState && Array.isArray(s.queue.lastRenderedState)) {
                      const arr = s.queue.lastRenderedState;
                      if (arr.length > 0 && arr[0] && (arr[0].name || arr[0].documentType) && arr[0].id) {
                        return arr.map(doc => ({
                          id: doc.id,
                          name: doc.name || doc.documentType,
                          s3Key: doc.s3Key,
                          status: doc.status,
                        }));
                      }
                    }
                    s = s.next;
                  }
                  fiber = fiber.return; d++;
                }
              }
            }
            return [];
          });
        }

        console.log(`  Found ${docs.length} documents`);
        if (docs.length >= 3) break;
      }

      // Dashboard screenshots
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'dashboard_bottom');

      // Take a mid-page screenshot too
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await shot(page, 'dashboard_mid');

      console.log('\n=== DOCUMENTS FOUND ===');
      for (const doc of docs) {
        console.log(`  ${doc.name} | S3: ${doc.s3Key} | Status: ${doc.status}`);
      }

      // Save document list
      writeFileSync(join(DIR, 'documents.json'), JSON.stringify(docs, null, 2));

    } else {
      console.log('  ERROR: Not on Stripe page! URL: ' + page.url());
      await shot(page, 'error_not_stripe');
    }

  } catch (e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    await shot(page, 'error_fatal').catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('  DEMO COMPLETE: AVENIDA TECH Inc (C-Corp)');
  console.log('='.repeat(60));
  console.log('  Email: ' + EMAIL);
  console.log('  Screenshots: ' + DIR);
  console.log('');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
