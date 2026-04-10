/**
 * E2E Verification Round 2: Confirm recent bug fixes.
 *
 * TEST 5 RERUN: LLC with Non-compete=Yes
 *   Company: NC VERIFY LLC (LLC, Florida)
 *   Owners: Marco Noncomp (60%), Lucia Noncomp (40%) - All managers
 *   Agreement: Yes
 *     - Capital: $60K / $40K
 *     - Sale: Decision Unanime
 *     - Tax Partner: Marco Noncomp
 *     - Non-compete: Yes (3 years, scope: "Miami-Dade County")
 *     - Bank: Un firmante
 *     - Major: Mayoria, Minor: Decision Unanime
 *     - ROFR: Yes (180 days)
 *     - Death: No, Transfer: Free
 *     - Dissolution: Decision Unanime
 *     - No divorce, no tag/drag
 *   VERIFY: Operating Agreement contains Non-competition clause (Sec 11.12),
 *           "THREE (3) years", "Restrictive Period", "solicit any Customers",
 *           no unreplaced {{placeholders}}.
 *
 * TEST 2 RERUN: C-Corp with 4 owners
 *   Company: FOUR FIX Corp (C-Corp, Florida)
 *   Owners: Alpha One (40%), Beta Two (30%), Gamma Three (20%), Delta Four (10%)
 *   Shares: 10,000
 *   All directors, all officers: Alpha=President, Beta=VP, Gamma=Treasurer, Delta=Secretary
 *   Agreement: Yes
 *     - Capital: $40K/$30K/$20K/$10K
 *     - Sale: Supermayoria, Major: Mayoria
 *     - Bank: Dos firmantes, Non-compete: No
 *     - ROFR: Yes (90 days)
 *     - Transfer: Majority, Death: Yes, Divorce: Yes, Tag/Drag: Yes
 *     - Supermajority threshold: 75%
 *   VERIFY: ALL 4 owners appear in Shareholder Agreement (Delta Four was previously missing),
 *           shares 4,000/3,000/2,000/1,000, Super Majority "SEVENTY FIVE PERCENT (75.00%)",
 *           no unreplaced {{placeholders}}.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-verify-round2');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const PASSWORD = 'TestPass123!';

let shotN = 0;
let currentTestPrefix = '';
async function shot(page, label) {
  shotN++;
  const f = currentTestPrefix + String(shotN).padStart(3, '0') + '_' + label + '.png';
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
async function handleAuth0(page, email) {
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
        await emailInput2.fill(email);
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

/** Poll dashboard for documents (up to 3 minutes) */
async function pollForDocuments(page) {
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

/** Download a DOCX from S3 and extract text */
async function downloadAndExtract(s3Key, localPath) {
  execSync(
    `aws s3 cp "s3://avenida-legal-documents/${s3Key}" "${localPath}" --profile llc-admin --region us-west-1`,
    { encoding: 'utf8', timeout: 30000 }
  );
  return await extractDocxText(localPath);
}

/** Do Stripe payment */
async function doStripePayment(page, billingName) {
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

  console.log('  Clicking Pay...');
  await page.locator('.SubmitButton, button[type="submit"]').first().click();

  console.log('  Processing payment (30s)...');
  await page.waitForTimeout(30000);
  await shot(page, 'payment_result');
  console.log('  Post-payment URL: ' + page.url().substring(0, 100));
}

/** Advance through checkout */
async function doCheckout(page) {
  console.log('=== CHECKOUT ===');
  await shot(page, 'checkout_initial');

  const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
  if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await revBtn.click();
    console.log('  Clicked Revisar Paquete');
    await waitForStable(page, 3000);
  }

  await shot(page, 'checkout_services');

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
  return page.url();
}

/** Click "Lo quiero" for agreement */
async function clickLoQuiero(page) {
  const loQuiero = page.locator('button:has-text("Lo quiero")');
  if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
    await shot(page, 'agreement_modal');
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
    return true;
  }
  console.log('  [warn] No agreement modal found');
  return false;
}

/** Navigate past Step 1 if still there after auth */
async function advancePastStaleSteps(page, entityType, email) {
  let pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
    console.log('  On Step 1, advancing...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }

  pageText = await page.evaluate(() => document.body.innerText);
  const ownerKeyword = entityType === 'LLC' ? 'miembros' : 'accionistas';
  if ((pageText.includes(ownerKeyword) || pageText.includes('Nombre')) && pageText.includes('%')) {
    console.log('  On Step 2 (Owners), advancing...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }
}

function padRight(str, len) {
  return (str + ' '.repeat(len)).substring(0, len);
}


// ==============================================================================
// TEST 5 RERUN: LLC with Non-compete=Yes
// ==============================================================================
async function runTest5_LLC_NonCompete(browser) {
  const TEST_EMAIL = `test+nc_verify_${TIMESTAMP}@gmail.com`;
  const COMPANY_NAME_BASE = 'NC VERIFY';
  const COMPANY_NAME_FULL = 'NC VERIFY LLC';
  const OWNERS = [
    { first: 'Marco', last: 'Noncomp', full: 'Marco Noncomp', ownership: '60', capital: '60000' },
    { first: 'Lucia', last: 'Noncomp', full: 'Lucia Noncomp', ownership: '40', capital: '40000' },
  ];

  currentTestPrefix = 'T5_';
  shotN = 0;

  console.log('\n' + '='.repeat(100));
  console.log('  TEST 5 RERUN: LLC with Non-compete=Yes');
  console.log('='.repeat(100));
  console.log('Email: ' + TEST_EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const testResult = {
    name: 'Test 5: LLC Non-compete',
    criticalCheck: 'Non-competition clause in Operating Agreement',
    pass: false,
    details: '',
    checks: [],
  };

  try {
    // ========================== STEP 1: COMPANY ==========================
    console.log('=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

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
    await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(COMPANY_NAME_BASE);
    console.log('  Filled name: ' + COMPANY_NAME_BASE);
    await page.waitForTimeout(500);

    // Select LLC suffix
    const suffixSelects = await page.locator('select:visible').all();
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'LLC')) { await sel.selectOption('LLC'); console.log('  Selected suffix: LLC'); break; }
    }

    // Florida
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'Florida')) { await sel.selectOption('Florida'); console.log('  Selected state: Florida'); break; }
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

    await shot(page, 'step1_company');
    await clickContinuar(page);

    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page, TEST_EMAIL);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    const isStep1 = await page.locator('button[aria-label="LLC"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="LLC"]');
        if (btn) { const pk = Object.keys(btn).find(k => k.startsWith('__reactProps')); if (pk && btn[pk]?.onClick) btn[pk].onClick(); }
      });
      await page.waitForTimeout(500);
      await page.locator('input[placeholder*="Nombre"]').first().fill(COMPANY_NAME_BASE);
      const sels = await page.locator('select:visible').all();
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'LLC')) { await s.selectOption('LLC'); break; } }
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'Florida')) { await s.selectOption('Florida'); break; } }
      await page.evaluate(() => {
        document.querySelectorAll('[role="radiogroup"]').forEach(g => {
          const l = g.getAttribute('aria-label') || '';
          if (l.includes('dirección') || l.includes('teléfono')) { const b = g.querySelector('button[aria-label="No"]'); if (b) { const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if (pk && b[pk]?.onClick) b[pk].onClick(); } }
        });
      });
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page, TEST_EMAIL);
      await waitForStable(page, 3000);
    }

    await shot(page, 'step2_initial');

    // Set 2 owners
    await setFormValue(page, 'ownersCount', 2);
    await page.waitForTimeout(2000);
    console.log('  Set ownersCount: 2');

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
          if (noBtn) { const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps')); if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick(); else noBtn.click(); }
        }
      });
    });
    console.log('  Set citizenship: No for all');

    await shot(page, 'step2_owners');
    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2');
      await handleAuth0(page, TEST_EMAIL);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await advancePastStaleSteps(page, 'LLC', TEST_EMAIL);

    // ========================== STEP 3: ADMIN (Managers) ==========================
    console.log('=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    await shot(page, 'step3_initial');

    // All owners are managers
    await clickToggle(page, 'Socios son gerentes', 'Sí');
    await setFormValue(page, 'admin.managersAllOwners', 'Yes');
    console.log('  Set all owners as managers: Yes');
    await page.waitForTimeout(1000);

    await shot(page, 'step3_managers');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 4: SUMMARY ==========================
    console.log('=== STEP 4: Summary ===');
    await shot(page, 'step4_summary');
    await clickContinuar(page);
    await page.waitForTimeout(2000);

    await clickLoQuiero(page);

    // ========================== STEP 5: AGREEMENT 1 - Duenos & Roles ==========================
    console.log('=== STEP 5: Agreement - Duenos & Roles ===');
    await shot(page, 'step5_initial');

    // Capital contributions
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `agreement.llc_capitalContributions_${i}`, OWNERS[i].capital);
    }
    console.log(`  Set capital: ${OWNERS.map(o => '$' + Number(o.capital).toLocaleString()).join(' / ')}`);

    // All members are managing members
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes');

    // Specific roles: No
    await clickToggle(page, 'Has specific roles', 'No');
    console.log('  Specific roles: No');

    await shot(page, 'step5_agreement');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Prestamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Prestamos ===');
    await shot(page, 'step6_initial');

    // Keep default thresholds (no supermajority specified in test spec)
    // New members admission: default
    await clickToggle(page, 'New members admission', 'Unánime');

    // Additional contributions: default
    await clickToggle(page, 'Additional contributions process', 'No');

    // Member loans: No
    await clickToggle(page, 'Member loans', 'No');
    console.log('  Member loans: No');

    await shot(page, 'step6_capital');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale of company: Decision Unanime
    await clickToggle(page, 'LLC sale decision', 'Unánime');

    // Tax Partner: Marco Noncomp
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Marco Noncomp")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Marco Noncomp' });
      console.log('  Tax Partner: Marco Noncomp');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Marco Noncomp');
      console.log('  Tax Partner (via fiber): Marco Noncomp');
    }

    // Non-compete: YES (this is the critical setting for this test)
    await clickToggle(page, 'Non compete covenant', 'Sí');
    console.log('  Non-compete: YES');
    await page.waitForTimeout(1500);

    // Non-compete Duration: 3 years
    const durationInput = page.locator('input[name="agreement.llc_nonCompeteDuration"]');
    if (await durationInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await durationInput.fill('');
      await durationInput.fill('3');
      console.log('  Non-compete duration: 3 years');
    } else {
      await setFormValue(page, 'agreement.llc_nonCompeteDuration', 3);
      console.log('  Non-compete duration (via fiber): 3 years');
    }

    // Non-compete Scope: Miami-Dade County
    const scopeInput = page.locator('input[name="agreement.llc_nonCompeteScope"]');
    if (await scopeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await scopeInput.fill('Miami-Dade County');
      console.log('  Non-compete scope: Miami-Dade County');
    } else {
      await setFormValue(page, 'agreement.llc_nonCompeteScope', 'Miami-Dade County');
      console.log('  Non-compete scope (via fiber): Miami-Dade County');
    }

    // Bank signees: Un firmante
    await clickToggle(page, 'Bank signers', 'Un firmante');

    // Major decisions: Mayoria
    await clickToggle(page, 'LLC major decisions', 'Mayoría');

    // Minor decisions: Decision Unanime
    await clickToggle(page, 'LLC minor decisions', 'Unánime');

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

    // New partners admission: default (Unanime)
    await clickToggle(page, 'LLC new partners admission', 'Unánime');

    // Dissolution: Decision Unanime
    await clickToggle(page, 'LLC dissolution decision', 'Unánime');

    // Divorce buyout: No
    await clickToggle(page, 'LLC divorce buyout', 'No');

    // Tag/drag along: No
    await clickToggle(page, 'LLC tag drag rights', 'No');

    await shot(page, 'step8_succession');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== CHECKOUT & PAYMENT ==========================
    const stripeUrl = await doCheckout(page);

    if (stripeUrl.includes('stripe') || stripeUrl.includes('checkout.stripe')) {
      await doStripePayment(page, 'Marco Noncomp');

      // ========================== DASHBOARD: Poll for documents ==========================
      console.log('=== DASHBOARD ===');
      const docs = await pollForDocuments(page);

      await shot(page, 'dashboard');

      // ========================== VERIFICATION ==========================
      console.log('\n=== TEST 5 DOCUMENT VERIFICATION ===');

      // Find the Operating Agreement
      const agreementDoc = docs.find(d => {
        const n = (d.name || '').toLowerCase();
        return n.includes('agreement') || n.includes('operating') || n.includes('acuerdo');
      });

      if (!agreementDoc || !agreementDoc.s3Key) {
        testResult.details = 'Operating Agreement not found in generated documents';
        testResult.checks.push({ check: 'Operating Agreement exists', pass: false });
        console.log('  FAIL: Operating Agreement not found');
      } else {
        console.log(`  Found agreement: ${agreementDoc.name} (${agreementDoc.s3Key})`);
        const localPath = join(DIR, 'T5_operating_agreement.docx');
        const textContent = await downloadAndExtract(agreementDoc.s3Key, localPath);

        if (!textContent) {
          testResult.details = 'Could not extract text from Operating Agreement DOCX';
          testResult.checks.push({ check: 'DOCX text extraction', pass: false });
        } else {
          writeFileSync(join(DIR, 'T5_operating_agreement_text.txt'), textContent);
          const upperText = textContent.toUpperCase();

          // Critical check 1: "Non-competition" or "Covenant Against Competition"
          const hasNonCompete = upperText.includes('NON-COMPETITION') || upperText.includes('COVENANT AGAINST COMPETITION') || upperText.includes('NON COMPETITION');
          testResult.checks.push({ check: '"Non-competition" or "Covenant Against Competition" appears', pass: hasNonCompete });
          console.log(`  Non-competition text: ${hasNonCompete ? 'PASS' : 'FAIL'}`);

          // Critical check 2: "THREE (3) years"
          const hasThreeYears = textContent.includes('THREE (3) years') || textContent.includes('THREE (3) YEARS') || upperText.includes('THREE (3)');
          testResult.checks.push({ check: '"THREE (3) years" duration', pass: hasThreeYears });
          console.log(`  THREE (3) years: ${hasThreeYears ? 'PASS' : 'FAIL'}`);

          // Critical check 3: "Restrictive Period"
          const hasRestrictivePeriod = upperText.includes('RESTRICTIVE PERIOD');
          testResult.checks.push({ check: '"Restrictive Period" appears', pass: hasRestrictivePeriod });
          console.log(`  Restrictive Period: ${hasRestrictivePeriod ? 'PASS' : 'FAIL'}`);

          // Critical check 4: "solicit any Customers"
          const hasSolicitCustomers = textContent.includes('solicit any Customers') || textContent.includes('solicit any customers') || upperText.includes('SOLICIT ANY CUSTOMERS');
          testResult.checks.push({ check: '"solicit any Customers" appears', pass: hasSolicitCustomers });
          console.log(`  Solicit any Customers: ${hasSolicitCustomers ? 'PASS' : 'FAIL'}`);

          // Check 5: No unreplaced {{placeholders}}
          const placeholders = textContent.match(/\{\{[^}]+\}\}/g) || [];
          const noPlaceholders = placeholders.length === 0;
          testResult.checks.push({ check: 'No unreplaced {{placeholders}}', pass: noPlaceholders });
          console.log(`  Placeholders: ${noPlaceholders ? 'PASS (none)' : 'FAIL (' + placeholders.join(', ') + ')'}`);

          // Check 6: Both owners present
          for (const o of OWNERS) {
            const found = textContent.includes(o.full) || upperText.includes(o.full.toUpperCase());
            testResult.checks.push({ check: `Owner "${o.full}" present`, pass: found });
            console.log(`  Owner ${o.full}: ${found ? 'PASS' : 'FAIL'}`);
          }

          // Check 7: Miami-Dade County scope
          const hasScope = textContent.includes('Miami-Dade County') || textContent.includes('Miami-Dade');
          testResult.checks.push({ check: '"Miami-Dade County" scope', pass: hasScope });
          console.log(`  Miami-Dade County scope: ${hasScope ? 'PASS' : 'FAIL'}`);

          // Critical checks: non-compete text, duration, restrictive period, solicit customers, no placeholders
          const criticalPass = hasNonCompete && hasThreeYears && hasRestrictivePeriod && hasSolicitCustomers && noPlaceholders;
          testResult.pass = criticalPass;
          const failedChecks = testResult.checks.filter(c => !c.pass);
          if (criticalPass && failedChecks.length > 0) {
            testResult.details = 'Critical checks PASS. Minor issues: ' + failedChecks.map(c => c.check).join(', ');
          } else if (criticalPass) {
            testResult.details = 'All non-compete checks passed';
          } else {
            testResult.details = 'Failed critical checks: ' + failedChecks.map(c => c.check).join(', ');
          }
        }
      }
    } else {
      testResult.details = 'Did not reach Stripe. URL: ' + stripeUrl.substring(0, 80);
      await shot(page, 'not_stripe');
    }

  } catch (e) {
    testResult.details = 'FATAL: ' + (e.message || '').substring(0, 200);
    console.error('TEST 5 FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'fatal_error').catch(() => {});
  } finally {
    await ctx.close();
  }

  return testResult;
}


// ==============================================================================
// TEST 2 RERUN: C-Corp with 4 owners
// ==============================================================================
async function runTest2_Corp_4Owners(browser) {
  const TEST_EMAIL = `test+four_fix_${TIMESTAMP}@gmail.com`;
  const COMPANY_NAME_BASE = 'FOUR FIX';
  const COMPANY_NAME_FULL = 'FOUR FIX CORP';
  const TOTAL_SHARES = 10000;
  const OWNERS = [
    { first: 'Alpha',  last: 'One',   full: 'Alpha One',   ownership: '40', capital: '40000', shares: 4000, role: 'President' },
    { first: 'Beta',   last: 'Two',   full: 'Beta Two',    ownership: '30', capital: '30000', shares: 3000, role: 'Vice-President' },
    { first: 'Gamma',  last: 'Three', full: 'Gamma Three', ownership: '20', capital: '20000', shares: 2000, role: 'Treasurer' },
    { first: 'Delta',  last: 'Four',  full: 'Delta Four',  ownership: '10', capital: '10000', shares: 1000, role: 'Secretary' },
  ];

  currentTestPrefix = 'T2_';
  shotN = 0;

  console.log('\n' + '='.repeat(100));
  console.log('  TEST 2 RERUN: C-Corp with 4 owners');
  console.log('='.repeat(100));
  console.log('Email: ' + TEST_EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%) = ${o.role}`).join(', '));
  console.log('Shares: ' + TOTAL_SHARES);
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const testResult = {
    name: 'Test 2: C-Corp 4 owners',
    criticalCheck: 'Delta Four (4th shareholder) in Shareholder Agreement',
    pass: false,
    details: '',
    checks: [],
  };

  try {
    // ========================== STEP 1: COMPANY ==========================
    console.log('=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    // Select C-Corp
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
    await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(COMPANY_NAME_BASE);
    console.log('  Filled name: ' + COMPANY_NAME_BASE);
    await page.waitForTimeout(500);

    // Select Corp suffix
    const suffixSelects = await page.locator('select:visible').all();
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'Corp')) { await sel.selectOption('Corp'); console.log('  Selected suffix: Corp'); break; }
    }

    // Florida
    for (const sel of suffixSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'Florida')) { await sel.selectOption('Florida'); console.log('  Selected state: Florida'); break; }
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

    // Set 10,000 shares
    await setFormValue(page, 'company.numberOfShares', TOTAL_SHARES);
    console.log('  Set shares: ' + TOTAL_SHARES);

    await shot(page, 'step1_company');
    await clickContinuar(page);

    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) {
      await handleAuth0(page, TEST_EMAIL);
    }

    // ========================== STEP 2: OWNERS ==========================
    console.log('=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    const isStep1 = await page.locator('button[aria-label="C-Corp"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (isStep1) {
      console.log('  Still on Step 1, re-filling...');
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="C-Corp"]');
        if (btn) { const pk = Object.keys(btn).find(k => k.startsWith('__reactProps')); if (pk && btn[pk]?.onClick) btn[pk].onClick(); }
      });
      await page.waitForTimeout(500);
      await page.locator('input[placeholder*="Nombre"]').first().fill(COMPANY_NAME_BASE);
      const sels = await page.locator('select:visible').all();
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'Corp')) { await s.selectOption('Corp'); break; } }
      for (const s of sels) { const o = await s.locator('option').allTextContents(); if (o.some(x => x === 'Florida')) { await s.selectOption('Florida'); break; } }
      await page.evaluate(() => {
        document.querySelectorAll('[role="radiogroup"]').forEach(g => {
          const l = g.getAttribute('aria-label') || '';
          if (l.includes('dirección') || l.includes('teléfono')) { const b = g.querySelector('button[aria-label="No"]'); if (b) { const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if (pk && b[pk]?.onClick) b[pk].onClick(); } }
        });
      });
      await setFormValue(page, 'company.numberOfShares', TOTAL_SHARES);
      await clickContinuar(page);
      await page.waitForTimeout(3000);
      if (page.url().includes('auth0')) await handleAuth0(page, TEST_EMAIL);
      await waitForStable(page, 3000);
    }

    await shot(page, 'step2_initial');

    // Set 4 owners
    await setFormValue(page, 'ownersCount', 4);
    await page.waitForTimeout(2000);
    console.log('  Set ownersCount: 4');

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
          if (noBtn) { const pk = Object.keys(noBtn).find(k => k.startsWith('__reactProps')); if (pk && noBtn[pk]?.onClick) noBtn[pk].onClick(); else noBtn.click(); }
        }
      });
    });
    console.log('  Set citizenship: No for all');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2');
      await handleAuth0(page, TEST_EMAIL);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await advancePastStaleSteps(page, 'C-Corp', TEST_EMAIL);

    // ========================== STEP 3: ADMIN (Directors & Officers) ==========================
    console.log('=== STEP 3: Admin (Directors & Officers) ===');
    await waitForStable(page, 2000);
    await shot(page, 'step3_initial');

    // All owners are directors
    await clickToggle(page, 'Accionistas serán directores', 'Sí');
    await setFormValue(page, 'admin.directorsAllOwners', 'Yes');
    console.log('  All owners are directors: Yes');
    await page.waitForTimeout(1000);

    // All owners are officers
    await clickToggle(page, 'Accionistas serán oficiales', 'Sí');
    await setFormValue(page, 'admin.officersAllOwners', 'Yes');
    console.log('  All owners are officers: Yes');
    await page.waitForTimeout(2000);

    // Assign officer roles via UI dropdowns
    const roleSelects = await page.locator('select:visible').all();
    const rolesToAssign = ['President', 'Vice-President', 'Treasurer', 'Secretary'];
    let roleIdx = 0;
    for (const sel of roleSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'President') && roleIdx < rolesToAssign.length) {
        await sel.selectOption(rolesToAssign[roleIdx]);
        console.log(`  UI: Assigned ${OWNERS[roleIdx].full} = ${rolesToAssign[roleIdx]}`);
        roleIdx++;
      }
    }

    // Also set via fiber as backup
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `admin.officer${i + 1}Role`, OWNERS[i].role);
    }
    console.log('  Set roles via fiber: ' + OWNERS.map(o => `${o.full}=${o.role}`).join(', '));

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

    await clickLoQuiero(page);

    // ========================== STEP 5: AGREEMENT 1 - Duenos & Roles ==========================
    console.log('=== STEP 5: Agreement - Duenos & Roles ===');
    await shot(page, 'step5_initial');

    // Capital contributions
    for (let i = 0; i < OWNERS.length; i++) {
      await setFormValue(page, `agreement.corp_capitalPerOwner_${i}`, OWNERS[i].capital);
    }
    console.log(`  Set capital: ${OWNERS.map(o => '$' + Number(o.capital).toLocaleString()).join(' / ')}`);

    // Specific responsibilities: No (default)
    await shot(page, 'step5_agreement');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 6: AGREEMENT 2 - Capital & Prestamos ==========================
    console.log('=== STEP 6: Agreement - Capital & Prestamos ===');
    await shot(page, 'step6_initial');

    // Supermajority threshold: 75%
    const superInput = page.locator('input[name="agreement.supermajorityThreshold"]');
    if (await superInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await superInput.fill('');
      await superInput.fill('75');
      console.log('  Supermajority threshold: 75%');
    } else {
      await setFormValue(page, 'agreement.supermajorityThreshold', 75);
      console.log('  Supermajority threshold (via fiber): 75%');
    }

    // New shareholders admission: default
    // More capital process: default
    // Shareholder loans: default

    await shot(page, 'step6_capital');
    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale: Supermayoria
    await clickToggle(page, 'Sale decision threshold', 'Supermayoría');

    // Bank: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');

    // Major decisions: Mayoria
    await clickToggle(page, 'Major decision threshold', 'Mayoría');

    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    // Officer removal: default (Mayoria)
    await clickToggle(page, 'Officer removal voting', 'Mayoría');

    // Non-solicitation: Si
    await clickToggle(page, 'Non solicitation', 'Sí');

    // Confidentiality: Si
    await clickToggle(page, 'Confidentiality NDA', 'Sí');

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

    // Transfer to relatives: Majority
    const transferSelect = page.locator('select').filter({ has: page.locator('option:has-text("mayoría")') }).first();
    if (await transferSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await transferSelect.selectOption('Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.');
      console.log('  Transfer to relatives: Majority');
    } else {
      await setFormValue(page, 'agreement.corp_transferToRelatives', 'Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.');
      console.log('  Transfer to relatives (via fiber): Majority');
    }

    // Death/incapacity: Yes
    await clickToggle(page, 'Incapacity heirs policy', 'Sí');

    // Divorce: Yes
    await clickToggle(page, 'Divorce buyout policy', 'Sí');

    // Tag/drag along: Yes
    await clickToggle(page, 'Tag along drag along rights', 'Sí');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== CHECKOUT & PAYMENT ==========================
    const stripeUrl = await doCheckout(page);

    if (stripeUrl.includes('stripe') || stripeUrl.includes('checkout.stripe')) {
      await doStripePayment(page, 'Alpha One');

      // ========================== DASHBOARD: Poll for documents ==========================
      console.log('=== DASHBOARD ===');
      const docs = await pollForDocuments(page);

      await shot(page, 'dashboard');

      // ========================== VERIFICATION ==========================
      console.log('\n=== TEST 2 DOCUMENT VERIFICATION ===');

      // Find the Shareholder Agreement (not the Shareholder Registry)
      const agreementDoc = docs.find(d => {
        const n = (d.name || '').toLowerCase();
        return (n.includes('shareholder') && n.includes('agreement')) || n.includes('accionista');
      }) || docs.find(d => {
        const n = (d.name || '').toLowerCase();
        const k = (d.s3Key || '').toLowerCase();
        return k.includes('agreements/') && (n.includes('shareholder') || n.includes('agreement'));
      });

      if (!agreementDoc || !agreementDoc.s3Key) {
        testResult.details = 'Shareholder Agreement not found in generated documents';
        testResult.checks.push({ check: 'Shareholder Agreement exists', pass: false });
        console.log('  FAIL: Shareholder Agreement not found');
      } else {
        console.log(`  Found agreement: ${agreementDoc.name} (${agreementDoc.s3Key})`);
        const localPath = join(DIR, 'T2_shareholder_agreement.docx');
        const textContent = await downloadAndExtract(agreementDoc.s3Key, localPath);

        if (!textContent) {
          testResult.details = 'Could not extract text from Shareholder Agreement DOCX';
          testResult.checks.push({ check: 'DOCX text extraction', pass: false });
        } else {
          writeFileSync(join(DIR, 'T2_shareholder_agreement_text.txt'), textContent);
          const upperText = textContent.toUpperCase();

          // Critical check: ALL 4 owners present
          let allOwnersPresent = true;
          for (const o of OWNERS) {
            const found = textContent.includes(o.full) || upperText.includes(o.full.toUpperCase());
            testResult.checks.push({ check: `Owner "${o.full}" present`, pass: found });
            console.log(`  Owner ${o.full}: ${found ? 'PASS' : 'FAIL'}`);
            if (!found) allOwnersPresent = false;
          }

          // Critical check: Delta Four specifically (the one that was missing)
          const hasDeltaFour = textContent.includes('Delta Four') || upperText.includes('DELTA FOUR');
          testResult.checks.push({ check: 'Delta Four (4th shareholder) CRITICAL', pass: hasDeltaFour });
          console.log(`  Delta Four (CRITICAL): ${hasDeltaFour ? 'PASS' : 'FAIL'}`);

          // Check shares: 4,000 / 3,000 / 2,000 / 1,000
          for (const o of OWNERS) {
            const sharesStr = o.shares.toLocaleString();
            const hasShares = textContent.includes(sharesStr) || textContent.includes(String(o.shares));
            testResult.checks.push({ check: `${o.full} shares (${sharesStr})`, pass: hasShares });
            console.log(`  ${o.full} shares (${sharesStr}): ${hasShares ? 'PASS' : 'FAIL'}`);
          }

          // Check Super Majority definition: "SEVENTY FIVE PERCENT (75.00%)"
          const hasSuperMaj = upperText.includes('SEVENTY FIVE PERCENT') || upperText.includes('SEVENTY-FIVE PERCENT') || upperText.includes('75.00%') || upperText.includes('75%');
          testResult.checks.push({ check: 'Super Majority "SEVENTY FIVE PERCENT (75.00%)"', pass: hasSuperMaj });
          console.log(`  Super Majority 75%: ${hasSuperMaj ? 'PASS' : 'FAIL'}`);

          // Check: No unreplaced {{placeholders}}
          const placeholders = textContent.match(/\{\{[^}]+\}\}/g) || [];
          const noPlaceholders = placeholders.length === 0;
          testResult.checks.push({ check: 'No unreplaced {{placeholders}}', pass: noPlaceholders });
          console.log(`  Placeholders: ${noPlaceholders ? 'PASS (none)' : 'FAIL (' + placeholders.join(', ') + ')'}`);

          testResult.pass = allOwnersPresent && hasDeltaFour && hasSuperMaj && noPlaceholders;
          testResult.details = testResult.pass
            ? 'All 4 owners present, shares correct, supermajority defined'
            : 'Failed checks: ' + testResult.checks.filter(c => !c.pass).map(c => c.check).join(', ');
        }
      }
    } else {
      testResult.details = 'Did not reach Stripe. URL: ' + stripeUrl.substring(0, 80);
      await shot(page, 'not_stripe');
    }

  } catch (e) {
    testResult.details = 'FATAL: ' + (e.message || '').substring(0, 200);
    console.error('TEST 2 FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'fatal_error').catch(() => {});
  } finally {
    await ctx.close();
  }

  return testResult;
}


// ==============================================================================
// MAIN: Run both tests and print summary
// ==============================================================================
async function main() {
  console.log('='.repeat(100));
  console.log('  E2E VERIFICATION ROUND 2: Bug Fix Confirmation');
  console.log('  Tests: LLC Non-compete (Test 5) + C-Corp 4 Owners (Test 2)');
  console.log('  Screenshots: ' + DIR);
  console.log('  Timestamp: ' + TIMESTAMP);
  console.log('='.repeat(100));
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    // Run Test 5: LLC Non-compete
    const result5 = await runTest5_LLC_NonCompete(browser);
    results.push(result5);

    // Run Test 2: C-Corp 4 Owners
    const result2 = await runTest2_Corp_4Owners(browser);
    results.push(result2);

  } catch (e) {
    console.error('GLOBAL FATAL: ' + e.message);
  } finally {
    await browser.close();
  }

  // ========================== SUMMARY TABLE ==========================
  console.log('\n\n' + '='.repeat(100));
  console.log('  VERIFICATION SUMMARY');
  console.log('='.repeat(100));

  console.log('\n' +
    padRight('| Test', 38) +
    padRight('| Critical Check', 55) +
    padRight('| Result', 10) +
    '| Details'
  );
  console.log(
    padRight('|' + '-'.repeat(37), 38) +
    padRight('|' + '-'.repeat(54), 55) +
    padRight('|' + '-'.repeat(9), 10) +
    '|' + '-'.repeat(50)
  );

  for (const r of results) {
    console.log(
      padRight('| ' + r.name, 38) +
      padRight('| ' + r.criticalCheck, 55) +
      padRight('| ' + (r.pass ? 'PASS' : 'FAIL'), 10) +
      '| ' + r.details.substring(0, 80)
    );
  }

  console.log(
    padRight('|' + '-'.repeat(37), 38) +
    padRight('|' + '-'.repeat(54), 55) +
    padRight('|' + '-'.repeat(9), 10) +
    '|' + '-'.repeat(50)
  );

  const allPass = results.every(r => r.pass);
  console.log(`\nOVERALL: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);

  // Detailed check breakdown
  for (const r of results) {
    console.log(`\n--- ${r.name} ---`);
    for (const c of r.checks) {
      console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.check}`);
    }
  }

  // Save results as JSON
  const summaryPath = join(DIR, 'verification_round2_results.json');
  writeFileSync(summaryPath, JSON.stringify({
    timestamp: TIMESTAMP,
    results,
    overall: allPass ? 'PASS' : 'FAIL',
  }, null, 2));
  console.log(`\nResults saved to: ${summaryPath}`);
  console.log('Screenshots saved to: ' + DIR);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
