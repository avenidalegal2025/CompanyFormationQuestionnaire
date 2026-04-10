/**
 * E2E Verification: Confirm recent bug fixes in LLC formation.
 *
 * Company: VERIFY FIX LLC (LLC, Florida, LLC suffix)
 * Owners: Alberto Primero (50%), Beatriz Segunda (30%), Carmen Tercera (20%)
 * All owners are managers
 * Agreement: Yes (via "Lo quiero" button)
 *   - Majority threshold: 50.01%
 *   - Supermajority threshold: 75%
 *   - Capital contributions: $50K / $30K / $20K
 *   - All managing members
 *   - New members admission: Supermayoria
 *   - Additional contributions: Pro-Rata
 *   - Member loans: No
 *   - Sale of company: Decision Unanime
 *   - Tax Partner: Alberto Primero
 *   - Non-compete: No
 *   - Bank signees: Un firmante
 *   - Major decisions: Mayoria
 *   - Minor decisions: Decision Unanime
 *   - ROFR: Yes (180 days)
 *   - Death/incapacity: No (successor retains)
 *   - Transfer to relatives: Free
 *   - New partners admission: Supermayoria
 *   - Dissolution: Decision Unanime
 *   - Divorce buyout: No
 *   - Tag/drag along: No
 *
 * VERIFICATION TARGETS:
 *   1. Operating Agreement includes ALL 3 members
 *   2. No double "LLC" in company name
 *   3. Org Resolution has no unreplaced {{placeholders}}
 *   4. All documents generated correctly
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-verify-fix');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+verify_fix_${TIMESTAMP}@gmail.com`;
const PASSWORD = 'TestPass123!';

// Company details
const COMPANY_NAME_BASE = 'VERIFY FIX';
const COMPANY_NAME_FULL = 'VERIFY FIX LLC';
const OWNERS = [
  { first: 'Alberto', last: 'Primero', full: 'Alberto Primero', ownership: '50', capital: '50000' },
  { first: 'Beatriz', last: 'Segunda', full: 'Beatriz Segunda', ownership: '30', capital: '30000' },
  { first: 'Carmen',  last: 'Tercera', full: 'Carmen Tercera',  ownership: '20', capital: '20000' },
];

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

  // Fill company name (base only, without suffix)
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(COMPANY_NAME_BASE);
  console.log('  Filled name: ' + COMPANY_NAME_BASE);
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

  for (let i = 0; i < OWNERS.length; i++) {
    const o = OWNERS[i];
    const fn = page.locator(`input[name="owners.${i}.firstName"]`);
    if (await fn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fn.fill(o.first);
      await page.locator(`input[name="owners.${i}.lastName"]`).fill(o.last);
    } else {
      await page.locator(`input[name="owners.${i}.fullName"]`).fill(o.full).catch(() => {});
    }
    await page.locator(`input[name="owners.${i}.ownership"]`).fill(o.ownership).catch(() => {});
    console.log(`  Owner ${i + 1}: ${o.full} ${o.ownership}%`);
  }

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

/** Extract text from DOCX using built-in zlib */
async function extractDocxText(filePath) {
  const { inflateRawSync } = await import('zlib');
  const docxBuf = readFileSync(filePath);
  let xmlContent = '';
  let pos = 0;
  while (pos < docxBuf.length - 4) {
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
  if (!xmlContent) return null;
  return xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

async function main() {
  console.log('=== E2E VERIFY FIX: LLC with 3 Owners ===');
  console.log('Dir: ' + DIR);
  console.log('Email: ' + EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
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

    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

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

    await clickToggle(page, 'All owners are managers', 'Sí');
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

    // LLC capital contributions
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `agreement.llc_capitalContributions_${i}`, OWNERS[i].capital);
    }
    console.log(`  Set capital: ${OWNERS.map(o => '$' + Number(o.capital).toLocaleString()).join(' / ')}`);

    // All members are managing members
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes (all)');

    // Specific roles: No (default)
    await clickToggle(page, 'Has specific roles', 'No');
    console.log('  Specific roles: No');

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

    // Additional contributions: Pro-Rata
    await clickToggle(page, 'Additional contributions process', 'Sí, Pro-Rata');

    // Member loans: No
    await clickToggle(page, 'Member loans', 'No');
    console.log('  Member loans: No');

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

    // Tax Partner: Alberto Primero
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Alberto Primero")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Alberto Primero' });
      console.log('  Tax Partner: Alberto Primero');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Alberto Primero');
      console.log('  Tax Partner (via fiber): Alberto Primero');
    }

    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    // Bank signees: Un firmante
    await clickToggle(page, 'Bank signers', 'Un firmante');

    // Major decisions: Mayoria
    await clickToggle(page, 'LLC major decisions', 'Mayoría');

    // Minor decisions: Decision Unanime
    await clickToggle(page, 'LLC minor decisions', 'Unánime');

    // Non-solicitation: should be visible since non-compete is No
    // Keep default (Yes)
    console.log('  Non-solicitation: visible (non-compete is No)');

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

    // Death/incapacity: No
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

    // Divorce buyout: No
    await clickToggle(page, 'LLC divorce buyout', 'No');
    console.log('  Divorce buyout: No');

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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Alberto Primero').catch(() => {});
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

      // Poll for documents (up to 3 minutes, every 10s)
      let docs = [];
      const maxPolls = 18;
      for (let poll = 0; poll < maxPolls; poll++) {
        console.log(`  Polling dashboard (${poll + 1}/${maxPolls})...`);

        if (poll === 0) {
          console.log('  Waiting 60s for document generation...');
          await page.waitForTimeout(60000);
        } else {
          await page.waitForTimeout(10000);
        }

        await page.goto(BASE_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 60000 });
        await waitForStable(page, 5000);

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

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'dashboard_bottom');

      console.log('\n=== DOCUMENT VERIFICATION ===');
      console.log(`Found ${docs.length} documents total`);

      // ========================== DOCUMENT VERIFICATION ==========================
      const results = [];
      const verificationChecks = [];

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
          noPlaceholders: null,
          keyContentPresent: null,
          noDoubleLLC: null,
          allOwnersPresent: null,
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

            const textContent = await extractDocxText(localPath);

            if (textContent) {
              // Save extracted text for debugging
              writeFileSync(join(DIR, safeName + '_text.txt'), textContent);

              // === CHECK 1: Unreplaced {{placeholders}} ===
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

              // === CHECK 2: No double "LLC LLC" ===
              const doubleLLC = textContent.match(/LLC\s+LLC/gi);
              if (doubleLLC) {
                result.noDoubleLLC = false;
                result.issues.push('DOUBLE LLC found: "' + doubleLLC[0] + '"');
                console.log(`  Double LLC: FAIL`);
              } else {
                result.noDoubleLLC = true;
                console.log(`  Double LLC: PASS (not found)`);
              }

              // === CHECK 3: All owner names present ===
              const ownerChecks = [];
              for (const o of OWNERS) {
                const found = textContent.includes(o.full) || textContent.toUpperCase().includes(o.full.toUpperCase());
                ownerChecks.push({ name: o.full, found });
                if (!found) {
                  result.issues.push(`Missing owner: ${o.full}`);
                }
              }
              result.allOwnersPresent = ownerChecks.every(c => c.found);
              console.log(`  All owners: ${result.allOwnersPresent ? 'PASS' : 'FAIL'} (${ownerChecks.map(c => c.name + ':' + (c.found ? 'Y' : 'N')).join(', ')})`);

              // === CHECK 4: Company name ===
              const hasCompanyName = textContent.includes(COMPANY_NAME_FULL) || textContent.toUpperCase().includes(COMPANY_NAME_FULL);
              if (hasCompanyName) {
                console.log(`  Company name "${COMPANY_NAME_FULL}": PASS`);
              } else {
                result.issues.push(`Company name "${COMPANY_NAME_FULL}" not found`);
                console.log(`  Company name "${COMPANY_NAME_FULL}": FAIL`);
              }

              // === SPECIAL: Operating Agreement deep checks ===
              const isAgreement = name.toLowerCase().includes('agreement') ||
                                  name.toLowerCase().includes('operating') ||
                                  name.toLowerCase().includes('acuerdo');
              if (isAgreement) {
                console.log('  [AGREEMENT DEEP CHECK]');

                // Check capital contributions for each owner
                for (const o of OWNERS) {
                  const capitalStr = '$' + Number(o.capital).toLocaleString();
                  const capitalStrAlt = Number(o.capital).toLocaleString();
                  const hasCapital = textContent.includes(capitalStr) || textContent.includes(capitalStrAlt) || textContent.includes(o.capital);
                  console.log(`    Capital ${o.full} (${capitalStr}): ${hasCapital ? 'PASS' : 'FAIL'}`);
                  if (!hasCapital) {
                    result.issues.push(`Agreement: ${o.full} capital contribution not found`);
                  }
                  verificationChecks.push({
                    check: `Agreement: ${o.full} capital contribution`,
                    pass: hasCapital,
                  });
                }

                // Check MPI (Member Percentage Interest) section
                for (const o of OWNERS) {
                  const pctStr = o.ownership + '%';
                  const hasPct = textContent.includes(pctStr) || textContent.includes(o.ownership);
                  console.log(`    MPI ${o.full} (${pctStr}): ${hasPct ? 'PASS' : 'FAIL'}`);
                  verificationChecks.push({
                    check: `Agreement: ${o.full} MPI/percentage`,
                    pass: hasPct,
                  });
                }

                // Check signature block: all 3 names should appear near "signature" or at end
                const lowerText = textContent.toLowerCase();
                const lastSection = lowerText.substring(Math.max(0, lowerText.length - 3000));
                for (const o of OWNERS) {
                  const inSig = lastSection.includes(o.full.toLowerCase());
                  console.log(`    Signature block ${o.full}: ${inSig ? 'PASS' : 'FAIL'}`);
                  if (!inSig) {
                    result.issues.push(`Agreement: ${o.full} not found in signature block (last 3000 chars)`);
                  }
                  verificationChecks.push({
                    check: `Agreement: ${o.full} in signature block`,
                    pass: inSig,
                  });
                }
              }

              // Key content check for all docs
              const checks = [];
              if (textContent.includes(COMPANY_NAME_FULL) || textContent.toUpperCase().includes(COMPANY_NAME_FULL)) checks.push('company_name');
              for (let i = 0; i < OWNERS.length; i++) {
                const o = OWNERS[i];
                if (textContent.includes(o.full) || textContent.toUpperCase().includes(o.full.toUpperCase())) checks.push(`owner${i + 1}`);
              }
              result.keyContentPresent = checks.length >= 2;
              console.log(`  Key content: ${result.keyContentPresent ? 'PASS' : 'FAIL'} (found: ${checks.join(', ')})`);

            } else {
              result.issues.push('Could not extract XML from DOCX');
              console.log(`  Content extraction: FAILED`);
            }
          } catch (e) {
            result.issues.push('Download/parse error: ' + (e.message || '').substring(0, 100));
            console.log(`  Download: ERROR - ${(e.message || '').substring(0, 80)}`);
          }
        } else if (s3Key.endsWith('.pdf') && result.exists) {
          result.noPlaceholders = null;
          result.keyContentPresent = null;
          console.log(`  PDF file - verified existence and size only`);
        }

        results.push(result);
      }

      // ========================== VERIFICATION SUMMARY ==========================
      console.log('\n\n' + '='.repeat(100));
      console.log('  BUG FIX VERIFICATION SUMMARY');
      console.log('='.repeat(100));

      // Top-level bug fix checks
      const bugChecks = [
        {
          name: 'BUG FIX #1: No double "LLC" in company name',
          pass: results.every(r => r.noDoubleLLC === null || r.noDoubleLLC === true),
        },
        {
          name: 'BUG FIX #2: All 3 owners in Operating Agreement',
          pass: results.some(r => {
            const isAgr = (r.name || '').toLowerCase().includes('agreement') ||
                          (r.name || '').toLowerCase().includes('operating') ||
                          (r.name || '').toLowerCase().includes('acuerdo');
            return isAgr && r.allOwnersPresent === true;
          }),
        },
        {
          name: 'BUG FIX #3: No unreplaced {{placeholders}} in any doc',
          pass: results.every(r => r.noPlaceholders === null || r.noPlaceholders === true),
        },
        {
          name: 'BUG FIX #4: All documents generated and > 1KB',
          pass: results.length > 0 && results.every(r => r.exists && r.sizeOk),
        },
      ];

      console.log('\n--- BUG FIX CHECKS ---');
      for (const bc of bugChecks) {
        console.log(`  ${bc.pass ? 'PASS' : 'FAIL'}  ${bc.name}`);
      }

      if (verificationChecks.length > 0) {
        console.log('\n--- AGREEMENT DEEP CHECKS ---');
        for (const vc of verificationChecks) {
          console.log(`  ${vc.pass ? 'PASS' : 'FAIL'}  ${vc.check}`);
        }
      }

      // Document table
      console.log('\n--- DOCUMENT TABLE ---');
      console.log(
        padRight('Document', 42) +
        padRight('Exists', 8) +
        padRight('Size', 10) +
        padRight('No {{}}', 9) +
        padRight('No 2xLLC', 10) +
        padRight('Owners', 9) +
        'Issues'
      );
      console.log('-'.repeat(120));

      let allPass = true;
      for (const r of results) {
        const existsStr = r.exists ? 'PASS' : 'FAIL';
        const sizeStr = r.fileSize > 0 ? `${(r.fileSize / 1024).toFixed(1)}KB` : '0';
        const placeholderStr = r.noPlaceholders === null ? 'N/A' : (r.noPlaceholders ? 'PASS' : 'FAIL');
        const dblLLCStr = r.noDoubleLLC === null ? 'N/A' : (r.noDoubleLLC ? 'PASS' : 'FAIL');
        const ownersStr = r.allOwnersPresent === null ? 'N/A' : (r.allOwnersPresent ? 'PASS' : 'FAIL');
        const issuesStr = r.issues.length > 0 ? r.issues.join('; ') : '-';

        console.log(
          padRight((r.name || '').substring(0, 40), 42) +
          padRight(existsStr, 8) +
          padRight(sizeStr, 10) +
          padRight(placeholderStr, 9) +
          padRight(dblLLCStr, 10) +
          padRight(ownersStr, 9) +
          issuesStr
        );

        if (!r.exists || !r.sizeOk) allPass = false;
        if (r.noPlaceholders === false) allPass = false;
        if (r.noDoubleLLC === false) allPass = false;
        if (r.allOwnersPresent === false) allPass = false;
      }

      console.log('-'.repeat(120));

      const overallPass = allPass && bugChecks.every(bc => bc.pass) && verificationChecks.every(vc => vc.pass);
      console.log(`\nOVERALL: ${overallPass ? 'ALL PASS' : 'SOME FAILURES'}`);

      // Save results as JSON
      const summaryPath = join(DIR, 'verification_results.json');
      writeFileSync(summaryPath, JSON.stringify({
        email: EMAIL,
        timestamp: TIMESTAMP,
        company: COMPANY_NAME_FULL,
        owners: OWNERS.map(o => o.full),
        bugChecks,
        verificationChecks,
        results,
        overall: overallPass ? 'PASS' : 'FAIL',
      }, null, 2));
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
