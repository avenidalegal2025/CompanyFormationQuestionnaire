/**
 * Full E2E test: LLC formation through the REAL questionnaire UI.
 *
 * Company: PLAYWRIGHT QA LLC (LLC, Florida, LLC suffix)
 * Owners: Maria Garcia (40%), Carlos Lopez (35%), Ana Martinez (25%)
 * All owners are managers
 * Agreement: Yes (via "Lo quiero" button)
 *   - Majority threshold: 50.01%
 *   - Supermajority threshold: 75%
 *   - Capital contributions: $40K / $35K / $25K
 *   - All members are managing members
 *   - New members admission: Supermayoria
 *   - Additional contributions: Pro-Rata
 *   - Member loans: Yes, voting = Mayoria
 *   - Sale of company: Decision Unanime
 *   - Tax Partner: Maria Garcia
 *   - Non-compete: Yes (2 years, State of Florida)
 *   - Bank signees: Un firmante
 *   - Major decisions: Mayoria
 *   - Minor decisions: Decision Unanime
 *   - Spending threshold: $10,000
 *   - Officer removal: Supermayoria
 *   - Distribution: Trimestral (default)
 *   - Min tax distribution: 30% (default)
 *   - ROFR: Yes (180 days)
 *   - Transfer to relatives: Free
 *   - Death/incapacity: No (successor retains)
 *   - New partners admission: Supermayoria
 *   - Dissolution: Decision Unanime
 *   - Divorce buyout: Yes
 *   - Tag/drag along: No
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-qa-screenshots-llc');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+e2e_llc_test_${TIMESTAMP}@gmail.com`;
const PASSWORD = 'TestPass123!';

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

  // Fill email
  const emailInput = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(EMAIL);
    console.log('  Filled email: ' + EMAIL);
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

/** Helper: fill Step 1 fields for LLC */
async function fillStep1(page) {
  // Select LLC
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="LLC"]');
    if (btn) {
      const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
      if (pk && btn[pk]?.onClick) btn[pk].onClick();
      else btn.click();
    }
  });
  await page.waitForTimeout(1500);
  console.log('  Selected LLC');

  // Fill company name
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('PLAYWRIGHT QA LLC');
  console.log('  Filled name: PLAYWRIGHT QA LLC');
  await page.waitForTimeout(500);

  // Select LLC suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'LLC')) {
      await sel.selectOption('LLC');
      console.log('  Selected suffix: LLC');
      break;
    }
  }

  // Florida
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
}

/** Helper: fill Step 2 owners for LLC (3 owners) */
async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 3);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 3');

  // Owner 1: Maria Garcia (40%)
  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Maria');
    await page.locator('input[name="owners.0.lastName"]').fill('Garcia');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Maria Garcia').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('40').catch(() => {});
  console.log('  Owner 1: Maria Garcia 40%');

  // Owner 2: Carlos Lopez (35%)
  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Carlos');
    await page.locator('input[name="owners.1.lastName"]').fill('Lopez');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Carlos Lopez').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('35').catch(() => {});
  console.log('  Owner 2: Carlos Lopez 35%');

  // Owner 3: Ana Martinez (25%)
  const fn2 = page.locator('input[name="owners.2.firstName"]');
  if (await fn2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn2.fill('Ana');
    await page.locator('input[name="owners.2.lastName"]').fill('Martinez');
  } else {
    await page.locator('input[name="owners.2.fullName"]').fill('Ana Martinez').catch(() => {});
  }
  await page.locator('input[name="owners.2.ownership"]').fill('25').catch(() => {});
  console.log('  Owner 3: Ana Martinez 25%');

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

async function main() {
  console.log('=== FULL E2E LLC TEST ===');
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

    // Check for Auth0 after step 1
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    // If still on step 1, re-fill
    const isStep1 = await page.locator('button[aria-label="LLC"]').isVisible({ timeout: 2000 }).catch(() => false);
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

    // CRITICAL: Check for Auth0 redirect after Step 2
    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2 (expected)');
      await handleAuth0(page);
      await waitForStable(page, 5000);
    }

    // After auth, form data should be restored
    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 'post_auth');

    let pageText = await page.evaluate(() => document.body.innerText);

    // Check if we're on step 1 after auth
    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // Check if on step 2 (owners)
    pageText = await page.evaluate(() => document.body.innerText);
    if ((pageText.includes('miembros') || pageText.includes('Nombre')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), checking data...');
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await fillStep2(page);
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ========================== STEP 3: ADMIN (LLC => Managers) ==========================
    console.log('=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "gerentes": ' + pageText.includes('gerentes'));
    console.log('  Page contains "administradores": ' + pageText.includes('administradores'));
    await shot(page, 'step3_initial');

    // For LLC: All owners are managers (default is "Yes" for managersAllOwners)
    // Verify the toggle is on "Si" (yes)
    await clickToggle(page, 'All owners are managers', 'Sí');
    // If that aria-label doesn't match, try setting via React fiber
    await setFormValue(page, 'admin.managersAllOwners', 'Yes');
    console.log('  Set all owners as managers: Yes');
    await page.waitForTimeout(1000);

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

    // LLC capital contributions: $40K / $35K / $25K
    await setFormValue(page, 'agreement.llc_capitalContributions_0', '40000');
    await setFormValue(page, 'agreement.llc_capitalContributions_1', '35000');
    await setFormValue(page, 'agreement.llc_capitalContributions_2', '25000');
    console.log('  Set capital: $40,000 / $35,000 / $25,000');

    // All members are managing members (default Yes)
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes (all)');

    // Specific roles = Sí, with per-member titles + descriptions.
    // Exercises the Specific Responsibilities feature (commit a3c4e960).
    await clickToggle(page, 'Has specific roles', 'Sí');
    await waitForStable(page, 1000);
    await setFormValue(page, 'agreement.llc_specificRoles_0', 'Managing Member');
    await setFormValue(page, 'agreement.llc_roleDesc_0', 'Day-to-day operations, client relations, and team leadership.');
    await setFormValue(page, 'agreement.llc_specificRoles_1', 'Finance Lead');
    await setFormValue(page, 'agreement.llc_roleDesc_1', 'Books, tax compliance, and vendor management.');
    await setFormValue(page, 'agreement.llc_specificRoles_2', 'Product Lead');
    await setFormValue(page, 'agreement.llc_roleDesc_2', 'Product roadmap and engineering oversight.');
    console.log('  Specific roles: Managing Member / Finance Lead / Product Lead');

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

    // New members admission: Supermayoria
    await clickToggle(page, 'New members admission', 'Supermayoría');

    // Additional contributions: Pro-Rata (default)
    await clickToggle(page, 'Additional contributions process', 'Sí, Pro-Rata');

    // Member loans: Yes
    await clickToggle(page, 'Member loans', 'Sí');
    await page.waitForTimeout(1000);
    // Member loans voting: Mayoria
    await clickToggle(page, 'Member loans voting', 'Mayoría');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step6_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step6_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale of company: Decision Unanime
    await clickToggle(page, 'LLC sale decision', 'Unánime');

    // Tax Partner: Maria Garcia (select dropdown)
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Maria Garcia")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Maria Garcia' });
      console.log('  Tax Partner: Maria Garcia');
    } else {
      // Fallback via setFormValue
      await setFormValue(page, 'agreement.llc_taxPartner', 'Maria Garcia');
      console.log('  Tax Partner (via fiber): Maria Garcia');
    }

    // Non-compete: Yes
    await clickToggle(page, 'Non compete covenant', 'Sí');
    await page.waitForTimeout(1000);

    // Non-compete duration: 2 years
    const ncDuration = page.locator('input[name="agreement.llc_nonCompeteDuration"]');
    if (await ncDuration.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncDuration.fill('');
      await ncDuration.fill('2');
      console.log('  Non-compete duration: 2 years');
    }

    // Non-compete scope: State of Florida
    const ncScope = page.locator('input[name="agreement.llc_nonCompeteScope"]');
    if (await ncScope.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncScope.fill('State of Florida');
      console.log('  Non-compete scope: State of Florida');
    }

    // Bank signees: Un firmante (default)
    await clickToggle(page, 'Bank signers', 'Un firmante');

    // Major decisions: Mayoria
    await clickToggle(page, 'LLC major decisions', 'Mayoría');

    // Minor decisions: Decision Unanime
    await clickToggle(page, 'LLC minor decisions', 'Unánime');

    // Spending threshold: $10,000
    await setFormValue(page, 'agreement.llc_majorSpendingThreshold', '10000');
    console.log('  Spending threshold: $10,000');

    // Officer removal: Supermayoria
    await clickToggle(page, 'LLC officer removal voting', 'Supermayoría');

    // Non-solicitation: hidden because non-compete is Yes (the UI hides it)
    console.log('  Non-solicitation: hidden (non-compete is Yes)');

    // Confidentiality: Yes (default)
    await clickToggle(page, 'LLC confidentiality NDA', 'Sí');

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
    // ROFR period: 180 days
    const rofrInput = page.locator('input[name="agreement.llc_rofrOfferPeriod"]');
    if (await rofrInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rofrInput.fill('');
      await rofrInput.fill('180');
      console.log('  ROFR period: 180 days');
    } else {
      await setFormValue(page, 'agreement.llc_rofrOfferPeriod', 180);
      console.log('  ROFR period (via fiber): 180 days');
    }

    // Death/incapacity: No (successor retains)
    await clickToggle(page, 'Incapacity heirs policy', 'No');

    // Transfer to relatives: Free
    const transferSelect = page.locator('select').filter({ has: page.locator('option:has-text("libremente")') }).first();
    if (await transferSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await transferSelect.selectOption({ label: 'Sí, podrán transferir libremente.' });
      console.log('  Transfer to relatives: Free');
    } else {
      await setFormValue(page, 'agreement.llc_transferToRelatives', 'Sí, podrán transferir libremente.');
      console.log('  Transfer to relatives (via fiber): Free');
    }

    // New partners admission: Supermayoria
    await clickToggle(page, 'LLC new partners admission', 'Supermayoría');

    // Dissolution: Decision Unanime
    await clickToggle(page, 'LLC dissolution decision', 'Unánime');

    // Divorce buyout: Yes
    await clickToggle(page, 'LLC divorce buyout', 'Sí');

    // Tag/drag along: No
    await clickToggle(page, 'LLC tag drag rights', 'No');

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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Maria Garcia').catch(() => {});
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

      // Poll for documents (up to 2 minutes, every 10s)
      let docs = [];
      const maxPolls = 12;
      for (let poll = 0; poll < maxPolls; poll++) {
        console.log(`  Polling dashboard (${poll + 1}/${maxPolls})...`);

        if (poll === 0) {
          // First poll: wait 60s for initial generation
          console.log('  Waiting 60s for document generation...');
          await page.waitForTimeout(60000);
        } else {
          await page.waitForTimeout(10000);
        }

        await page.goto(BASE_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 60000 });
        await waitForStable(page, 5000);

        // Extract documents from React state
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
                fiber = fiber.return;
                d++;
              }
            }
          }
          return [];
        });

        if (docs.length === 0) {
          // Fallback: try the /api/documents endpoint
          const apiDocs = await page.evaluate(async () => {
            try {
              const resp = await fetch('/api/documents');
              if (!resp.ok) return { error: resp.status };
              return await resp.json();
            } catch (e) { return { error: e.message }; }
          });
          if (apiDocs.documents && apiDocs.documents.length > 0) {
            docs = apiDocs.documents.map(d => ({
              id: d.id, name: d.name || d.documentType, s3Key: d.s3Key, status: d.status
            }));
          }
        }

        console.log(`  Found ${docs.length} documents`);
        if (docs.length > 0) break;
      }

      // Take dashboard screenshots
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'dashboard_bottom');

      console.log('\n=== DOCUMENT VERIFICATION ===');
      console.log(`Found ${docs.length} documents total`);

      // ========================== DOCUMENT VERIFICATION ==========================
      const results = [];

      for (const doc of docs) {
        const name = doc.name || 'unknown';
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const s3Key = doc.s3Key || '';
        console.log(`\n  --- ${name} ---`);
        console.log(`  S3 Key: ${s3Key}`);

        const result = {
          name,
          s3Key,
          exists: false,
          fileSize: 0,
          sizeOk: false,
          noPlaceholders: null, // null = N/A (PDF)
          keyContentPresent: null, // null = N/A
          issues: [],
        };

        if (!s3Key) {
          result.issues.push('No S3 key');
          results.push(result);
          continue;
        }

        // Check if file exists on S3 and get size
        try {
          const headResult = execSync(
            `aws s3api head-object --bucket avenida-legal-documents --key "${s3Key}" --profile llc-admin --region us-west-1 2>&1`,
            { encoding: 'utf8', timeout: 15000 }
          );
          const sizeMatch = headResult.match(/"ContentLength":\s*(\d+)/);
          result.fileSize = sizeMatch ? parseInt(sizeMatch[1]) : 0;
          result.exists = true;
          result.sizeOk = result.fileSize > 1024;
          console.log(`  Exists: YES (${result.fileSize} bytes)`);
        } catch (e) {
          // Try with aws s3 ls as fallback
          try {
            const lsResult = execSync(
              `aws s3 ls "s3://avenida-legal-documents/${s3Key}" --profile llc-admin --region us-west-1 2>&1`,
              { encoding: 'utf8', timeout: 15000 }
            );
            const sizeMatch = lsResult.match(/\s+(\d+)\s+/);
            result.fileSize = sizeMatch ? parseInt(sizeMatch[1]) : 0;
            result.exists = lsResult.trim().length > 0;
            result.sizeOk = result.fileSize > 1024;
            console.log(`  Exists: ${result.exists ? 'YES' : 'NO'} (${result.fileSize} bytes)`);
          } catch (e2) {
            result.issues.push('S3 access error: ' + (e2.message || '').substring(0, 80));
            console.log(`  Exists: ERROR`);
          }
        }

        // For .docx files, download and verify content
        if (s3Key.endsWith('.docx') && result.exists) {
          const localPath = join(DIR, safeName + '.docx');
          try {
            execSync(
              `aws s3 cp "s3://avenida-legal-documents/${s3Key}" "${localPath}" --profile llc-admin --region us-west-1`,
              { encoding: 'utf8', timeout: 30000 }
            );
            console.log(`  Downloaded to: ${localPath}`);

            // Extract text using PizZip (inline, no external dependency)
            // We'll use node:zlib to extract the DOCX XML
            const { inflateRawSync } = await import('zlib');
            const docxBuf = readFileSync(localPath);

            // Parse ZIP manually to find word/document.xml
            let xmlContent = '';
            let pos = 0;
            while (pos < docxBuf.length - 4) {
              // Look for local file header signature
              if (docxBuf[pos] === 0x50 && docxBuf[pos + 1] === 0x4B && docxBuf[pos + 2] === 0x03 && docxBuf[pos + 3] === 0x04) {
                const fnLen = docxBuf.readUInt16LE(pos + 26);
                const extraLen = docxBuf.readUInt16LE(pos + 28);
                const comprMethod = docxBuf.readUInt16LE(pos + 8);
                const compSize = docxBuf.readUInt32LE(pos + 18);
                const fileName = docxBuf.subarray(pos + 30, pos + 30 + fnLen).toString('utf8');
                const dataStart = pos + 30 + fnLen + extraLen;

                if (fileName === 'word/document.xml') {
                  const compData = docxBuf.subarray(dataStart, dataStart + compSize);
                  if (comprMethod === 8) {
                    xmlContent = inflateRawSync(compData).toString('utf8');
                  } else {
                    xmlContent = compData.toString('utf8');
                  }
                  break;
                }
                pos = dataStart + compSize;
              } else {
                pos++;
              }
            }

            if (xmlContent) {
              // Strip XML tags to get text content
              const textContent = xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

              // Check for unreplaced {{placeholders}}
              const placeholderMatches = textContent.match(/\{\{[^}]+\}\}/g) || [];
              if (placeholderMatches.length > 0) {
                result.noPlaceholders = false;
                result.issues.push('Unreplaced placeholders: ' + placeholderMatches.join(', '));
                console.log(`  Placeholders: FAIL (${placeholderMatches.length} found)`);
                console.log(`    ${placeholderMatches.join(', ')}`);
              } else {
                result.noPlaceholders = true;
                console.log(`  Placeholders: PASS (none found)`);
              }

              // Check for key content
              const checks = [];
              // Company name
              if (textContent.includes('PLAYWRIGHT QA LLC') || textContent.includes('Playwright QA LLC') || textContent.includes('PLAYWRIGHT QA')) {
                checks.push('company_name');
              }
              // Owner names
              if (textContent.includes('Maria Garcia') || textContent.includes('MARIA GARCIA')) checks.push('owner1');
              if (textContent.includes('Carlos Lopez') || textContent.includes('CARLOS LOPEZ')) checks.push('owner2');
              if (textContent.includes('Ana Martinez') || textContent.includes('ANA MARTINEZ')) checks.push('owner3');
              // Percentages
              if (textContent.includes('40') && textContent.includes('35') && textContent.includes('25')) checks.push('percentages');

              result.keyContentPresent = checks.length >= 3; // At least company name + 2 owners
              console.log(`  Key content: ${result.keyContentPresent ? 'PASS' : 'FAIL'} (found: ${checks.join(', ')})`);
              if (!result.keyContentPresent) {
                result.issues.push('Missing key content. Found: ' + checks.join(', '));
              }
            } else {
              result.issues.push('Could not extract XML from DOCX');
              console.log(`  Content extraction: FAILED`);
            }
          } catch (e) {
            result.issues.push('Download/parse error: ' + (e.message || '').substring(0, 100));
            console.log(`  Download: ERROR - ${(e.message || '').substring(0, 80)}`);
          }
        } else if (s3Key.endsWith('.pdf') && result.exists) {
          // PDF files: just verify existence and size
          result.noPlaceholders = null; // N/A
          result.keyContentPresent = null; // N/A
          console.log(`  PDF file - verified existence and size only`);
        }

        results.push(result);
      }

      // ========================== SUMMARY TABLE ==========================
      console.log('\n\n========================================');
      console.log('  DOCUMENT VERIFICATION SUMMARY');
      console.log('========================================');
      console.log(
        padRight('Document', 40) +
        padRight('Exists', 10) +
        padRight('Size', 12) +
        padRight('Size OK', 10) +
        padRight('No {{}}', 10) +
        padRight('Content', 10) +
        'Issues'
      );
      console.log('-'.repeat(110));

      let allPass = true;
      for (const r of results) {
        const existsStr = r.exists ? 'PASS' : 'FAIL';
        const sizeStr = r.fileSize > 0 ? `${(r.fileSize / 1024).toFixed(1)}KB` : '0';
        const sizeOkStr = r.sizeOk ? 'PASS' : 'FAIL';
        const placeholderStr = r.noPlaceholders === null ? 'N/A' : (r.noPlaceholders ? 'PASS' : 'FAIL');
        const contentStr = r.keyContentPresent === null ? 'N/A' : (r.keyContentPresent ? 'PASS' : 'FAIL');
        const issuesStr = r.issues.length > 0 ? r.issues.join('; ') : '-';

        console.log(
          padRight(r.name.substring(0, 38), 40) +
          padRight(existsStr, 10) +
          padRight(sizeStr, 12) +
          padRight(sizeOkStr, 10) +
          padRight(placeholderStr, 10) +
          padRight(contentStr, 10) +
          issuesStr
        );

        if (!r.exists || !r.sizeOk) allPass = false;
        if (r.noPlaceholders === false) allPass = false;
        if (r.keyContentPresent === false) allPass = false;
      }

      console.log('-'.repeat(110));
      console.log(`\nOVERALL: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);

      // Save results as JSON
      const summaryPath = join(DIR, 'verification_results.json');
      writeFileSync(summaryPath, JSON.stringify({ email: EMAIL, timestamp: TIMESTAMP, results }, null, 2));
      console.log(`\nResults saved to: ${summaryPath}`);

    } else {
      console.log('  NOT on Stripe. URL: ' + stripeUrl);
      await shot(page, 'not_stripe');
    }

    console.log('\n=== COMPLETE ===');
    console.log('Screenshots: ' + DIR);
    console.log('Total screenshots: ' + shotN);

  } catch (e) {
    console.error('FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'fatal_error').catch(() => {});
  } finally {
    await browser.close();
  }
}

function padRight(str, len) {
  return (str + ' '.repeat(len)).substring(0, len);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
