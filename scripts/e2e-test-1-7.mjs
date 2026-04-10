/**
 * E2E Tests 1 & 7: Two LLC formation tests run sequentially.
 *
 * TEST 1: LLC with 1 owner (single-member), Agreement = Yes
 *   Entity: LLC, Name: "SOLO MEMBER", Suffix: LLC, State: Florida
 *   No US address, No US phone
 *   1 owner: "Ricardo Solo" (100%)
 *   1 manager (all owners = managers)
 *   Agreement: Yes
 *     - Capital: $100K
 *     - Managing member: Yes
 *     - All voting defaults
 *     - Sale: Decision Unanime
 *     - Tax Partner: Ricardo Solo
 *     - Non-compete: No, Bank: Un firmante
 *     - ROFR: Yes (180 days)
 *     - Death: No, Transfer: Free
 *     - Dissolution: Decision Unanime
 *   Auth0: test+solo_member_TIMESTAMP@gmail.com / TestPass123!
 *   Pay with Stripe test card
 *   Verify: all docs generated, no {{placeholders}}, "Ricardo Solo" in all docs, no "LLC LLC"
 *
 * TEST 7: LLC with 2 owners, Agreement = No (5-step flow)
 *   Entity: LLC, Name: "NO AGREEMENT", Suffix: LLC, State: Florida
 *   No US address, No US phone
 *   2 owners: "Pedro Noagree" (60%), "Julia Noagree" (40%)
 *   All managers
 *   At Step 4 summary: click "No" for agreement (should skip to checkout as step 5)
 *   Auth0: test+no_agreement_TIMESTAMP@gmail.com / TestPass123!
 *   Pay with Stripe test card
 *   Verify: docs generated WITHOUT agreement document
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-test-1-7');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();

// ======================================================================
// SHARED UTILITIES
// ======================================================================

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

/** Fill Step 1: Company info */
async function fillStep1(page, companyNameBase, suffix, state) {
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
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(companyNameBase);
  console.log('  Filled name: ' + companyNameBase);
  await page.waitForTimeout(500);

  // Select suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === suffix)) {
      await sel.selectOption(suffix);
      console.log('  Selected suffix: ' + suffix);
      break;
    }
  }

  // Select state
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === state)) {
      await sel.selectOption(state);
      console.log('  Selected state: ' + state);
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

/** Fill Step 2: Owners */
async function fillStep2(page, owners) {
  await setFormValue(page, 'ownersCount', owners.length);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: ' + owners.length);

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

/** Handle Step 3: Managers (all owners = managers) */
async function fillStep3(page) {
  await clickToggle(page, 'All owners are managers', 'Sí');
  await setFormValue(page, 'admin.managersAllOwners', 'Yes');
  console.log('  Set all owners as managers: Yes');
  await page.waitForTimeout(1000);
}

/** Handle Stripe payment flow */
async function handleStripePayment(page, billingName) {
  console.log('  Waiting for Stripe...');
  await page.waitForTimeout(15000);

  const stripeUrl = page.url();
  console.log('  URL: ' + stripeUrl.substring(0, 100));

  if (!stripeUrl.includes('stripe') && !stripeUrl.includes('checkout.stripe')) {
    // Try waiting longer
    console.log('  Not yet on Stripe, waiting more...');
    await page.waitForTimeout(15000);
  }

  if (!page.url().includes('stripe')) {
    console.log('  NOT on Stripe. URL: ' + page.url());
    await shot(page, 'not_stripe');
    return false;
  }

  console.log('=== STRIPE PAYMENT ===');
  await shot(page, 'stripe_checkout');

  // Fill card fields - try different selector patterns
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

  // Wait for payment to process
  console.log('  Processing payment (30s)...');
  await page.waitForTimeout(30000);
  await shot(page, 'payment_result');

  console.log('  Post-payment URL: ' + page.url().substring(0, 100));
  return true;
}

/** Poll for documents on dashboard */
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

    // Try React fiber extraction
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

    // Fallback: try API
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

/** Verify documents: download from S3, check for placeholders, key content, double LLC */
async function verifyDocuments(docs, testLabel, companyNameFull, owners, expectAgreement) {
  console.log(`\n=== DOCUMENT VERIFICATION (${testLabel}) ===`);
  console.log(`Found ${docs.length} documents total`);

  const results = [];

  for (const doc of docs) {
    const name = doc.name || 'unknown';
    const safeName = testLabel.replace(/\s+/g, '_') + '_' + name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
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

    // Check if file exists on S3
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

    // For .docx files, download and verify
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
          writeFileSync(join(DIR, safeName + '_text.txt'), textContent);

          // CHECK 1: Unreplaced {{placeholders}}
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

          // CHECK 2: No double "LLC LLC"
          const doubleLLC = textContent.match(/LLC\s+LLC/gi);
          if (doubleLLC) {
            result.noDoubleLLC = false;
            result.issues.push('DOUBLE LLC found: "' + doubleLLC[0] + '"');
            console.log(`  Double LLC: FAIL`);
          } else {
            result.noDoubleLLC = true;
            console.log(`  Double LLC: PASS (not found)`);
          }

          // CHECK 3: All owner names present
          const ownerChecks = [];
          for (const o of owners) {
            const found = textContent.includes(o.full) || textContent.toUpperCase().includes(o.full.toUpperCase());
            ownerChecks.push({ name: o.full, found });
            if (!found) {
              result.issues.push(`Missing owner: ${o.full}`);
            }
          }
          result.allOwnersPresent = ownerChecks.every(c => c.found);
          console.log(`  All owners: ${result.allOwnersPresent ? 'PASS' : 'FAIL'} (${ownerChecks.map(c => c.name + ':' + (c.found ? 'Y' : 'N')).join(', ')})`);

          // CHECK 4: Company name
          const hasCompanyName = textContent.includes(companyNameFull) || textContent.toUpperCase().includes(companyNameFull);
          if (hasCompanyName) {
            console.log(`  Company name "${companyNameFull}": PASS`);
          } else {
            result.issues.push(`Company name "${companyNameFull}" not found`);
            console.log(`  Company name "${companyNameFull}": FAIL`);
          }

          // Key content
          const checks = [];
          if (hasCompanyName) checks.push('company_name');
          for (let i = 0; i < owners.length; i++) {
            if (textContent.includes(owners[i].full) || textContent.toUpperCase().includes(owners[i].full.toUpperCase())) {
              checks.push(`owner${i + 1}`);
            }
          }
          result.keyContentPresent = checks.length >= 1;
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

  return results;
}

/** Navigate through auth redirects after Step 1/Step 2 */
async function navigatePostAuth(page, email, password) {
  if (page.url().includes('auth0')) {
    await handleAuth0(page, email, password);
  }

  await waitForStable(page, 3000);

  // Check if we landed back on Step 1
  const isStep1 = await page.locator('button[aria-label="LLC"]').isVisible({ timeout: 2000 }).catch(() => false);
  if (isStep1) {
    console.log('  Still on Step 1 after auth, clicking Continuar...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) await handleAuth0(page, email, password);
    await waitForStable(page, 3000);
  }
}

/** Handle checkout and payment */
async function handleCheckout(page, billingName) {
  // Click "Revisar Paquete y Proceder al Pago"
  const revBtn = page.locator('button:has-text("Revisar"), button:has-text("Paquete")').first();
  if (await revBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await revBtn.click();
    console.log('  Clicked Revisar Paquete');
    await waitForStable(page, 3000);
  }

  await shot(page, 'checkout_services');

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

  return await handleStripePayment(page, billingName);
}

function padRight(str, len) {
  return (str + ' '.repeat(len)).substring(0, len);
}


// ======================================================================
// TEST 1: LLC with 1 owner (single-member), Agreement = Yes
// ======================================================================
async function runTest1(browser) {
  const testLabel = 'TEST_1';
  const EMAIL = `test+solo_member_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const COMPANY_NAME_BASE = 'SOLO MEMBER';
  const COMPANY_NAME_FULL = 'SOLO MEMBER LLC';
  const OWNERS = [
    { first: 'Ricardo', last: 'Solo', full: 'Ricardo Solo', ownership: '100', capital: '100000' },
  ];

  console.log('\n' + '='.repeat(100));
  console.log('  TEST 1: LLC with 1 owner (single-member), Agreement = Yes');
  console.log('='.repeat(100));
  console.log('Email: ' + EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const testResult = {
    test: 'Test 1',
    entity: 'LLC',
    owners: '1 (Ricardo Solo)',
    agreement: 'Yes',
    docsOk: false,
    placeholders: false,
    keyContent: false,
    verdict: 'FAIL',
    details: [],
  };

  try {
    // ==================== STEP 1: COMPANY ====================
    console.log('\n=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    await fillStep1(page, COMPANY_NAME_BASE, 'LLC', 'Florida');
    await shot(page, 'T1_step1_company');
    await clickContinuar(page);
    await page.waitForTimeout(3000);

    // Handle auth
    await navigatePostAuth(page, EMAIL, PASSWORD);

    // ==================== STEP 2: OWNERS ====================
    console.log('\n=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    let pageText = await page.evaluate(() => document.body.innerText);

    // If we're on step 1 again, advance
    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // Check if we need auth after step advancement
    if (page.url().includes('auth0')) {
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    pageText = await page.evaluate(() => document.body.innerText);

    // If on Step 2, fill owners
    if ((pageText.includes('miembros') || pageText.includes('Nombre') || pageText.includes('propietarios')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners)');
    }

    await shot(page, 'T1_step2_initial');
    await fillStep2(page, OWNERS);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2');
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 'T1_post_auth');

    // Navigate through any remaining redirects
    pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }
    pageText = await page.evaluate(() => document.body.innerText);
    if ((pageText.includes('miembros') || pageText.includes('Nombre')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), re-checking data...');
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await fillStep2(page, OWNERS);
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ==================== STEP 3: ADMIN (Managers) ====================
    console.log('\n=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "gerentes": ' + pageText.includes('gerentes'));
    console.log('  Page contains "administradores": ' + pageText.includes('administradores'));
    await shot(page, 'T1_step3_initial');

    await fillStep3(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step3_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step3_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 4: SUMMARY ====================
    console.log('\n=== STEP 4: Summary ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step4_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step4_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // Look for "Lo quiero" in the agreement modal
    const loQuiero = page.locator('button:has-text("Lo quiero")');
    if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, 'T1_step4_agreement_modal');
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

    // ==================== STEP 5: AGREEMENT 1 - Duenos & Roles ====================
    console.log('\n=== STEP 5: Agreement - Duenos & Roles ===');
    await shot(page, 'T1_step5_initial');

    // Capital: $100K
    await setFormValue(page, 'agreement.llc_capitalContributions_0', '100000');
    console.log('  Set capital: $100,000');

    // Managing member: Yes
    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes');

    // Specific roles: No
    await clickToggle(page, 'Has specific roles', 'No');
    console.log('  Specific roles: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step5_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step5_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 6: AGREEMENT 2 - Capital & Prestamos ====================
    console.log('\n=== STEP 6: Agreement - Capital & Prestamos ===');
    await shot(page, 'T1_step6_initial');

    // For single-member, voting thresholds may not appear - keep defaults
    // Try to set them anyway
    const majorityInput = page.locator('input[name="agreement.majorityThreshold"]');
    if (await majorityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Leave defaults for single member
      console.log('  Majority threshold: using default');
    }

    const superInput = page.locator('input[name="agreement.supermajorityThreshold"]');
    if (await superInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Supermajority threshold: using default');
    }

    // Use defaults for voting fields
    // New members admission - try default
    await clickToggle(page, 'New members admission', 'Unánime').catch(() => {});
    // Additional contributions - try default
    await clickToggle(page, 'Additional contributions process', 'Sí, Pro-Rata').catch(() => {});
    // Member loans: No (default)
    await clickToggle(page, 'Member loans', 'No').catch(() => {});

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step6_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step6_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ====================
    console.log('\n=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'T1_step7_initial');

    // Sale of company: Decision Unanime
    await clickToggle(page, 'LLC sale decision', 'Unánime');

    // Tax Partner: Ricardo Solo
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Ricardo Solo")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Ricardo Solo' });
      console.log('  Tax Partner: Ricardo Solo');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Ricardo Solo');
      console.log('  Tax Partner (via fiber): Ricardo Solo');
    }

    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    // Bank signees: Un firmante
    await clickToggle(page, 'Bank signers', 'Un firmante');

    // Major decisions: use default
    await clickToggle(page, 'LLC major decisions', 'Unánime').catch(() => {});
    // Minor decisions: use default
    await clickToggle(page, 'LLC minor decisions', 'Unánime').catch(() => {});

    // Non-solicitation/Confidentiality defaults
    await clickToggle(page, 'LLC confidentiality NDA', 'Sí').catch(() => {});

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 8: AGREEMENT 4 - Acciones & Sucesion ====================
    console.log('\n=== STEP 8: Agreement - Acciones & Sucesion ===');
    await shot(page, 'T1_step8_initial');

    // ROFR: Yes (180 days)
    await clickToggle(page, 'Right of first refusal', 'Sí');
    await page.waitForTimeout(1000);
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

    // New partners: use default (Unanime for single member)
    await clickToggle(page, 'LLC new partners admission', 'Unánime').catch(() => {});

    // Dissolution: Decision Unanime
    await clickToggle(page, 'LLC dissolution decision', 'Unánime');

    // Divorce buyout: No (if visible)
    await clickToggle(page, 'LLC divorce buyout', 'No').catch(() => {});

    // Tag/drag along: No (if visible)
    await clickToggle(page, 'LLC tag drag rights', 'No').catch(() => {});

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T1_step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T1_step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 9: CHECKOUT ====================
    console.log('\n=== STEP 9: Checkout ===');
    await shot(page, 'T1_checkout_initial');

    const paid = await handleCheckout(page, 'Ricardo Solo');

    if (paid) {
      // ==================== DASHBOARD ====================
      console.log('\n=== DASHBOARD ===');
      const docs = await pollForDocuments(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'T1_dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'T1_dashboard_bottom');

      const results = await verifyDocuments(docs, testLabel, COMPANY_NAME_FULL, OWNERS, true);

      // Check for agreement document (Operating Agreement or Shareholder Agreement)
      // Be specific: match "Operating Agreement" or "Shareholder Agreement" or "Acuerdo Operativo"
      // Avoid false positive from company name containing "agreement" (e.g. "NO AGREEMENT LLC")
      const hasAgreement = results.some(r => {
        const n = (r.name || '').toLowerCase();
        return n.includes('operating agreement') || n.includes('shareholder agreement') || n.includes('acuerdo operativo');
      });
      console.log(`\n  Agreement doc present: ${hasAgreement ? 'YES' : 'NO'}`);
      if (!hasAgreement) {
        testResult.details.push('MISSING: Agreement document not found');
      }

      // Compute verdict
      const allDocsExist = results.length > 0 && results.every(r => r.exists && r.sizeOk);
      const noPlaceholders = results.every(r => r.noPlaceholders === null || r.noPlaceholders === true);
      const noDoubleLLC = results.every(r => r.noDoubleLLC === null || r.noDoubleLLC === true);
      const allOwners = results.every(r => r.allOwnersPresent === null || r.allOwnersPresent === true);

      testResult.docsOk = allDocsExist && hasAgreement;
      testResult.placeholders = noPlaceholders;
      testResult.keyContent = allOwners && noDoubleLLC;
      testResult.verdict = (testResult.docsOk && testResult.placeholders && testResult.keyContent) ? 'PASS' : 'FAIL';
      testResult.results = results;

      if (!allDocsExist) testResult.details.push('Some docs missing or too small');
      if (!noPlaceholders) testResult.details.push('Unreplaced {{placeholders}} found');
      if (!noDoubleLLC) testResult.details.push('"LLC LLC" double suffix found');
      if (!allOwners) testResult.details.push('Owner names missing from some docs');
    } else {
      testResult.details.push('Payment flow failed - did not reach Stripe');
    }

    console.log('\n  TEST 1 VERDICT: ' + testResult.verdict);

  } catch (e) {
    console.error('TEST 1 FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'T1_fatal_error').catch(() => {});
    testResult.details.push('FATAL: ' + e.message);
  } finally {
    await ctx.close();
  }

  return testResult;
}


// ======================================================================
// TEST 7: LLC with 2 owners, Agreement = No (5-step flow)
// ======================================================================
async function runTest7(browser) {
  const testLabel = 'TEST_7';
  const EMAIL = `test+no_agreement_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const COMPANY_NAME_BASE = 'NO AGREEMENT';
  const COMPANY_NAME_FULL = 'NO AGREEMENT LLC';
  const OWNERS = [
    { first: 'Pedro', last: 'Noagree', full: 'Pedro Noagree', ownership: '60' },
    { first: 'Julia', last: 'Noagree', full: 'Julia Noagree', ownership: '40' },
  ];

  console.log('\n' + '='.repeat(100));
  console.log('  TEST 7: LLC with 2 owners, Agreement = No (5-step flow)');
  console.log('='.repeat(100));
  console.log('Email: ' + EMAIL);
  console.log('Company: ' + COMPANY_NAME_FULL);
  console.log('Owners: ' + OWNERS.map(o => `${o.full} (${o.ownership}%)`).join(', '));
  console.log('');

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const testResult = {
    test: 'Test 7',
    entity: 'LLC',
    owners: '2 (Pedro 60%, Julia 40%)',
    agreement: 'No',
    docsOk: false,
    placeholders: false,
    keyContent: false,
    verdict: 'FAIL',
    details: [],
  };

  try {
    // ==================== STEP 1: COMPANY ====================
    console.log('\n=== STEP 1: Company ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 4000);

    await fillStep1(page, COMPANY_NAME_BASE, 'LLC', 'Florida');
    await shot(page, 'T7_step1_company');
    await clickContinuar(page);
    await page.waitForTimeout(3000);

    // Handle auth
    await navigatePostAuth(page, EMAIL, PASSWORD);

    // ==================== STEP 2: OWNERS ====================
    console.log('\n=== STEP 2: Owners ===');
    await waitForStable(page, 3000);

    let pageText = await page.evaluate(() => document.body.innerText);

    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    if (page.url().includes('auth0')) {
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    pageText = await page.evaluate(() => document.body.innerText);

    await shot(page, 'T7_step2_initial');
    await fillStep2(page, OWNERS);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T7_step2_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T7_step2_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2');
      await handleAuth0(page, EMAIL, PASSWORD);
      await waitForStable(page, 5000);
    }

    console.log('  Post-auth URL: ' + page.url().substring(0, 80));
    await shot(page, 'T7_post_auth');

    // Navigate through any remaining redirects
    pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
      console.log('  On Step 1, advancing...');
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }
    pageText = await page.evaluate(() => document.body.innerText);
    if ((pageText.includes('miembros') || pageText.includes('Nombre')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), re-checking data...');
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await fillStep2(page, OWNERS);
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ==================== STEP 3: ADMIN (Managers) ====================
    console.log('\n=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "gerentes": ' + pageText.includes('gerentes'));
    await shot(page, 'T7_step3_initial');

    await fillStep3(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T7_step3_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T7_step3_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ==================== STEP 4: SUMMARY - Click NO for agreement ====================
    console.log('\n=== STEP 4: Summary (Click NO for agreement) ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'T7_step4_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'T7_step4_bottom');

    await clickContinuar(page);
    await page.waitForTimeout(2000);

    // The agreement modal has a blue "Lo quiero" button AND a small underline text
    // button: "Quiero continuar con el alto riesgo que esto conlleva"
    // We need to click the decline link to skip the agreement.
    let clickedNo = false;

    // First check if the modal appeared (look for "Lo quiero" button as indicator)
    const loQuieroVisible = await page.locator('button:has-text("Lo quiero")').isVisible({ timeout: 5000 }).catch(() => false);
    if (loQuieroVisible) {
      await shot(page, 'T7_step4_agreement_modal');

      // Click the decline link: "Quiero continuar con el alto riesgo que esto conlleva"
      clickedNo = await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          const txt = btn.textContent?.trim() || '';
          if (txt.includes('alto riesgo') || txt.includes('continuar con el alto')) {
            const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
            if (pk && btn[pk]?.onClick) { btn[pk].onClick(); return true; }
            btn.click();
            return true;
          }
        }
        // Also try links/anchors in case it's not a button
        for (const el of document.querySelectorAll('a, span, p, div')) {
          const txt = el.textContent?.trim() || '';
          if (txt.includes('alto riesgo') || txt.includes('continuar con el alto')) {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (clickedNo) {
        console.log('  Clicked "Quiero continuar con el alto riesgo..." - declined agreement');
      } else {
        console.log('  [warn] Modal visible but could not click decline link');
      }
    } else {
      console.log('  [warn] Agreement modal not found');
    }

    if (!clickedNo) {
      console.log('  [warn] Trying fallback: set form value directly to skip agreement');
      await setFormValue(page, 'admin.wantAgreement', 'No');
      await page.evaluate(() => {
        // Try to find and trigger setStep(5) via any available React mechanism
        for (const btn of document.querySelectorAll('button')) {
          const txt = btn.textContent?.trim() || '';
          if (txt.includes('riesgo') || txt.includes('continuar') && txt.includes('alto')) {
            btn.click();
            return;
          }
        }
      });
    }

    await waitForStable(page, 3000);
    await shot(page, 'T7_after_no_agreement');

    // Should skip to checkout (Step 5 in 5-step flow)
    console.log('  Post-agreement URL: ' + page.url().substring(0, 80));
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page has "Pago": ' + pageText.includes('Pago'));
    console.log('  Page has "checkout": ' + pageText.toLowerCase().includes('checkout'));
    console.log('  Page has "Revisar": ' + pageText.includes('Revisar'));

    // ==================== STEP 5: CHECKOUT (no agreement steps) ====================
    console.log('\n=== STEP 5: Checkout (5-step flow) ===');
    await shot(page, 'T7_checkout_initial');

    const paid = await handleCheckout(page, 'Pedro Noagree');

    if (paid) {
      // ==================== DASHBOARD ====================
      console.log('\n=== DASHBOARD ===');
      const docs = await pollForDocuments(page);

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'T7_dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'T7_dashboard_bottom');

      const results = await verifyDocuments(docs, testLabel, COMPANY_NAME_FULL, OWNERS, false);

      // CHECK: Agreement doc should NOT be present
      // Be specific: match "Operating Agreement" or "Shareholder Agreement" or "Acuerdo Operativo"
      // Avoid false positive from company name containing "agreement" (e.g. "NO AGREEMENT LLC")
      const hasAgreement = results.some(r => {
        const n = (r.name || '').toLowerCase();
        return n.includes('operating agreement') || n.includes('shareholder agreement') || n.includes('acuerdo operativo');
      });
      console.log(`\n  Agreement doc present: ${hasAgreement ? 'YES (BAD!)' : 'NO (CORRECT)'}`);
      if (hasAgreement) {
        testResult.details.push('UNEXPECTED: Agreement document found when Agreement=No');
      }

      // Compute verdict
      const allDocsExist = results.length > 0 && results.every(r => r.exists && r.sizeOk);
      const noPlaceholders = results.every(r => r.noPlaceholders === null || r.noPlaceholders === true);
      const noDoubleLLC = results.every(r => r.noDoubleLLC === null || r.noDoubleLLC === true);
      const allOwners = results.every(r => r.allOwnersPresent === null || r.allOwnersPresent === true);

      testResult.docsOk = allDocsExist && !hasAgreement;
      testResult.placeholders = noPlaceholders;
      testResult.keyContent = allOwners && noDoubleLLC;
      testResult.verdict = (testResult.docsOk && testResult.placeholders && testResult.keyContent) ? 'PASS' : 'FAIL';
      testResult.results = results;

      if (!allDocsExist) testResult.details.push('Some docs missing or too small');
      if (!noPlaceholders) testResult.details.push('Unreplaced {{placeholders}} found');
      if (!noDoubleLLC) testResult.details.push('"LLC LLC" double suffix found');
      if (!allOwners) testResult.details.push('Owner names missing from some docs');
    } else {
      testResult.details.push('Payment flow failed - did not reach Stripe');
    }

    console.log('\n  TEST 7 VERDICT: ' + testResult.verdict);

  } catch (e) {
    console.error('TEST 7 FATAL: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'T7_fatal_error').catch(() => {});
    testResult.details.push('FATAL: ' + e.message);
  } finally {
    await ctx.close();
  }

  return testResult;
}


// ======================================================================
// MAIN: Run both tests, print summary table
// ======================================================================
async function main() {
  console.log('='.repeat(100));
  console.log('  E2E TESTS 1 & 7');
  console.log('  Dir: ' + DIR);
  console.log('  Timestamp: ' + TIMESTAMP);
  console.log('='.repeat(100));

  const browser = await chromium.launch({ headless: true });

  let result1, result7;

  try {
    result1 = await runTest1(browser);
  } catch (e) {
    console.error('Test 1 outer error:', e.message);
    result1 = { test: 'Test 1', entity: 'LLC', owners: '1', agreement: 'Yes', docsOk: false, placeholders: false, keyContent: false, verdict: 'ERROR', details: [e.message] };
  }

  try {
    result7 = await runTest7(browser);
  } catch (e) {
    console.error('Test 7 outer error:', e.message);
    result7 = { test: 'Test 7', entity: 'LLC', owners: '2', agreement: 'No', docsOk: false, placeholders: false, keyContent: false, verdict: 'ERROR', details: [e.message] };
  }

  await browser.close();

  // ==================== SUMMARY TABLE ====================
  console.log('\n\n' + '='.repeat(120));
  console.log('  FINAL SUMMARY TABLE');
  console.log('='.repeat(120));

  const header =
    padRight('Test', 10) +
    padRight('Entity', 8) +
    padRight('Owners', 28) +
    padRight('Agreement', 11) +
    padRight('Docs OK', 10) +
    padRight('Placeholders', 14) +
    padRight('Key Content', 14) +
    'Verdict';

  console.log(header);
  console.log('-'.repeat(120));

  for (const r of [result1, result7]) {
    const row =
      padRight(r.test, 10) +
      padRight(r.entity, 8) +
      padRight(r.owners, 28) +
      padRight(r.agreement, 11) +
      padRight(r.docsOk ? 'PASS' : 'FAIL', 10) +
      padRight(r.placeholders ? 'PASS' : 'FAIL', 14) +
      padRight(r.keyContent ? 'PASS' : 'FAIL', 14) +
      r.verdict;
    console.log(row);
    if (r.details && r.details.length > 0) {
      for (const d of r.details) {
        console.log('          -> ' + d);
      }
    }
  }

  console.log('-'.repeat(120));

  const allPass = result1.verdict === 'PASS' && result7.verdict === 'PASS';
  console.log(`\nOVERALL: ${allPass ? 'ALL TESTS PASS' : 'SOME TESTS FAILED'}`);

  // Save results JSON
  const summaryPath = join(DIR, 'test_results.json');
  writeFileSync(summaryPath, JSON.stringify({
    timestamp: TIMESTAMP,
    tests: [result1, result7],
    overall: allPass ? 'PASS' : 'FAIL',
  }, null, 2));
  console.log(`\nResults saved to: ${summaryPath}`);
  console.log('Screenshots: ' + DIR);
  console.log('Total screenshots: ' + shotN);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
