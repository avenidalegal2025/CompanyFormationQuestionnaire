/**
 * Full E2E test: C-Corp formation through the REAL questionnaire UI.
 *
 * Company: PLAYWRIGHT QA (C-Corp, Florida, Corp suffix)
 * Owners: John TestOne (55%), Jane TestTwo (45%)
 * Both are directors and officers. John=President, Jane=Vice-President
 * 5,000 authorized shares
 * Agreement: Yes (via "Lo quiero" button)
 *   - Sale: Supermayoría
 *   - Major decisions: Mayoría
 *   - Bank: Dos firmantes
 *   - Non-compete: No
 *   - ROFR: Yes (180 days)
 *   - Transfer to relatives: Unanimous
 *   - Death forced sale: Yes
 *   - Tag/Drag along: Yes
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-qa-screenshots');
mkdirSync(DIR, { recursive: true });

const EMAIL = `test+e2e_corp_${Date.now()}@gmail.com`;
const PASSWORD = 'Test2026!Secure';

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
    // Click backdrop overlays
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el.classList.contains('bg-black/40') || el.classList.contains('bg-black/80')) el.click();
    });
    // Click close buttons
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

  // Check if it's a signup page (has "Sign Up" in text)
  const isSignup = await page.evaluate(() => document.body.innerText.includes('Sign Up'));

  // Fill email
  const emailInput = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(EMAIL);
    console.log('  Filled email');
  }

  // Fill password
  const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pwdInput.fill(PASSWORD);
    console.log('  Filled password');
  }

  await shot(page, 'auth0_filled');

  // Click Continue/Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Log In"), button:has-text("Sign Up")').first();
  await submitBtn.click();
  console.log('  Clicked submit');
  await page.waitForTimeout(10000);

  // Handle possible consent screen
  const acceptBtn = page.locator('button:has-text("Accept")');
  if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await acceptBtn.click();
    console.log('  Clicked Accept (consent)');
    await page.waitForTimeout(5000);
  }

  // Wait for redirect back to app
  try {
    await page.waitForURL(`${BASE_URL}**`, { timeout: 30000 });
  } catch {
    // Still on auth0? May need to handle login vs signup
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

async function main() {
  console.log('=== FULL E2E C-CORP TEST ===');
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

    // Select C-Corp
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="C-Corp"]');
      if (btn) { const pk = Object.keys(btn).find(k => k.startsWith('__reactProps')); if (pk && btn[pk]?.onClick) btn[pk].onClick(); else btn.click(); }
    });
    await page.waitForTimeout(1500);
    console.log('  Selected C-Corp');

    // Fill company name
    await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('PLAYWRIGHT QA');
    console.log('  Filled name: PLAYWRIGHT QA');
    await page.waitForTimeout(500);

    // Select Corp suffix
    const suffixSelects = await page.locator('select:visible').all();
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'Corp')) { await sel.selectOption('Corp'); console.log('  Selected suffix: Corp'); break; }
    }

    // Florida (should be default but ensure)
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'Florida')) { await sel.selectOption('Florida'); console.log('  Selected state: Florida'); break; }
    }

    // No for address and phone
    await page.evaluate(() => {
      document.querySelectorAll('[role="radiogroup"]').forEach(g => {
        const label = g.getAttribute('aria-label') || '';
        if (label.includes('dirección') || label.includes('teléfono')) {
          const noBtn = g.querySelector('button[aria-label="No"]');
          if (noBtn) { const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps')); if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick(); else noBtn.click(); }
        }
      });
    });
    console.log('  Set No for address & phone');

    // Set 5000 shares
    await setFormValue(page, 'company.numberOfShares', 5000);
    console.log('  Set 5000 shares');

    await shot(page, 'step1_company');
    await clickContinuar(page);

    // Check for Auth0 after step 1
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    // If still on step 1, re-fill
    const isStep1 = await page.locator('button[aria-label="C-Corp"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="C-Corp"]');
        if (btn) { const pk = Object.keys(btn).find(k => k.startsWith('__reactProps')); if (pk && btn[pk]?.onClick) btn[pk].onClick(); }
      });
      await page.waitForTimeout(500);
      await page.locator('input[placeholder*="Nombre"]').first().fill('PLAYWRIGHT QA');
      const sels = await page.locator('select:visible').all();
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'Corp')) { await s.selectOption('Corp'); break; } }
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'Florida')) { await s.selectOption('Florida'); break; } }
      await page.evaluate(() => {
        document.querySelectorAll('[role="radiogroup"]').forEach(g => {
          const l = g.getAttribute('aria-label') || '';
          if (l.includes('dirección') || l.includes('teléfono')) { const b = g.querySelector('button[aria-label="No"]'); if (b) { const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if (pk && b[pk]?.onClick) b[pk].onClick(); } }
        });
      });
      await setFormValue(page, 'company.numberOfShares', 5000);
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page);
      await waitForStable(page, 3000);
    }

    await shot(page, 'step2_initial');

    // Set 2 owners
    await setFormValue(page, 'ownersCount', 2);
    await page.waitForTimeout(2000);
    console.log('  Set ownersCount: 2');

    // Owner 1
    const fn0 = page.locator('input[name="owners.0.firstName"]');
    if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fn0.fill('John');
      await page.locator('input[name="owners.0.lastName"]').fill('TestOne');
    } else {
      await page.locator('input[name="owners.0.fullName"]').fill('John TestOne').catch(() => {});
    }
    await page.locator('input[name="owners.0.ownership"]').fill('55').catch(() => {});
    console.log('  Owner 1: John TestOne 55%');

    // Owner 2
    const fn1 = page.locator('input[name="owners.1.firstName"]');
    if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fn1.fill('Jane');
      await page.locator('input[name="owners.1.lastName"]').fill('TestTwo');
    } else {
      await page.locator('input[name="owners.1.fullName"]').fill('Jane TestTwo').catch(() => {});
    }
    await page.locator('input[name="owners.1.ownership"]').fill('45').catch(() => {});
    console.log('  Owner 2: Jane TestTwo 45%');

    // Citizenship = No for both
    await page.evaluate(() => {
      document.querySelectorAll('[role="radiogroup"]').forEach(g => {
        const l = g.getAttribute('aria-label') || '';
        if (l.includes('Residencia') || l.includes('citizen')) {
          const noBtn = g.querySelector('button[aria-label="No"]');
          if (noBtn) { const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps')); if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick(); else noBtn.click(); }
        }
      });
    });
    console.log('  Set citizenship: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    // CRITICAL: Check for Auth0 redirect after Step 2
    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2 (expected)');
      await handleAuth0(page);
      await waitForStable(page, 5000);
    }

    // After auth, form data should be restored. Check if on step 3 or step 2.
    // The app restores anonymous data post-signup.
    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 'post_auth');

    // If still on step 1 after auth, the anonymous data was restored and we need to advance
    // Check for the step by looking at the page content
    let pageText = await page.evaluate(() => document.body.innerText);

    // Check if we're on Propietarios (step 2) or Administrativo (step 3)
    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    if (pageText.includes('accionistas') && pageText.includes('Nombre') && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), data should be restored...');
      // Verify owners data is present, if not re-fill
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await setFormValue(page, 'ownersCount', 2);
        await page.waitForTimeout(1000);
        const fn0b = page.locator('input[name="owners.0.firstName"]');
        if (await fn0b.isVisible({ timeout: 1000 }).catch(() => false)) {
          await fn0b.fill('John');
          await page.locator('input[name="owners.0.lastName"]').fill('TestOne');
        }
        await page.locator('input[name="owners.0.ownership"]').fill('55').catch(() => {});
        const fn1b = page.locator('input[name="owners.1.firstName"]');
        if (await fn1b.isVisible({ timeout: 1000 }).catch(() => false)) {
          await fn1b.fill('Jane');
          await page.locator('input[name="owners.1.lastName"]').fill('TestTwo');
        }
        await page.locator('input[name="owners.1.ownership"]').fill('45').catch(() => {});
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ========================== STEP 3: ADMIN ==========================
    console.log('=== STEP 3: Admin ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "directores": ' + pageText.includes('directores'));
    console.log('  Page contains "oficiales": ' + pageText.includes('oficiales'));
    await shot(page, 'step3_initial');

    // Directors = all owners (default Sí)
    // Officers = all owners (default Sí)
    // Find role select dropdowns for assigning President/VP
    await page.waitForTimeout(2000);

    // Assign officer roles via React fiber
    await setFormValue(page, 'admin.shareholderOfficer1Role', 'President');
    await setFormValue(page, 'admin.shareholderOfficer2Role', 'Vice-President');
    console.log('  Set roles: John=President, Jane=Vice-President');

    // Also try to select via UI dropdowns
    const roleSelects = await page.locator('select:visible').all();
    let presAssigned = false;
    for (const sel of roleSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'President')) {
        if (!presAssigned) { await sel.selectOption('President'); presAssigned = true; console.log('  UI: Assigned President'); }
        else { await sel.selectOption('Vice-President'); console.log('  UI: Assigned Vice-President'); }
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

    // Click primary button (Enviar) -> triggers agreement modal
    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // Look for "Lo quiero" in the agreement modal
    const loQuiero = page.locator('button:has-text("Lo quiero")');
    if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, 'step4_agreement_modal');
      // Click via evaluate to bypass overlay
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

    // ========================== STEP 5: AGREEMENT 1 - Dueños & Roles ==========================
    console.log('=== STEP 5: Agreement - Dueños & Roles ===');
    await shot(page, 'step5_initial');

    // Fill capital contributions
    await setFormValue(page, 'agreement.corp_capitalPerOwner_0', '50000');
    await setFormValue(page, 'agreement.corp_capitalPerOwner_1', '40000');
    console.log('  Set capital: $50,000 / $40,000');

    // Specific responsibilities = Sí, with per-owner titles + descriptions.
    // Exercises the feature shipped in commit a3c4e960 (Specific Responsibilities
    // of Shareholders section in the generated doc).
    await clickToggle(page, 'Has specific responsibilities', 'Sí');
    await waitForStable(page, 1000);
    await setFormValue(page, 'agreement.corp_specificResponsibilities_0', 'Chief Executive Officer');
    await setFormValue(page, 'agreement.corp_responsibilityDesc_0', 'Overall strategy, fundraising, and external partnerships.');
    await setFormValue(page, 'agreement.corp_specificResponsibilities_1', 'Chief Technology Officer');
    await setFormValue(page, 'agreement.corp_responsibilityDesc_1', 'Product engineering, hiring, and tech operations.');
    console.log('  Set responsibilities: CEO (Alice-ish) / CTO (Bob-ish)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step5_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step5_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Préstamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Préstamos ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step6_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step6_bottom');

    // Keep defaults
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale: Supermayoría
    await clickToggle(page, 'Sale decision threshold', 'Supermayoría');
    // Bank: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');
    // Major decisions: Mayoría
    await clickToggle(page, 'Major decision threshold', 'Mayoría');
    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    // Officer removal: Mayoría
    await clickToggle(page, 'Officer removal voting', 'Mayoría');
    // Non-solicitation: Sí (shows when non-compete is No)
    await clickToggle(page, 'Non solicitation', 'Sí');
    // Confidentiality: Sí
    await clickToggle(page, 'Confidentiality NDA', 'Sí');
    // Spending threshold: $7,500
    await setFormValue(page, 'agreement.corp_majorSpendingThreshold', '7500');
    console.log('  Set spending threshold: $7,500');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 8: AGREEMENT 4 - Acciones & Sucesión ==========================
    console.log('=== STEP 8: Agreement - Acciones & Sucesión ===');
    await shot(page, 'step8_initial');

    // ROFR: Yes
    await clickToggle(page, 'Right of first refusal', 'Sí');
    await page.waitForTimeout(1000);
    // ROFR period: 180 days
    await setFormValue(page, 'agreement.corp_rofrOfferPeriod', 180);
    console.log('  ROFR period: 180 days');

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

    // Death/Incapacity: Yes
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

    // Click "Revisar Paquete y Proceder al Pago"
    const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
    if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await revBtn.click();
      console.log('  Clicked Revisar Paquete');
      await waitForStable(page, 3000);
    }

    await shot(page, 'step9_services');

    // Click "Proceder al Pago"
    const payBtn = page.locator('button:has-text("Proceder al Pago")').first();
    if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await payBtn.click();
      console.log('  Clicked Proceder al Pago');
    } else {
      // Fallback
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

      // Fill card details
      await page.locator('#cardNumber').fill('4242424242424242').catch(async () => {
        // Try other selectors
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

      await page.locator('#billingName, input[name="billingName"]').first().fill('John TestOne').catch(() => {});
      await page.locator('#billingPostalCode, input[name="billingPostalCode"]').first().fill('33101').catch(() => {});

      await shot(page, 'stripe_filled');

      // Click Pay
      console.log('  Clicking Pay...');
      await page.locator('.SubmitButton, button[type="submit"]').first().click();

      // Wait for payment
      console.log('  Processing payment (30s)...');
      await page.waitForTimeout(30000);
      await shot(page, 'payment_result');

      console.log('  Post-payment URL: ' + page.url().substring(0, 100));

      // ========================== DASHBOARD ==========================
      console.log('=== DASHBOARD ===');
      console.log('  Waiting 60s for document generation...');
      await page.waitForTimeout(60000);

      await page.goto(BASE_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 60000 });
      await waitForStable(page, 10000);

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'dashboard_bottom');

      // ========================== WORD ONLINE DOCUMENTS ==========================
      console.log('=== WORD ONLINE DOCUMENTS ===');

      // Extract documents from React state on the dashboard page
      const docs = await page.evaluate(() => {
        // Find React fiber with documents state
        for (const el of document.querySelectorAll('*')) {
          for (const key of Object.keys(el)) {
            if (!key.startsWith('__reactFiber')) continue;
            let fiber = el[key], d = 0;
            while (fiber && d < 15) {
              const state = fiber.memoizedState;
              // Walk the state linked list
              let s = state;
              while (s) {
                if (s.queue?.lastRenderedState && Array.isArray(s.queue.lastRenderedState)) {
                  const arr = s.queue.lastRenderedState;
                  // Check if this looks like a documents array
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
              fiber = fiber.return;
              d++;
            }
          }
        }
        return [];
      });

      console.log('  Found ' + docs.length + ' documents from React state');

      if (docs.length === 0) {
        // Fallback: get document names from the Descargar buttons
        console.log('  Trying to extract doc info from Descargar buttons...');
        const btnDocs = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('button, a').forEach(el => {
            if (el.textContent?.trim() === 'Descargar') {
              // Walk up to the card container
              const card = el.closest('.bg-white, [class*="rounded"]');
              const nameEl = card?.querySelector('h3, h4, .font-semibold, .font-bold');
              const name = nameEl?.textContent?.trim() || 'Unknown';
              // Try to get the onClick data
              const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
              let docId = '';
              if (pk && el[pk]?.onClick) {
                // The onClick calls handleDownload(doc.id) - extract from closure
                const fnStr = el[pk].onClick.toString();
                // Can't easily extract from closure, but we can use a different approach
              }
              results.push({ name });
            }
          });
          return results;
        });
        console.log('  Found ' + btnDocs.length + ' documents from buttons');

        // Use the /api/documents endpoint without companyId (falls back to session)
        const apiDocs = await page.evaluate(async () => {
          try {
            const resp = await fetch('/api/documents');
            if (!resp.ok) return { error: resp.status };
            return await resp.json();
          } catch (e) { return { error: e.message }; }
        });
        if (apiDocs.documents) {
          docs.push(...apiDocs.documents.map(d => ({
            id: d.id, name: d.name || d.documentType, s3Key: d.s3Key, status: d.status
          })));
          console.log('  Found ' + apiDocs.documents.length + ' documents from /api/documents');
        } else {
          console.log('  API result: ' + JSON.stringify(apiDocs).substring(0, 100));
        }
      }

      // For each document, get the S3 key and generate a presigned URL using AWS CLI,
      // then open in Google Docs viewer (more reliable than Word Online for S3 URLs)
      for (const doc of docs) {
        const name = doc.name || 'unknown';
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        console.log(`  Document: ${name} (id: ${doc.id || 'none'}, s3Key: ${doc.s3Key || 'none'})`);

        if (!doc.s3Key) {
          console.log('    No S3 key, skipping');
          continue;
        }

        // Generate presigned URL using AWS CLI
        const { execSync } = await import('child_process');
        let presignedUrl = '';
        try {
          const s3Uri = `s3://avenida-legal-documents/${doc.s3Key}`;
          presignedUrl = execSync(
            `aws s3 presign "${s3Uri}" --profile llc-admin --region us-west-1 --expires-in 600`,
            { encoding: 'utf8', timeout: 15000 }
          ).trim();
          console.log('    Presigned URL generated');
        } catch (e) {
          console.log('    Failed to generate presigned URL: ' + (e.message || '').substring(0, 80));

          // Fallback: try the API download endpoint
          presignedUrl = await page.evaluate(async (docId) => {
            try {
              const r = await fetch('/api/documents/' + encodeURIComponent(docId) + '/download');
              if (!r.ok) return '';
              const d = await r.json();
              return d.url || d.downloadUrl || d.signedUrl || '';
            } catch { return ''; }
          }, doc.id);
        }

        if (!presignedUrl) {
          console.log('    No URL available, skipping');
          continue;
        }

        // Open in Google Docs viewer (as recommended in CLAUDE.md)
        const encodedUrl = encodeURIComponent(presignedUrl);
        const viewerUrl = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
        console.log('    Opening in Google Docs viewer...');

        const docPage = await ctx.newPage();
        docPage.setDefaultTimeout(60000);
        try {
          await docPage.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await docPage.waitForTimeout(20000);

          await shot(docPage, `doc_${safeName}_p1`);
          for (let pg = 2; pg <= 15; pg++) {
            await docPage.keyboard.press('PageDown');
            await docPage.waitForTimeout(2000);
            await shot(docPage, `doc_${safeName}_p${pg}`);
          }
        } catch (e) {
          console.log('    Google Docs error, trying Word Online fallback...');
          // Fallback to Word Online viewer
          const woUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
          try {
            await docPage.goto(woUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await docPage.waitForTimeout(30000); // Word Online needs more time
            await shot(docPage, `doc_${safeName}_p1`);
            for (let pg = 2; pg <= 10; pg++) {
              await docPage.keyboard.press('PageDown');
              await docPage.waitForTimeout(2000);
              await shot(docPage, `doc_${safeName}_p${pg}`);
            }
          } catch (e2) {
            console.log('    Word Online also failed: ' + (e2.message || '').substring(0, 60));
            await shot(docPage, `doc_${safeName}_error`);
          }
        }
        await docPage.close();
      }

    } else {
      console.log('  NOT on Stripe. URL: ' + stripeUrl);
      await shot(page, 'not_stripe');
    }

    console.log('\n=== COMPLETE ===');
    console.log('Screenshots: ' + DIR);
    console.log('Total: ' + shotN);

  } catch (e) {
    console.error('FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'fatal_error').catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
