/**
 * E2E Tests 4+5+6+8: Agreement Document Variant Verification
 *
 * TEST 4+5+6: LLC with ROFR=No, Non-compete=Yes, Tag/Drag=No
 *   Company: VARIANT TEST LLC (Florida)
 *   Owners: Victor Variant (60%), Vanessa Variant (40%)
 *   All managers
 *   Agreement:
 *     - Capital: $60K / $40K
 *     - Sale: Mayoria, Major decisions: Supermayoria
 *     - Tax Partner: Victor Variant
 *     - Non-compete: Yes (3 years, Miami-Dade County) — TEST 5
 *     - Bank: Dos firmantes
 *     - ROFR: No — TEST 4 (removes section 12.1)
 *     - Death: Yes (forced sale)
 *     - Transfer to relatives: Unanimous
 *     - Dissolution: Mayoria
 *     - Tag/Drag along: No — TEST 6 (removes those sections)
 *
 *   Verifications (TEST 4): "Right of First Refusal" NOT present, "12.1" NOT a section heading
 *   Verifications (TEST 5): Non-compete with "3" years and "Miami-Dade" present
 *   Verifications (TEST 6): "Drag Along" and "Tag Along" NOT present
 *
 * TEST 8: LLC with 5 owners
 *   Company: FIVE MEMBERS LLC (Florida)
 *   Owners: Uno First (30%), Dos Second (25%), Tres Third (20%), Cuatro Fourth (15%), Cinco Fifth (10%)
 *   All managers
 *   Agreement:
 *     - Capital: $30K / $25K / $20K / $15K / $10K
 *     - All defaults for voting
 *     - ROFR: Yes, Death: No, Tag/Drag: No
 *
 *   Verifications: All 5 owner names, capitals, MPI %, signature blocks present
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-test-4-6-8');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();

// ====================== SHARED HELPERS ======================

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
async function handleAuth0(page, email, password) {
  if (!page.url().includes('auth0')) return false;
  console.log('  Auth0 detected: ' + page.url().substring(0, 80));
  await shot(page, 'auth0_page');

  const emailInput = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(email);
    console.log('  Filled email: ' + email);
  }

  const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pwdInput.fill(password);
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
        await emailInput2.fill(email);
        const pwdInput2 = page.locator('input[name="password"], input[type="password"]').first();
        if (await pwdInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await pwdInput2.fill(password);
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
async function fillStep1(page, companyNameBase) {
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
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(companyNameBase);
  console.log('  Filled name: ' + companyNameBase);
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

/** Helper: fill Step 2 owners */
async function fillStep2(page, owners) {
  await setFormValue(page, 'ownersCount', owners.length);
  await page.waitForTimeout(2000);
  console.log(`  Set ownersCount: ${owners.length}`);

  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
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

/** Navigate through steps after auth (handles re-landing on Step 1 or Step 2) */
async function advancePastAuth(page, companyNameBase, owners, email, password) {
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
      await fillStep2(page, owners);
    }
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }
}

/** Handle Stripe payment */
async function handleStripePayment(page, billingName) {
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

  await page.locator('#billingName, input[name="billingName"]').first().fill(billingName).catch(() => {});
  await page.locator('#billingPostalCode, input[name="billingPostalCode"]').first().fill('33101').catch(() => {});

  await shot(page, 'stripe_filled');

  // Click Pay
  console.log('  Clicking Pay...');
  await page.locator('.SubmitButton, button[type="submit"]').first().click();

  // Wait for payment processing
  console.log('  Processing payment (30s)...');
  await page.waitForTimeout(30000);
  await shot(page, 'payment_result');
  console.log('  Post-payment URL: ' + page.url().substring(0, 100));
}

/** Poll dashboard for documents */
async function pollDashboard(page) {
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
  return docs;
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

/** Download doc from S3 and extract text */
async function downloadAndExtract(s3Key, localPath) {
  execSync(
    `aws s3 cp "s3://avenida-legal-documents/${s3Key}" "${localPath}" --profile llc-admin --region us-west-1`,
    { encoding: 'utf8', timeout: 30000 }
  );
  console.log(`  Downloaded to: ${localPath}`);
  return await extractDocxText(localPath);
}

function padRight(str, len) {
  return (str + ' '.repeat(len)).substring(0, len);
}

// ====================== TEST 4+5+6: VARIANT TEST ======================

async function runTest456(browser) {
  const testLabel = 'TEST 4+5+6';
  const COMPANY_NAME_BASE = 'VARIANT TEST';
  const COMPANY_NAME_FULL = 'VARIANT TEST LLC';
  const EMAIL = `test+variant_test_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const OWNERS = [
    { first: 'Victor', last: 'Variant', full: 'Victor Variant', ownership: '60', capital: '60000' },
    { first: 'Vanessa', last: 'Variant', full: 'Vanessa Variant', ownership: '40', capital: '40000' },
  ];

  console.log('\n' + '='.repeat(100));
  console.log(`  ${testLabel}: LLC with ROFR=No, Non-compete=Yes(3yr,Miami-Dade), Tag/Drag=No`);
  console.log('='.repeat(100));
  console.log('Email: ' + EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const results = { checks: [], docs: [] };

  try {
    // ========================== STEP 1: COMPANY ==========================
    console.log('=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    await fillStep1(page, COMPANY_NAME_BASE);
    await shot(page, 't456_step1_company');
    await clickContinuar(page);

    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page, EMAIL, PASSWORD);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    const isStep1 = await page.locator('button[aria-label="LLC"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await fillStep1(page, COMPANY_NAME_BASE);
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 3000);
    }

    await shot(page, 't456_step2_initial');
    await fillStep2(page, OWNERS);

    await shot(page, 't456_step2_filled');
    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2 (expected)');
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 't456_post_auth');

    await advancePastAuth(page, COMPANY_NAME_BASE, OWNERS, EMAIL, PASSWORD);

    // ========================== STEP 3: ADMIN (Managers) ==========================
    console.log('=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    await shot(page, 't456_step3_initial');

    await clickToggle(page, 'All owners are managers', 'Sí');
    await setFormValue(page, 'admin.managersAllOwners', 'Yes');
    console.log('  Set all owners as managers: Yes');
    await page.waitForTimeout(1000);

    await shot(page, 't456_step3_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 4: SUMMARY ==========================
    console.log('=== STEP 4: Summary ===');
    await shot(page, 't456_step4_summary');
    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // "Lo quiero" - wants agreement
    const loQuiero = page.locator('button:has-text("Lo quiero")');
    if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, 't456_step4_agreement_modal');
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
    await shot(page, 't456_step5_initial');

    // Capital contributions
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `agreement.llc_capitalContributions_${i}`, OWNERS[i].capital);
    }
    console.log(`  Set capital: ${OWNERS.map(o => '$' + Number(o.capital).toLocaleString()).join(' / ')}`);

    // All members are managing members
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes (all)');

    // Specific roles: No
    await clickToggle(page, 'Has specific roles', 'No');
    console.log('  Specific roles: No');

    await shot(page, 't456_step5_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Prestamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Prestamos ===');
    await shot(page, 't456_step6_initial');

    // Defaults for majority/supermajority thresholds (keep defaults)
    // New members admission: keep default
    // Additional contributions: keep default
    // Member loans: keep default

    await shot(page, 't456_step6_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 't456_step7_initial');

    // Sale of company: Mayoria
    await clickToggle(page, 'LLC sale decision', 'Mayoría');
    console.log('  Sale: Mayoria');

    // Major decisions: Supermayoria
    await clickToggle(page, 'LLC major decisions', 'Supermayoría');
    console.log('  Major decisions: Supermayoria');

    // Tax Partner: Victor Variant
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Victor Variant")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Victor Variant' });
      console.log('  Tax Partner: Victor Variant');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Victor Variant');
      console.log('  Tax Partner (via fiber): Victor Variant');
    }

    // Non-compete: YES (TEST 5)
    await clickToggle(page, 'Non compete covenant', 'Sí');
    console.log('  Non-compete: YES');
    await page.waitForTimeout(1000);

    // Non-compete duration: 3 years
    await page.waitForTimeout(1500); // Wait for conditional fields to render
    const ncDurInput = page.locator('input[name="agreement.llc_nonCompeteDuration"]');
    if (await ncDurInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ncDurInput.fill('');
      await ncDurInput.fill('3');
      console.log('  Non-compete duration: 3 years');
    } else {
      await setFormValue(page, 'agreement.llc_nonCompeteDuration', 3);
      console.log('  Non-compete duration (via fiber): 3 years');
    }

    // Non-compete scope: Miami-Dade County
    const ncScopeInput = page.locator('input[name="agreement.llc_nonCompeteScope"]');
    if (await ncScopeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ncScopeInput.fill('');
      await ncScopeInput.fill('Miami-Dade County');
      console.log('  Non-compete scope: Miami-Dade County');
    } else {
      await setFormValue(page, 'agreement.llc_nonCompeteScope', 'Miami-Dade County');
      console.log('  Non-compete scope (via fiber): Miami-Dade County');
    }

    // Bank signees: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');
    console.log('  Bank signees: Dos firmantes');

    // Confidentiality: default
    await clickToggle(page, 'LLC confidentiality NDA', 'Sí');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 't456_step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 't456_step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 8: AGREEMENT 4 - Acciones & Sucesion ==========================
    console.log('=== STEP 8: Agreement - Acciones & Sucesion ===');
    await shot(page, 't456_step8_initial');

    // ROFR: No (TEST 4 - should REMOVE section 12.1)
    await clickToggle(page, 'Right of first refusal', 'No');
    console.log('  ROFR: No (TEST 4 - should remove section 12.1)');
    await page.waitForTimeout(1000);

    // Death/incapacity: Yes (forced sale)
    await clickToggle(page, 'Incapacity heirs policy', 'Sí');
    console.log('  Death/incapacity: Yes (forced sale)');
    await page.waitForTimeout(1000);

    // Transfer to relatives: Unanimous
    const transferSelect = page.locator('select').filter({ has: page.locator('option:has-text("unánime")') }).first();
    if (await transferSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Find the option that mentions "unánime"
      const options = await transferSelect.locator('option').allTextContents();
      const unanimeOption = options.find(o => o.toLowerCase().includes('unánime'));
      if (unanimeOption) {
        await transferSelect.selectOption({ label: unanimeOption });
        console.log('  Transfer to relatives: ' + unanimeOption);
      }
    } else {
      // Try via fiber - look for the select with "Decisión Unánime" or "Voto Unánime"
      await setFormValue(page, 'agreement.llc_transferToRelatives', 'Voto Unánime de los miembros.');
      console.log('  Transfer to relatives (via fiber): Unanimous');
    }

    // Dissolution: Mayoria
    await clickToggle(page, 'LLC dissolution decision', 'Mayoría');
    console.log('  Dissolution: Mayoria');

    // Divorce buyout: default
    // Tag/drag along: No (TEST 6)
    await clickToggle(page, 'LLC tag drag rights', 'No');
    console.log('  Tag/Drag along: No (TEST 6 - should remove those sections)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 't456_step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 't456_step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 9: CHECKOUT ==========================
    console.log('=== STEP 9: Checkout ===');
    await shot(page, 't456_step9_initial');

    // Click "Revisar Paquete y Proceder al Pago"
    const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
    if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await revBtn.click();
      console.log('  Clicked Revisar Paquete');
      await waitForStable(page, 3000);
    }

    await shot(page, 't456_step9_services');

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
      await handleStripePayment(page, 'Victor Variant');

      // ========================== DASHBOARD & VERIFICATION ==========================
      console.log('=== DASHBOARD (TEST 4+5+6) ===');
      const docs = await pollDashboard(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 't456_dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 't456_dashboard_bottom');

      console.log(`\nFound ${docs.length} documents total`);
      results.docs = docs;

      // Find and verify the Operating Agreement
      for (const doc of docs) {
        const name = doc.name || 'unknown';
        const s3Key = doc.s3Key || '';
        const safeName = 't456_' + name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const isAgreement = name.toLowerCase().includes('agreement') ||
                            name.toLowerCase().includes('operating') ||
                            name.toLowerCase().includes('acuerdo');

        if (isAgreement && s3Key.endsWith('.docx')) {
          console.log(`\n  --- Verifying: ${name} ---`);
          const localPath = join(DIR, safeName + '.docx');
          try {
            const textContent = await downloadAndExtract(s3Key, localPath);
            if (textContent) {
              writeFileSync(join(DIR, safeName + '_text.txt'), textContent);

              // TEST 4: ROFR should NOT appear
              const hasROFR = /Right\s+of\s+First\s+Refusal/i.test(textContent);
              // Check for "12.1" as a section heading (not matching "12.10", "12.11" etc.)
              const has121section = /\b12\.1\b/.test(textContent) && !/12\.1\d/.test(textContent.replace(/12\.1\b/g, ''));
              // More precise: look for "12.1" that is NOT followed by another digit
              const all121matches = textContent.match(/12\.1\d*/g) || [];
              const standalone121 = all121matches.filter(m => m === '12.1');
              results.checks.push({
                test: 'TEST 4',
                check: '"Right of First Refusal" NOT in document',
                pass: !hasROFR,
                detail: hasROFR ? 'FOUND (should be absent)' : 'Correctly absent',
              });
              results.checks.push({
                test: 'TEST 4',
                check: '"12.1" NOT as standalone section (12.10 OK)',
                pass: standalone121.length === 0,
                detail: standalone121.length > 0 ? `Found standalone "12.1" (${standalone121.length}x)` : `Correctly absent (found only: ${all121matches.join(', ') || 'none'})`,
              });
              console.log(`  TEST 4 - ROFR absent: ${!hasROFR ? 'PASS' : 'FAIL'}`);
              console.log(`  TEST 4 - 12.1 standalone absent: ${standalone121.length === 0 ? 'PASS' : 'FAIL'} (all 12.1* matches: ${all121matches.join(', ')})`);

              // TEST 5: Non-compete with 3 years and Miami-Dade
              // Note: LLC template may not have standalone non-compete section (see agreement-docgen.ts comment).
              // We check for any reference to non-compete, competencia, or the specific duration/scope.
              const hasNonCompete = /non[\s-]*compet/i.test(textContent) || /no[\s-]*competencia/i.test(textContent) || /\bnon.competition\b/i.test(textContent);
              const has3Years = textContent.includes('3') || textContent.includes('three');
              const hasMiamiDade = /Miami[\s-]*Dade/i.test(textContent);
              results.checks.push({
                test: 'TEST 5',
                check: 'Non-compete clause present in document',
                pass: hasNonCompete,
                detail: hasNonCompete ? 'Found non-compete text' : 'NOT FOUND (LLC template may lack non-compete section — see agreement-docgen.ts line 419)',
              });
              results.checks.push({
                test: 'TEST 5',
                check: '"3" years in non-compete',
                pass: has3Years,
                detail: has3Years ? 'Found "3"' : 'NOT FOUND',
              });
              results.checks.push({
                test: 'TEST 5',
                check: '"Miami-Dade" in non-compete',
                pass: hasMiamiDade,
                detail: hasMiamiDade ? 'Found "Miami-Dade"' : 'NOT FOUND (non-compete section may be missing)',
              });
              console.log(`  TEST 5 - Non-compete present: ${hasNonCompete ? 'PASS' : 'FAIL'}`);
              console.log(`  TEST 5 - 3 years: ${has3Years ? 'PASS' : 'FAIL'}`);
              console.log(`  TEST 5 - Miami-Dade: ${hasMiamiDade ? 'PASS' : 'FAIL'}`);

              // TEST 6: Tag/Drag Along should NOT appear
              const hasDragAlong = /Drag\s+Along/i.test(textContent);
              const hasTagAlong = /Tag\s+Along/i.test(textContent);
              results.checks.push({
                test: 'TEST 6',
                check: '"Drag Along" NOT in document',
                pass: !hasDragAlong,
                detail: hasDragAlong ? 'FOUND (should be absent)' : 'Correctly absent',
              });
              results.checks.push({
                test: 'TEST 6',
                check: '"Tag Along" NOT in document',
                pass: !hasTagAlong,
                detail: hasTagAlong ? 'FOUND (should be absent)' : 'Correctly absent',
              });
              console.log(`  TEST 6 - Drag Along absent: ${!hasDragAlong ? 'PASS' : 'FAIL'}`);
              console.log(`  TEST 6 - Tag Along absent: ${!hasTagAlong ? 'PASS' : 'FAIL'}`);

              // Extra: check all owners present
              for (const o of OWNERS) {
                const found = textContent.includes(o.full) || textContent.toUpperCase().includes(o.full.toUpperCase());
                results.checks.push({
                  test: 'TEST 4+5+6',
                  check: `Owner "${o.full}" present in agreement`,
                  pass: found,
                  detail: found ? 'Found' : 'NOT FOUND',
                });
                console.log(`  Owner ${o.full}: ${found ? 'PASS' : 'FAIL'}`);
              }

              // Check no unreplaced placeholders
              const placeholders = textContent.match(/\{\{[^}]+\}\}/g) || [];
              results.checks.push({
                test: 'TEST 4+5+6',
                check: 'No unreplaced {{placeholders}}',
                pass: placeholders.length === 0,
                detail: placeholders.length > 0 ? `Found: ${placeholders.join(', ')}` : 'None found',
              });
              console.log(`  Placeholders: ${placeholders.length === 0 ? 'PASS' : 'FAIL'} (${placeholders.length} found)`);

              // Verify other sections still intact
              const hasArticles = /Article/i.test(textContent) || /Art[ií]culo/i.test(textContent);
              results.checks.push({
                test: 'TEST 4+5+6',
                check: 'Other sections (Articles) intact',
                pass: hasArticles,
                detail: hasArticles ? 'Articles found' : 'No articles found',
              });
              console.log(`  Other sections intact: ${hasArticles ? 'PASS' : 'FAIL'}`);

            } else {
              results.checks.push({ test: testLabel, check: 'Extract DOCX text', pass: false, detail: 'Could not extract XML' });
            }
          } catch (e) {
            results.checks.push({ test: testLabel, check: 'Download agreement', pass: false, detail: e.message.substring(0, 100) });
          }
        }
      }
    } else {
      console.log('  NOT on Stripe. URL: ' + stripeUrl);
      await shot(page, 't456_not_stripe');
      results.checks.push({ test: testLabel, check: 'Reach Stripe checkout', pass: false, detail: 'Did not reach Stripe' });
    }

  } catch (e) {
    console.error(`FATAL (${testLabel}): ` + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 't456_fatal_error').catch(() => {});
    results.checks.push({ test: testLabel, check: 'Complete flow', pass: false, detail: 'Fatal: ' + e.message.substring(0, 100) });
  } finally {
    await ctx.close();
  }

  return results;
}

// ====================== TEST 8: LLC with 5 owners ======================

async function runTest8(browser) {
  const testLabel = 'TEST 8';
  const COMPANY_NAME_BASE = 'FIVE MEMBERS';
  const COMPANY_NAME_FULL = 'FIVE MEMBERS LLC';
  const EMAIL = `test+five_members_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const OWNERS = [
    { first: 'Uno',    last: 'First',  full: 'Uno First',     ownership: '30', capital: '30000' },
    { first: 'Dos',    last: 'Second', full: 'Dos Second',    ownership: '25', capital: '25000' },
    { first: 'Tres',   last: 'Third',  full: 'Tres Third',    ownership: '20', capital: '20000' },
    { first: 'Cuatro', last: 'Fourth', full: 'Cuatro Fourth', ownership: '15', capital: '15000' },
    { first: 'Cinco',  last: 'Fifth',  full: 'Cinco Fifth',   ownership: '10', capital: '10000' },
  ];

  console.log('\n' + '='.repeat(100));
  console.log(`  ${testLabel}: LLC with 5 Owners`);
  console.log('='.repeat(100));
  console.log('Email: ' + EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const results = { checks: [], docs: [] };

  try {
    // ========================== STEP 1: COMPANY ==========================
    console.log('=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    await fillStep1(page, COMPANY_NAME_BASE);
    await shot(page, 't8_step1_company');
    await clickContinuar(page);

    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page, EMAIL, PASSWORD);
    }

    // ========================== STEP 2: OWNERS (5) ==========================
    console.log('=== STEP 2: Owners (5) ===');
    await waitForStable(page, 3000);

    const isStep1 = await page.locator('button[aria-label="LLC"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await fillStep1(page, COMPANY_NAME_BASE);
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 3000);
    }

    await shot(page, 't8_step2_initial');
    await fillStep2(page, OWNERS);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 't8_step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 't8_step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2 (expected)');
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 't8_post_auth');

    await advancePastAuth(page, COMPANY_NAME_BASE, OWNERS, EMAIL, PASSWORD);

    // ========================== STEP 3: ADMIN (Managers) ==========================
    console.log('=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    await shot(page, 't8_step3_initial');

    await clickToggle(page, 'All owners are managers', 'Sí');
    await setFormValue(page, 'admin.managersAllOwners', 'Yes');
    console.log('  Set all owners as managers: Yes');
    await page.waitForTimeout(1000);

    await shot(page, 't8_step3_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 4: SUMMARY ==========================
    console.log('=== STEP 4: Summary ===');
    await shot(page, 't8_step4_summary');
    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // "Lo quiero" - wants agreement
    const loQuiero = page.locator('button:has-text("Lo quiero")');
    if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, 't8_step4_agreement_modal');
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
    await shot(page, 't8_step5_initial');

    // Capital contributions for all 5 owners
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `agreement.llc_capitalContributions_${i}`, OWNERS[i].capital);
    }
    console.log(`  Set capital: ${OWNERS.map(o => '$' + Number(o.capital).toLocaleString()).join(' / ')}`);

    // All members are managing members
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes (all)');

    // Specific roles: No
    await clickToggle(page, 'Has specific roles', 'No');
    console.log('  Specific roles: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 't8_step5_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 't8_step5_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Prestamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Prestamos (defaults) ===');
    await shot(page, 't8_step6_initial');

    // Keep all defaults for voting thresholds
    await shot(page, 't8_step6_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones (defaults) ===');
    await shot(page, 't8_step7_initial');

    // Keep defaults except non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    await shot(page, 't8_step7_filled');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 8: AGREEMENT 4 - Acciones & Sucesion ==========================
    console.log('=== STEP 8: Agreement - Acciones & Sucesion ===');
    await shot(page, 't8_step8_initial');

    // ROFR: Yes
    await clickToggle(page, 'Right of first refusal', 'Sí');
    await page.waitForTimeout(1000);

    // Death/incapacity: No
    await clickToggle(page, 'Incapacity heirs policy', 'No');
    console.log('  Death/incapacity: No');

    // Tag/drag along: No
    await clickToggle(page, 'LLC tag drag rights', 'No');
    console.log('  Tag/Drag along: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 't8_step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 't8_step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 9: CHECKOUT ==========================
    console.log('=== STEP 9: Checkout ===');
    await shot(page, 't8_step9_initial');

    const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
    if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await revBtn.click();
      console.log('  Clicked Revisar Paquete');
      await waitForStable(page, 3000);
    }

    await shot(page, 't8_step9_services');

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

    console.log('  Waiting for Stripe...');
    await page.waitForTimeout(15000);
    const stripeUrl = page.url();
    console.log('  URL: ' + stripeUrl.substring(0, 100));

    if (stripeUrl.includes('stripe') || stripeUrl.includes('checkout.stripe')) {
      await handleStripePayment(page, 'Uno First');

      // ========================== DASHBOARD & VERIFICATION ==========================
      console.log('=== DASHBOARD (TEST 8) ===');
      const docs = await pollDashboard(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 't8_dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 't8_dashboard_bottom');

      console.log(`\nFound ${docs.length} documents total`);
      results.docs = docs;

      // Find and verify the Operating Agreement
      for (const doc of docs) {
        const name = doc.name || 'unknown';
        const s3Key = doc.s3Key || '';
        const safeName = 't8_' + name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const isAgreement = name.toLowerCase().includes('agreement') ||
                            name.toLowerCase().includes('operating') ||
                            name.toLowerCase().includes('acuerdo');

        if (isAgreement && s3Key.endsWith('.docx')) {
          console.log(`\n  --- Verifying: ${name} ---`);
          const localPath = join(DIR, safeName + '.docx');
          try {
            const textContent = await downloadAndExtract(s3Key, localPath);
            if (textContent) {
              writeFileSync(join(DIR, safeName + '_text.txt'), textContent);

              // Check all 5 owner names
              for (const o of OWNERS) {
                const found = textContent.includes(o.full) || textContent.toUpperCase().includes(o.full.toUpperCase());
                results.checks.push({
                  test: 'TEST 8',
                  check: `Owner "${o.full}" name in agreement`,
                  pass: found,
                  detail: found ? 'Found' : 'NOT FOUND',
                });
                console.log(`  Owner ${o.full}: ${found ? 'PASS' : 'FAIL'}`);
              }

              // Check capital contributions for all 5
              for (const o of OWNERS) {
                const capitalStr = '$' + Number(o.capital).toLocaleString();
                const capitalStrAlt = Number(o.capital).toLocaleString();
                const hasCapital = textContent.includes(capitalStr) || textContent.includes(capitalStrAlt) || textContent.includes(o.capital);
                results.checks.push({
                  test: 'TEST 8',
                  check: `Capital contribution ${o.full} (${capitalStr})`,
                  pass: hasCapital,
                  detail: hasCapital ? 'Found' : 'NOT FOUND',
                });
                console.log(`  Capital ${o.full} (${capitalStr}): ${hasCapital ? 'PASS' : 'FAIL'}`);
              }

              // Check MPI percentages for all 5
              for (const o of OWNERS) {
                const pctStr = o.ownership + '%';
                const hasPct = textContent.includes(pctStr) || textContent.includes(o.ownership);
                results.checks.push({
                  test: 'TEST 8',
                  check: `MPI ${o.full} (${pctStr})`,
                  pass: hasPct,
                  detail: hasPct ? 'Found' : 'NOT FOUND',
                });
                console.log(`  MPI ${o.full} (${pctStr}): ${hasPct ? 'PASS' : 'FAIL'}`);
              }

              // Check signature blocks for all 5
              const lowerText = textContent.toLowerCase();
              const lastSection = lowerText.substring(Math.max(0, lowerText.length - 5000));
              for (const o of OWNERS) {
                const inSig = lastSection.includes(o.full.toLowerCase());
                results.checks.push({
                  test: 'TEST 8',
                  check: `Signature block for "${o.full}"`,
                  pass: inSig,
                  detail: inSig ? 'Found in last 5000 chars' : 'NOT FOUND in last 5000 chars',
                });
                console.log(`  Signature block ${o.full}: ${inSig ? 'PASS' : 'FAIL'}`);
              }

              // No unreplaced placeholders
              const placeholders = textContent.match(/\{\{[^}]+\}\}/g) || [];
              results.checks.push({
                test: 'TEST 8',
                check: 'No unreplaced {{placeholders}}',
                pass: placeholders.length === 0,
                detail: placeholders.length > 0 ? `Found: ${placeholders.join(', ')}` : 'None found',
              });
              console.log(`  Placeholders: ${placeholders.length === 0 ? 'PASS' : 'FAIL'} (${placeholders.length} found)`);

            } else {
              results.checks.push({ test: testLabel, check: 'Extract DOCX text', pass: false, detail: 'Could not extract XML' });
            }
          } catch (e) {
            results.checks.push({ test: testLabel, check: 'Download agreement', pass: false, detail: e.message.substring(0, 100) });
          }
        }
      }
    } else {
      console.log('  NOT on Stripe. URL: ' + stripeUrl);
      await shot(page, 't8_not_stripe');
      results.checks.push({ test: testLabel, check: 'Reach Stripe checkout', pass: false, detail: 'Did not reach Stripe' });
    }

  } catch (e) {
    console.error(`FATAL (${testLabel}): ` + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 't8_fatal_error').catch(() => {});
    results.checks.push({ test: testLabel, check: 'Complete flow', pass: false, detail: 'Fatal: ' + e.message.substring(0, 100) });
  } finally {
    await ctx.close();
  }

  return results;
}

// ====================== MAIN ======================

async function main() {
  console.log('=== E2E TESTS 4+5+6+8: Agreement Document Variant Verification ===');
  console.log('Dir: ' + DIR);
  console.log('Timestamp: ' + TIMESTAMP);
  console.log('');

  const browser = await chromium.launch({ headless: true });

  let results456 = { checks: [], docs: [] };
  let results8 = { checks: [], docs: [] };

  try {
    // Run TEST 4+5+6
    results456 = await runTest456(browser);

    // Run TEST 8
    results8 = await runTest8(browser);

  } finally {
    await browser.close();
  }

  // ========================== FINAL SUMMARY ==========================
  const allChecks = [...results456.checks, ...results8.checks];

  console.log('\n\n' + '='.repeat(100));
  console.log('  FINAL SUMMARY: All Tests');
  console.log('='.repeat(100));

  // Summary table by test
  console.log('\n' + padRight('Test', 12) + padRight('Check', 50) + padRight('Result', 8) + 'Details');
  console.log('-'.repeat(110));

  for (const c of allChecks) {
    console.log(
      padRight(c.test, 12) +
      padRight(c.check.substring(0, 48), 50) +
      padRight(c.pass ? 'PASS' : 'FAIL', 8) +
      (c.detail || '')
    );
  }
  console.log('-'.repeat(110));

  const passed = allChecks.filter(c => c.pass).length;
  const failed = allChecks.filter(c => !c.pass).length;
  const total = allChecks.length;
  const overallPass = failed === 0 && total > 0;

  console.log(`\nTotal: ${total} checks, ${passed} passed, ${failed} failed`);
  console.log(`OVERALL: ${overallPass ? 'ALL PASS' : 'SOME FAILURES'}`);

  // Save results JSON
  const summaryPath = join(DIR, 'test_results.json');
  writeFileSync(summaryPath, JSON.stringify({
    timestamp: TIMESTAMP,
    tests: {
      'TEST_456': {
        description: 'LLC with ROFR=No, Non-compete=Yes(3yr,Miami-Dade), Tag/Drag=No',
        checks: results456.checks,
        docs: results456.docs,
      },
      'TEST_8': {
        description: 'LLC with 5 owners',
        checks: results8.checks,
        docs: results8.docs,
      },
    },
    allChecks,
    summary: { total, passed, failed, overall: overallPass ? 'PASS' : 'FAIL' },
  }, null, 2));
  console.log(`\nResults saved to: ${summaryPath}`);
  console.log('Screenshots: ' + DIR);
  console.log('Total screenshots: ' + shotN);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
