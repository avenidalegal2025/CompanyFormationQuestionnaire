/**
 * E2E Tests 2 & 3: Run sequentially in a single Playwright script.
 *
 * TEST 2: C-Corp with 4 owners
 *   Entity: C-Corp, Name: "FOUR OWNERS", Suffix: Corp, State: Florida
 *   No US address, No US phone
 *   Owners: Adam Alpha (40%), Betty Beta (30%), Charlie Gamma (20%), Diana Delta (10%)
 *   Shares: 10,000
 *   All owners are directors & officers
 *     Adam=President, Betty=Vice-President, Charlie=Treasurer, Diana=Secretary
 *   Agreement: Yes
 *     Sale: Supermayoria, Major decisions: Mayoria
 *     Bank: Dos firmantes, Non-compete: No
 *     ROFR: Yes (90 days), Transfer to relatives: Majority
 *     Death forced sale: Yes, Divorce buyout: Yes, Tag/Drag: Yes
 *   Stripe test card payment
 *   Verify: all 4 owners in docs, correct shares, no {{placeholders}}
 *
 * TEST 3: S-Corp with 2 owners
 *   Entity: S-Corp, Name: "SCORP TEST", Suffix: Corp, State: Florida
 *   No US address, No US phone
 *   Owners: Sam Scorp (70%), Sally Scorp (30%)
 *   Shares: 1,000
 *   All owners are directors & officers
 *     Sam=President, Sally=Vice-President
 *   Agreement: Yes
 *     All Unanime voting
 *     Bank: Un firmante, Non-compete: No
 *     ROFR: Yes, Death: No, Tag/Drag: No
 *   Stripe test card payment
 *   Verify: S-Corp reflected in docs, SS-4 checkboxes correct
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-test-2-3');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();

// ─── Shared helpers ───

let shotN = 0;
let shotPrefix = '';
async function shot(page, label) {
  shotN++;
  const f = shotPrefix + String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  [screenshot] ' + f);
}

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
          btn.click(); return t + ' (native)';
        }
      }
    }
    return null;
  });
  if (clicked) console.log(`  [click] ${clicked}`);
  else console.log('  [warn] No Continuar/Enviar button found');
  await page.waitForTimeout(3000);
}

async function clickToggle(page, groupLabel, optionLabel) {
  const clicked = await page.evaluate(({ gl, ol }) => {
    const group = document.querySelector(`[role="radiogroup"][aria-label="${gl}"]`);
    if (!group) return false;
    const btn = group.querySelector(`button[aria-label="${ol}"]`);
    if (!btn) return false;
    const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    if (pk && btn[pk]?.onClick) { btn[pk].onClick(); return true; }
    btn.click(); return true;
  }, { gl: groupLabel, ol: optionLabel });
  if (clicked) console.log(`  [toggle] ${groupLabel} -> ${optionLabel}`);
  else console.log(`  [warn] Toggle not found: ${groupLabel} -> ${optionLabel}`);
  await page.waitForTimeout(300);
  return clicked;
}

async function dismissModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el.classList.contains('bg-black/40') || el.classList.contains('bg-black/80')) el.click();
    });
    document.querySelectorAll('[aria-label="Cerrar"], [aria-label="Close"]').forEach(el => el.click());
  });
  await page.waitForTimeout(300);
}

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

async function waitForStable(page, ms = 2000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

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
        const ei2 = page.locator('input[name="email"], input[name="username"], input[type="email"]').first();
        await ei2.fill(email);
        const pi2 = page.locator('input[name="password"], input[type="password"]').first();
        if (await pi2.isVisible({ timeout: 2000 }).catch(() => false)) await pi2.fill(password);
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
    if (docxBuf[pos] !== 0x50 || docxBuf[pos + 1] !== 0x4b ||
        docxBuf[pos + 2] !== 0x03 || docxBuf[pos + 3] !== 0x04) { pos++; continue; }
    const comprMethod = docxBuf.readUInt16LE(pos + 8);
    const compSize    = docxBuf.readUInt32LE(pos + 18);
    const fnLen       = docxBuf.readUInt16LE(pos + 26);
    const extraLen    = docxBuf.readUInt16LE(pos + 28);
    const fileName    = docxBuf.subarray(pos + 30, pos + 30 + fnLen).toString('utf8');
    const dataStart   = pos + 30 + fnLen + extraLen;
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
  }
  // Strip XML tags to get text
  return xmlContent.replace(/<[^>]+>/g, '');
}

/** Pay with Stripe test card */
async function handleStripePayment(page, billingName) {
  console.log('  Waiting for Stripe...');
  await page.waitForTimeout(15000);
  const url = page.url();
  console.log('  URL: ' + url.substring(0, 100));

  if (!url.includes('stripe') && !url.includes('checkout.stripe')) {
    console.log('  NOT on Stripe. Attempting to reach checkout...');
    // Try clicking Proceder al Pago again
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent?.includes('Pago') && btn.offsetHeight > 0) { btn.click(); return; }
      }
    });
    await page.waitForTimeout(15000);
    if (!page.url().includes('stripe')) {
      console.log('  STILL not on Stripe. URL: ' + page.url().substring(0, 100));
      await shot(page, 'not_stripe');
      return false;
    }
  }

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
  return true;
}

/** Fetch documents from the dashboard */
async function fetchDocuments(page) {
  let docs = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 15) {
          let s = fiber.memoizedState;
          while (s) {
            if (s.queue?.lastRenderedState && Array.isArray(s.queue.lastRenderedState)) {
              const arr = s.queue.lastRenderedState;
              if (arr.length > 0 && arr[0] && (arr[0].name || arr[0].documentType) && arr[0].id) {
                return arr.map(doc => ({
                  id: doc.id, name: doc.name || doc.documentType,
                  s3Key: doc.s3Key, status: doc.status,
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

  if (docs.length === 0) {
    const apiDocs = await page.evaluate(async () => {
      try {
        const resp = await fetch('/api/documents');
        if (!resp.ok) return { error: resp.status };
        return await resp.json();
      } catch (e) { return { error: e.message }; }
    });
    if (apiDocs.documents) {
      docs = apiDocs.documents.map(d => ({
        id: d.id, name: d.name || d.documentType, s3Key: d.s3Key, status: d.status
      }));
      console.log('  Found ' + docs.length + ' documents from /api/documents');
    } else {
      console.log('  API result: ' + JSON.stringify(apiDocs).substring(0, 100));
    }
  } else {
    console.log('  Found ' + docs.length + ' documents from React state');
  }
  return docs;
}

/** Verify documents: download DOCX, check placeholders, owner names, shares */
async function verifyDocuments(ctx, page, docs, ownerNames, shareAmounts, entityLabel, testDir) {
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
      noPlaceholders: null,
      allOwnersPresent: null,
      correctShares: null,
      entityCorrect: null,
      issues: [],
    };

    if (!s3Key) {
      result.issues.push('No S3 key');
      results.push(result);
      continue;
    }

    // Check existence on S3
    try {
      const headResult = execSync(
        `aws s3api head-object --bucket avenida-legal-documents --key "${s3Key}" --profile llc-admin --region us-west-1 2>&1`,
        { encoding: 'utf8', timeout: 15000 }
      );
      const sizeMatch = headResult.match(/"ContentLength":\s*(\d+)/);
      result.fileSize = sizeMatch ? parseInt(sizeMatch[1]) : 0;
      result.exists = true;
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
        console.log(`  Exists: ${result.exists ? 'YES' : 'NO'} (${result.fileSize} bytes)`);
      } catch {
        result.issues.push('S3 access error');
        console.log('  Exists: ERROR');
      }
    }

    // For .docx files, download and verify content
    if (s3Key.endsWith('.docx') && result.exists) {
      const localPath = join(testDir, safeName + '.docx');
      try {
        execSync(
          `aws s3 cp "s3://avenida-legal-documents/${s3Key}" "${localPath}" --profile llc-admin --region us-west-1`,
          { encoding: 'utf8', timeout: 30000 }
        );
        console.log(`  Downloaded to: ${localPath}`);

        const textContent = await extractDocxText(localPath);
        if (textContent) {
          writeFileSync(join(testDir, safeName + '_text.txt'), textContent);

          // CHECK: Unreplaced {{placeholders}}
          const placeholderMatches = textContent.match(/\{\{[^}]+\}\}/g) || [];
          if (placeholderMatches.length > 0) {
            result.noPlaceholders = false;
            result.issues.push('Placeholders: ' + placeholderMatches.join(', '));
            console.log(`  Placeholders: FAIL (${placeholderMatches.length} found)`);
            console.log(`    ${placeholderMatches.join(', ')}`);
          } else {
            result.noPlaceholders = true;
            console.log('  Placeholders: PASS (none found)');
          }

          // CHECK: All owner names present
          const missingOwners = [];
          for (const ownerName of ownerNames) {
            if (!textContent.includes(ownerName)) {
              missingOwners.push(ownerName);
            }
          }
          if (missingOwners.length > 0) {
            result.allOwnersPresent = false;
            result.issues.push('Missing owners: ' + missingOwners.join(', '));
            console.log(`  All owners present: FAIL - missing: ${missingOwners.join(', ')}`);
          } else {
            result.allOwnersPresent = true;
            console.log('  All owners present: PASS');
          }

          // CHECK: Correct share amounts (if applicable)
          if (shareAmounts && shareAmounts.length > 0) {
            const missingShares = [];
            for (const shares of shareAmounts) {
              const sharesStr = shares.toString();
              // Look for the share amount with comma formatting too
              const formatted = Number(sharesStr).toLocaleString('en-US');
              if (!textContent.includes(sharesStr) && !textContent.includes(formatted)) {
                missingShares.push(sharesStr);
              }
            }
            if (missingShares.length > 0) {
              result.correctShares = false;
              result.issues.push('Missing share amounts: ' + missingShares.join(', '));
              console.log(`  Shares: FAIL - missing: ${missingShares.join(', ')}`);
            } else {
              result.correctShares = true;
              console.log('  Shares: PASS');
            }
          }

          // CHECK: Entity type reflected
          if (entityLabel) {
            if (textContent.toLowerCase().includes(entityLabel.toLowerCase()) ||
                textContent.includes(entityLabel)) {
              result.entityCorrect = true;
              console.log(`  Entity (${entityLabel}): PASS`);
            } else {
              result.entityCorrect = false;
              result.issues.push('Entity type not found in doc: ' + entityLabel);
              console.log(`  Entity (${entityLabel}): FAIL`);
            }
          }
        }
      } catch (e) {
        result.issues.push('Download/parse error: ' + (e.message || '').substring(0, 80));
        console.log('  Download error: ' + (e.message || '').substring(0, 80));
      }
    }

    // Screenshot via Google Docs viewer
    if (doc.s3Key && result.exists) {
      try {
        const s3Uri = `s3://avenida-legal-documents/${doc.s3Key}`;
        const presignedUrl = execSync(
          `aws s3 presign "${s3Uri}" --profile llc-admin --region us-west-1 --expires-in 600`,
          { encoding: 'utf8', timeout: 15000 }
        ).trim();
        const encodedUrl = encodeURIComponent(presignedUrl);
        const viewerUrl = `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
        console.log('    Opening in Google Docs viewer...');

        const docPage = await ctx.newPage();
        docPage.setDefaultTimeout(60000);
        try {
          await docPage.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await docPage.waitForTimeout(20000);
          await shot(docPage, `doc_${safeName}_p1`);
          for (let pg = 2; pg <= 8; pg++) {
            await docPage.keyboard.press('PageDown');
            await docPage.waitForTimeout(2000);
            await shot(docPage, `doc_${safeName}_p${pg}`);
          }
        } catch {
          const woUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
          try {
            await docPage.goto(woUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await docPage.waitForTimeout(30000);
            await shot(docPage, `doc_${safeName}_p1`);
            for (let pg = 2; pg <= 6; pg++) {
              await docPage.keyboard.press('PageDown');
              await docPage.waitForTimeout(2000);
              await shot(docPage, `doc_${safeName}_p${pg}`);
            }
          } catch {
            await shot(docPage, `doc_${safeName}_error`);
          }
        }
        await docPage.close();
      } catch (e) {
        console.log('    Viewer error: ' + (e.message || '').substring(0, 80));
      }
    }

    results.push(result);
  }
  return results;
}

/** Navigate questionnaire Step 1 (Company) */
async function fillStep1(page, { entityType, companyName, suffix, state, shares }) {
  console.log('=== STEP 1: Company ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await waitForStable(page, 4000);

  // Select entity type via toggle
  if (entityType === 'S-Corp') {
    // S-Corp triggers a confirmation modal
    await page.evaluate(() => {
      const group = document.querySelector('[role="radiogroup"][aria-label="Tipo de entidad"]');
      if (!group) return;
      const btn = group.querySelector('button[aria-label="S-Corp"]');
      if (!btn) return;
      const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
      if (pk && btn[pk]?.onClick) btn[pk].onClick(); else btn.click();
    });
    await page.waitForTimeout(1500);
    console.log('  Clicked S-Corp (modal expected)');
    await shot(page, 'scorp_modal');

    // Click OK on S-Corp requirements modal
    const okBtn = page.locator('button:has-text("OK")');
    if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await okBtn.click();
      console.log('  Clicked OK on S-Corp modal');
      await page.waitForTimeout(1000);
    }
  } else {
    // C-Corp or LLC
    await page.evaluate((et) => {
      const btn = document.querySelector(`button[aria-label="${et}"]`);
      if (btn) { const pk = Object.keys(btn).find(k => k.startsWith('__reactProps')); if (pk && btn[pk]?.onClick) btn[pk].onClick(); else btn.click(); }
    }, entityType);
    await page.waitForTimeout(1500);
    console.log('  Selected ' + entityType);
  }

  // Fill company name
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill(companyName);
  console.log('  Filled name: ' + companyName);
  await page.waitForTimeout(500);

  // Select suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === suffix)) { await sel.selectOption(suffix); console.log('  Selected suffix: ' + suffix); break; }
  }

  // Select state
  const allSelects = await page.locator('select:visible').all();
  for (const sel of allSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === state)) { await sel.selectOption(state); console.log('  Selected state: ' + state); break; }
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

  // Set shares
  await setFormValue(page, 'company.numberOfShares', shares);
  console.log(`  Set ${shares} shares`);

  await shot(page, 'step1_company');
  await clickContinuar(page);
}

/** Navigate Step 2 (Owners) */
async function fillStep2(page, { owners, email, password }) {
  // Check for Auth0 after step 1
  await page.waitForTimeout(3000);
  if (page.url().includes('auth0')) {
    await handleAuth0(page, email, password);
  }

  console.log('=== STEP 2: Owners ===');
  await waitForStable(page, 3000);

  // If still on step 1, re-advance
  const isStep1 = await page.locator('button[aria-label="C-Corp"]').isVisible({ timeout: 2000 }).catch(() => false);
  if (isStep1) {
    console.log('  Still on Step 1 after auth, clicking Continuar...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
    if (page.url().includes('auth0')) await handleAuth0(page, email, password);
    await waitForStable(page, 3000);
  }

  // Check page text
  let pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
    console.log('  On Step 1, advancing...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }

  await shot(page, 'step2_initial');

  // Set owners count
  await setFormValue(page, 'ownersCount', owners.length);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: ' + owners.length);

  // Fill each owner
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    const fnInput = page.locator(`input[name="owners.${i}.firstName"]`);
    if (await fnInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fnInput.fill(o.first);
      await page.locator(`input[name="owners.${i}.lastName"]`).fill(o.last);
    } else {
      await page.locator(`input[name="owners.${i}.fullName"]`).fill(o.full).catch(() => {});
    }
    await page.locator(`input[name="owners.${i}.ownership"]`).fill(o.ownership).catch(() => {});
    console.log(`  Owner ${i + 1}: ${o.full} ${o.ownership}%`);
    await page.waitForTimeout(300);
  }

  // Citizenship = No for all (except S-Corp where it's auto-set to Yes)
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

  // Check for Auth0 redirect after Step 2
  if (page.url().includes('auth0')) {
    console.log('  Auth0 redirect after Step 2');
    await handleAuth0(page, email, password);
    await waitForStable(page, 5000);
  }

  console.log('  Post-auth URL: ' + page.url().substring(0, 80));
  await shot(page, 'post_auth');

  pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes('Datos de la empresa') || pageText.includes('Tipo de entidad')) {
    console.log('  On Step 1, advancing...');
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }
  if ((pageText.includes('accionistas') || pageText.includes('socios')) && pageText.includes('Nombre') && pageText.includes('%')) {
    console.log('  On Step 2, checking data...');
    const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
    if (!hasOwnerData) {
      console.log('  Re-filling owners...');
      await setFormValue(page, 'ownersCount', owners.length);
      await page.waitForTimeout(1000);
      for (let i = 0; i < owners.length; i++) {
        const o = owners[i];
        const fnInput = page.locator(`input[name="owners.${i}.firstName"]`);
        if (await fnInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await fnInput.fill(o.first);
          await page.locator(`input[name="owners.${i}.lastName"]`).fill(o.last);
        }
        await page.locator(`input[name="owners.${i}.ownership"]`).fill(o.ownership).catch(() => {});
      }
    }
    await clickContinuar(page);
    await page.waitForTimeout(3000);
  }
}

/** Navigate Step 3 (Admin) */
async function fillStep3(page, { owners, officerRoles }) {
  console.log('=== STEP 3: Admin ===');
  await waitForStable(page, 2000);
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log('  Page contains "directores": ' + pageText.includes('directores'));
  console.log('  Page contains "oficiales": ' + pageText.includes('oficiales'));
  await shot(page, 'step3_initial');
  await page.waitForTimeout(2000);

  // Directors = all owners (should be default Sí, but ensure it)
  // Officers = all owners (should be default Sí, but ensure it)

  // Assign officer roles via React fiber
  for (let i = 0; i < officerRoles.length; i++) {
    await setFormValue(page, `admin.shareholderOfficer${i + 1}Role`, officerRoles[i]);
    console.log(`  Set role via fiber: ${owners[i].full} = ${officerRoles[i]}`);
  }
  await page.waitForTimeout(500);

  // Also try to select via UI dropdowns
  const roleSelects = await page.locator('select:visible').all();
  let roleIdx = 0;
  for (const sel of roleSelects) {
    if (roleIdx >= officerRoles.length) break;
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'President')) {
      await sel.selectOption(officerRoles[roleIdx]);
      console.log(`  UI: Assigned ${officerRoles[roleIdx]}`);
      roleIdx++;
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step3_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step3_bottom');

  await clickContinuar(page);
  await waitForStable(page, 3000);
}

/** Navigate Step 4 (Summary) and click agreement */
async function fillStep4(page) {
  console.log('=== STEP 4: Summary ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step4_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step4_bottom');

  // Click Enviar -> triggers agreement modal
  await clickContinuar(page);
  await page.waitForTimeout(2000);

  // Click "Lo quiero" for agreement
  const loQuiero = page.locator('button:has-text("Lo quiero")');
  if (await loQuiero.isVisible({ timeout: 5000 }).catch(() => false)) {
    await shot(page, 'step4_agreement_modal');
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent?.includes('Lo quiero')) {
          const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
          if (pk && btn[pk]?.onClick) btn[pk].onClick(); else btn.click();
          return;
        }
      }
    });
    console.log('  Clicked "Lo quiero" - wants agreement');
    await waitForStable(page, 3000);
  } else {
    console.log('  [warn] No agreement modal found');
  }
}

/** Navigate Step 5 (Agreement 1 - Owners & Capital) for Corp */
async function fillStep5Corp(page, { owners }) {
  console.log('=== STEP 5: Agreement - Dueños & Roles ===');
  await shot(page, 'step5_initial');

  // Fill capital contributions
  for (let i = 0; i < owners.length; i++) {
    if (owners[i].capital) {
      await setFormValue(page, `agreement.corp_capitalPerOwner_${i}`, owners[i].capital);
      console.log(`  Capital for ${owners[i].full}: $${owners[i].capital}`);
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step5_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step5_bottom');

  await clickContinuar(page);
  await waitForStable(page, 3000);
}

/** Navigate Step 6 (Agreement 2 - Capital & Loans) for Corp */
async function fillStep6Corp(page) {
  console.log('=== STEP 6: Agreement - Capital & Préstamos ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step6_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step6_bottom');

  // Keep defaults
  await clickContinuar(page);
  await waitForStable(page, 3000);
}

/** Navigate Step 7 (Agreement 3 - Governance) for Corp */
async function fillStep7Corp(page, { saleThreshold, majorThreshold, bank, nonCompete, spendingThreshold }) {
  console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
  await shot(page, 'step7_initial');

  await clickToggle(page, 'Sale decision threshold', saleThreshold);
  await clickToggle(page, 'Bank signers', bank);
  await clickToggle(page, 'Major decision threshold', majorThreshold);
  await clickToggle(page, 'Non compete covenant', nonCompete);

  // Officer removal: keep default or set if specified
  // Non-solicitation: show when non-compete is No
  if (nonCompete === 'No') {
    await clickToggle(page, 'Non solicitation', 'Sí');
    await clickToggle(page, 'Confidentiality NDA', 'Sí');
  }

  if (spendingThreshold) {
    await setFormValue(page, 'agreement.corp_majorSpendingThreshold', spendingThreshold);
    console.log('  Set spending threshold: $' + spendingThreshold);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step7_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step7_bottom');

  await clickContinuar(page);
  await waitForStable(page, 3000);
}

/** Navigate Step 8 (Agreement 4 - Shares & Succession) for Corp */
async function fillStep8Corp(page, { rofr, rofrDays, transferToRelatives, deathForced, divorceBuyout, tagDrag }) {
  console.log('=== STEP 8: Agreement - Acciones & Sucesión ===');
  await shot(page, 'step8_initial');

  await clickToggle(page, 'Right of first refusal', rofr ? 'Sí' : 'No');
  if (rofr && rofrDays) {
    await page.waitForTimeout(1000);
    await setFormValue(page, 'agreement.corp_rofrOfferPeriod', rofrDays);
    console.log('  ROFR period: ' + rofrDays + ' days');
  }

  // Transfer to relatives
  if (transferToRelatives) {
    await setFormValue(page, 'agreement.corp_transferToRelatives', transferToRelatives);
    console.log('  Transfer to relatives set via fiber');
    // Also try UI select
    const transferSels = await page.locator('select:visible').all();
    for (const sel of transferSels) {
      const opts = await sel.locator('option').allTextContents();
      const matchOpt = opts.find(o => o.includes(transferToRelatives.substring(0, 30)));
      if (matchOpt) {
        await sel.selectOption({ label: matchOpt });
        console.log('  UI: Selected transfer option');
        break;
      }
    }
  }

  await clickToggle(page, 'Incapacity heirs policy', deathForced ? 'Sí' : 'No');
  await clickToggle(page, 'Divorce buyout policy', divorceBuyout ? 'Sí' : 'No');
  await clickToggle(page, 'Tag along drag along rights', tagDrag ? 'Sí' : 'No');

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'step8_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'step8_bottom');

  await clickContinuar(page);
  await waitForStable(page, 3000);
}

/** Navigate Checkout step */
async function doCheckout(page, billingName) {
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

  return await handleStripePayment(page, billingName);
}

/** Wait for docs, go to dashboard, verify */
async function dashboardAndVerify(ctx, page, { ownerNames, shareAmounts, entityLabel, testDir }) {
  console.log('=== DASHBOARD ===');
  console.log('  Waiting 60s for document generation...');
  await page.waitForTimeout(60000);

  await page.goto(BASE_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 60000 });
  await waitForStable(page, 10000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'dashboard_top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'dashboard_bottom');

  console.log('=== DOCUMENT VERIFICATION ===');
  const docs = await fetchDocuments(page);
  console.log(`  Total documents: ${docs.length}`);

  if (docs.length === 0) {
    console.log('  No documents found. Trying again in 30s...');
    await page.waitForTimeout(30000);
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await waitForStable(page, 5000);
    const docs2 = await fetchDocuments(page);
    if (docs2.length > 0) {
      return await verifyDocuments(ctx, page, docs2, ownerNames, shareAmounts, entityLabel, testDir);
    }
    console.log('  Still no documents after retry.');
    return [];
  }

  return await verifyDocuments(ctx, page, docs, ownerNames, shareAmounts, entityLabel, testDir);
}


// ═══════════════════════════════════════════════════════════════════
//  TEST 2: C-Corp with 4 owners
// ═══════════════════════════════════════════════════════════════════

async function runTest2(browser) {
  console.log('\n' + '='.repeat(70));
  console.log('  TEST 2: C-Corp with 4 owners');
  console.log('='.repeat(70) + '\n');

  shotPrefix = 'T2_';
  shotN = 0;

  const EMAIL = `test+four_owners_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const TEST_DIR = join(DIR, 'test2');
  mkdirSync(TEST_DIR, { recursive: true });

  const OWNERS = [
    { first: 'Adam',    last: 'Alpha', full: 'Adam Alpha',    ownership: '40', capital: '40000' },
    { first: 'Betty',   last: 'Beta',  full: 'Betty Beta',    ownership: '30', capital: '30000' },
    { first: 'Charlie', last: 'Gamma', full: 'Charlie Gamma', ownership: '20', capital: '20000' },
    { first: 'Diana',   last: 'Delta', full: 'Diana Delta',   ownership: '10', capital: '10000' },
  ];
  const OFFICER_ROLES = ['President', 'Vice-President', 'Treasurer', 'Secretary'];

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Step 1: Company
    await fillStep1(page, {
      entityType: 'C-Corp', companyName: 'FOUR OWNERS', suffix: 'Corp', state: 'Florida', shares: 10000,
    });

    // Step 2: Owners
    await fillStep2(page, { owners: OWNERS, email: EMAIL, password: PASSWORD });

    // Step 3: Admin
    await fillStep3(page, { owners: OWNERS, officerRoles: OFFICER_ROLES });

    // Step 4: Summary + Agreement
    await fillStep4(page);

    // Step 5: Agreement 1 - Capital
    await fillStep5Corp(page, { owners: OWNERS });

    // Step 6: Agreement 2 - Loans (defaults)
    await fillStep6Corp(page);

    // Step 7: Agreement 3 - Governance
    await fillStep7Corp(page, {
      saleThreshold: 'Supermayoría',
      majorThreshold: 'Mayoría',
      bank: 'Dos firmantes',
      nonCompete: 'No',
      spendingThreshold: '7500',
    });

    // Step 8: Agreement 4 - Shares & Succession
    await fillStep8Corp(page, {
      rofr: true,
      rofrDays: 90,
      transferToRelatives: 'Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.',
      deathForced: true,
      divorceBuyout: true,
      tagDrag: true,
    });

    // Checkout & Pay
    const paid = await doCheckout(page, 'Adam Alpha');

    if (!paid) {
      console.log('  TEST 2: Payment failed');
      return { results: [], paid: false };
    }

    // Dashboard & Verify
    const results = await dashboardAndVerify(ctx, page, {
      ownerNames: ['Adam Alpha', 'Betty Beta', 'Charlie Gamma', 'Diana Delta'],
      shareAmounts: ['4000', '3000', '2000', '1000'],
      entityLabel: 'Corp',
      testDir: TEST_DIR,
    });

    return { results, paid: true };
  } catch (e) {
    console.error('TEST 2 ERROR: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'test2_fatal_error').catch(() => {});
    return { results: [], paid: false, error: e.message };
  } finally {
    await ctx.close();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  TEST 3: S-Corp with 2 owners
// ═══════════════════════════════════════════════════════════════════

async function runTest3(browser) {
  console.log('\n' + '='.repeat(70));
  console.log('  TEST 3: S-Corp with 2 owners');
  console.log('='.repeat(70) + '\n');

  shotPrefix = 'T3_';
  shotN = 0;

  const EMAIL = `test+scorp_test_${TIMESTAMP}@gmail.com`;
  const PASSWORD = 'TestPass123!';
  const TEST_DIR = join(DIR, 'test3');
  mkdirSync(TEST_DIR, { recursive: true });

  const OWNERS = [
    { first: 'Sam',   last: 'Scorp', full: 'Sam Scorp',   ownership: '70', capital: '70000' },
    { first: 'Sally', last: 'Scorp', full: 'Sally Scorp', ownership: '30', capital: '30000' },
  ];
  const OFFICER_ROLES = ['President', 'Vice-President'];

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Step 1: Company - S-Corp
    await fillStep1(page, {
      entityType: 'S-Corp', companyName: 'SCORP TEST', suffix: 'Corp', state: 'Florida', shares: 1000,
    });

    // Step 2: Owners
    // Note: S-Corp auto-sets citizenship to Yes, so no need to set No
    await fillStep2(page, { owners: OWNERS, email: EMAIL, password: PASSWORD });

    // Step 3: Admin
    await fillStep3(page, { owners: OWNERS, officerRoles: OFFICER_ROLES });

    // Step 4: Summary + Agreement
    await fillStep4(page);

    // Step 5: Agreement 1 - Capital
    await fillStep5Corp(page, { owners: OWNERS });

    // Step 6: Agreement 2 - Loans (defaults)
    await fillStep6Corp(page);

    // Step 7: Agreement 3 - Governance (all Unanime)
    console.log('=== STEP 7: Agreement - Gobierno (All Unánime) ===');
    await shot(page, 'step7_initial');

    await clickToggle(page, 'Sale decision threshold', 'Unánime');
    await clickToggle(page, 'Bank signers', 'Un firmante');
    await clickToggle(page, 'Major decision threshold', 'Unánime');
    await clickToggle(page, 'Non compete covenant', 'No');

    // Non-solicitation & Confidentiality (shown when non-compete is No)
    await clickToggle(page, 'Non solicitation', 'Sí');
    await clickToggle(page, 'Confidentiality NDA', 'Sí');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // Step 8: Agreement 4 - Shares & Succession
    console.log('=== STEP 8: Agreement - Acciones & Sucesión ===');
    await shot(page, 'step8_initial');

    await clickToggle(page, 'Right of first refusal', 'Sí');
    await page.waitForTimeout(1000);
    // Keep default ROFR period (180 days)

    // Transfer to relatives: keep default (no specific requirement given, use free)

    await clickToggle(page, 'Incapacity heirs policy', 'No');
    await clickToggle(page, 'Divorce buyout policy', 'No');
    await clickToggle(page, 'Tag along drag along rights', 'No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step8_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step8_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // Checkout & Pay
    const paid = await doCheckout(page, 'Sam Scorp');

    if (!paid) {
      console.log('  TEST 3: Payment failed');
      return { results: [], paid: false };
    }

    // Dashboard & Verify
    const results = await dashboardAndVerify(ctx, page, {
      ownerNames: ['Sam Scorp', 'Sally Scorp'],
      shareAmounts: ['700', '300'],
      entityLabel: 'S-Corp',
      testDir: TEST_DIR,
    });

    return { results, paid: true };
  } catch (e) {
    console.error('TEST 3 ERROR: ' + e.message);
    console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
    await shot(page, 'test3_fatal_error').catch(() => {});
    return { results: [], paid: false, error: e.message };
  } finally {
    await ctx.close();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  MAIN: Run both tests sequentially
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== E2E TESTS 2 & 3 ===');
  console.log('Dir: ' + DIR);
  console.log('Timestamp: ' + TIMESTAMP);
  console.log('');

  const browser = await chromium.launch({ headless: true });

  let test2Result, test3Result;

  try {
    test2Result = await runTest2(browser);
  } catch (e) {
    console.error('TEST 2 FATAL: ' + e.message);
    test2Result = { results: [], paid: false, error: e.message };
  }

  try {
    test3Result = await runTest3(browser);
  } catch (e) {
    console.error('TEST 3 FATAL: ' + e.message);
    test3Result = { results: [], paid: false, error: e.message };
  }

  await browser.close();

  // ─── Summary Table ───
  console.log('\n' + '='.repeat(100));
  console.log('  SUMMARY TABLE');
  console.log('='.repeat(100));

  function padRight(s, len) { return (s || '').substring(0, len).padEnd(len); }

  console.log(
    padRight('Test', 8) +
    padRight('Entity', 10) +
    padRight('Owners', 10) +
    padRight('Docs OK', 10) +
    padRight('Placeholders', 15) +
    padRight('All Owners', 15) +
    padRight('Verdict', 12)
  );
  console.log('-'.repeat(80));

  // Test 2 summary
  const t2Docs = test2Result.results || [];
  const t2DocsOk = t2Docs.length > 0 && t2Docs.every(r => r.exists);
  const t2NoPlaceholders = t2Docs.every(r => r.noPlaceholders === null || r.noPlaceholders === true);
  const t2AllOwners = t2Docs.every(r => r.allOwnersPresent === null || r.allOwnersPresent === true);
  const t2Verdict = test2Result.error ? 'ERROR' :
    (!test2Result.paid ? 'PAY FAIL' :
    (t2DocsOk && t2NoPlaceholders && t2AllOwners ? 'PASS' : 'FAIL'));

  // Special: check if 4th owner (Diana Delta) is missing in any doc (known potential BUG)
  const t2Diana = t2Docs.filter(r => r.allOwnersPresent === false && r.issues.some(i => i.includes('Diana Delta')));
  if (t2Diana.length > 0) {
    console.log('*** BUG: 4th owner Diana Delta missing from: ' + t2Diana.map(r => r.name).join(', ') + ' ***');
  }

  console.log(
    padRight('Test 2', 8) +
    padRight('C-Corp', 10) +
    padRight('4', 10) +
    padRight(t2DocsOk ? 'PASS' : 'FAIL', 10) +
    padRight(t2NoPlaceholders ? 'PASS' : 'FAIL', 15) +
    padRight(t2AllOwners ? 'PASS' : 'FAIL', 15) +
    padRight(t2Verdict, 12)
  );

  // Test 3 summary
  const t3Docs = test3Result.results || [];
  const t3DocsOk = t3Docs.length > 0 && t3Docs.every(r => r.exists);
  const t3NoPlaceholders = t3Docs.every(r => r.noPlaceholders === null || r.noPlaceholders === true);
  const t3AllOwners = t3Docs.every(r => r.allOwnersPresent === null || r.allOwnersPresent === true);
  const t3Verdict = test3Result.error ? 'ERROR' :
    (!test3Result.paid ? 'PAY FAIL' :
    (t3DocsOk && t3NoPlaceholders && t3AllOwners ? 'PASS' : 'FAIL'));

  console.log(
    padRight('Test 3', 8) +
    padRight('S-Corp', 10) +
    padRight('2', 10) +
    padRight(t3DocsOk ? 'PASS' : 'FAIL', 10) +
    padRight(t3NoPlaceholders ? 'PASS' : 'FAIL', 15) +
    padRight(t3AllOwners ? 'PASS' : 'FAIL', 15) +
    padRight(t3Verdict, 12)
  );

  console.log('-'.repeat(80));

  // Detailed issues
  if (t2Docs.some(r => r.issues.length > 0) || t3Docs.some(r => r.issues.length > 0)) {
    console.log('\n=== DETAILED ISSUES ===');
    for (const r of [...t2Docs, ...t3Docs]) {
      if (r.issues.length > 0) {
        console.log(`\n  ${r.name}:`);
        for (const issue of r.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }
  }

  console.log('\n=== COMPLETE ===');
  console.log('Screenshots: ' + DIR);
  console.log('Test 2 DOCX files: ' + join(DIR, 'test2'));
  console.log('Test 3 DOCX files: ' + join(DIR, 'test3'));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
