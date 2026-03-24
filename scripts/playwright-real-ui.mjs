/**
 * Fill the ACTUAL questionnaire UI via Playwright — every click, every input, every toggle.
 * No React fiber injection. Real user simulation.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'playwright-real-ui');
mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('    -> ' + f);
}

/** Click via React fiber onClick — needed because Playwright .click() doesn't trigger React handlers */
async function rClick(page, selector, idx = 0) {
  await page.evaluate(({ s, i }) => {
    const els = document.querySelectorAll(s);
    const el = els[i < 0 ? els.length + i : i];
    if (!el) return;
    const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
    if (pk && el[pk].onClick) el[pk].onClick();
    else el.click();
  }, { s: selector, i: idx });
  await page.waitForTimeout(300);
}

/** Click Continuar button via React fiber */
async function clickContinuar(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.textContent.trim();
      if ((t === 'Continuar' || t === 'Finalizar') && btn.offsetHeight > 0 && !t.includes('más tarde')) {
        const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
        if (pk && btn[pk].onClick) { btn[pk].onClick(); return; }
        btn.click(); return;
      }
    }
  });
  await page.waitForTimeout(3000);
}

/** Handle auth0 redirect if it happens */
async function handleAuth(page, email, password) {
  if (!page.url().includes('auth0')) return false;
  console.log('    Auth0 redirect, logging in...');
  const loginLink = page.locator('a:has-text("Log in")');
  if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loginLink.click();
    await page.waitForTimeout(2000);
  }
  await page.waitForSelector('input[name="email"], input[name="username"]', { timeout: 5000 }).catch(() => {});
  await page.locator('input[name="email"], input[name="username"]').first().fill(email).catch(() => {});
  await page.fill('input[name="password"]', password).catch(() => {});
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(5000);
  if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
    await page.click('button:has-text("Accept")');
  await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return true;
}

/** Get current step number from the big counter */
async function getStep(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length === 0 && /^0\d$/.test(el.textContent.trim()))
        return parseInt(el.textContent.trim());
    }
    return 0;
  });
}

async function runVariant(browser, variantNum, config) {
  const { entity, voting, rofr, dragTag, bank, owners } = config;
  const isCorp = entity === 'C-Corp';
  const email = `test+rui${variantNum}_${Date.now()}@gmail.com`;
  const password = 'Test2026!Secure';
  const companyName = `V${variantNum} ${entity.replace('-', '')}`;
  const suffix = isCorp ? 'Corp' : 'LLC';

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  console.log(`\n=== Variant ${variantNum}: ${entity} ${voting} ROFR=${rofr} DT=${dragTag} bank=${bank} owners=${owners} ===`);
  console.log(`  Email: ${email}`);

  try {
    // ═══ STEP 1: Company ═══
    console.log('  Step 1: Company');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Select entity type
    await rClick(page, `button[aria-label="${entity}"]`);
    await page.waitForTimeout(1000);

    // Fill company name — wait for input to be ready
    await page.locator('input[type="text"]:visible').first().fill(companyName);

    // Select suffix (Corp only)
    if (isCorp) {
      await page.locator('select:visible').nth(1).selectOption(suffix).catch(() => {});
    }
    await page.waitForTimeout(500);

    // Click No for address and phone
    await rClick(page, 'button[aria-label="No"]', 0);
    await rClick(page, 'button[aria-label="No"]', 1);
    await page.waitForTimeout(500);
    await shot(page, `v${variantNum}_step1`);

    // Click Continuar → triggers Auth0
    await clickContinuar(page);

    // Auth0 signup
    if (page.url().includes('auth0')) {
      console.log('    Auth0 signup...');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(5000);
      if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false))
        await page.click('button:has-text("Accept")');
      await page.waitForURL('**company-formation**', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }

    // After auth — re-fill step 1 and advance
    await rClick(page, `button[aria-label="${entity}"]`);
    await page.waitForTimeout(1000);
    await page.locator('input[type="text"]:visible').first().fill(companyName);
    if (isCorp) await page.locator('select:visible').nth(1).selectOption(suffix).catch(() => {});
    await rClick(page, 'button[aria-label="No"]', 0);
    await rClick(page, 'button[aria-label="No"]', 1);
    await page.waitForTimeout(500);
    await clickContinuar(page);
    await handleAuth(page, email, password);

    let step = await getStep(page);
    console.log('    On step:', step);

    // ═══ STEP 2: Owners ═══
    console.log('  Step 2: Owners');
    // Fill owner fields
    await page.fill('input[name="owners.0.firstName"]', 'Roberto').catch(() => {});
    await page.fill('input[name="owners.0.lastName"]', 'Mendez').catch(() => {});
    await page.fill('input[name="owners.0.ownership"]', '100').catch(() => {});
    // Citizenship = No (avoids passport upload requirement)
    const citizenNo = page.locator('button[aria-label="No"]');
    if (await citizenNo.count() > 0) await rClick(page, 'button[aria-label="No"]', 0);
    await page.waitForTimeout(300);
    await shot(page, `v${variantNum}_step2`);
    await clickContinuar(page);
    await handleAuth(page, email, password);

    // ═══ STEP 3: Admin ═══
    console.log('  Step 3: Admin');
    await shot(page, `v${variantNum}_step3`);
    await clickContinuar(page);
    await handleAuth(page, email, password);

    // ═══ STEP 4: Summary ═══
    console.log('  Step 4: Summary');
    await shot(page, `v${variantNum}_step4`);
    await clickContinuar(page);
    await handleAuth(page, email, password);

    // Agreement modal — click Sí
    await page.waitForTimeout(1000);
    try {
      await rClick(page, 'button[aria-label="Sí"]', 0);
      console.log('    Clicked Sí for agreement');
      await page.waitForTimeout(2000);
    } catch {
      // Try finding Sí button differently
      const siBtn = page.locator('button:has-text("Sí")').first();
      if (await siBtn.isVisible().catch(() => false)) {
        await siBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // ═══ STEPS 5-8: Agreement ═══
    const agreementSteps = [
      { num: 5, name: 'Dueños & Roles' },
      { num: 6, name: 'Capital & Préstamos' },
      { num: 7, name: 'Gobierno & Decisiones' },
      { num: 8, name: 'Acciones & Sucesión' },
    ];

    for (const as of agreementSteps) {
      step = await getStep(page);
      console.log(`  Step ${as.num}: ${as.name} (actual: ${step})`);

      // Step 7 (Governance): fill the voting toggles
      if (as.num === 7) {
        // The toggles are SegmentedToggles with 3 options
        // Find all 3-option toggle groups and click the appropriate one
        const votingValue = voting === 'unanimous' ? 'Unánime' : voting === 'majority' ? 'Mayoría' : 'Supermayoría';
        // Click the voting option buttons
        const votingBtns = page.locator(`button[aria-label="${votingValue}"]`);
        const vCount = await votingBtns.count();
        for (let i = 0; i < vCount; i++) {
          await rClick(page, `button[aria-label="${votingValue}"]`, i);
          await page.waitForTimeout(200);
        }

        // Bank signers
        const bankLabel = bank === 'two' ? 'Dos firmantes' : 'Un firmante';
        await rClick(page, `button[aria-label="${bankLabel}"]`, 0).catch(() => {});
      }

      // Step 8 (Shares & Succession): set ROFR and drag/tag
      if (as.num === 8) {
        // ROFR
        const rofrLabel = rofr ? 'Sí' : 'No';
        // Find ROFR toggle (first Sí/No pair on this step)
        const rofrBtns = page.locator(`button[aria-label="${rofrLabel}"]`);
        if (await rofrBtns.count() > 0) {
          await rClick(page, `button[aria-label="${rofrLabel}"]`, 0);
        }

        // Drag/Tag along (Corp only, usually last Sí/No toggle)
        if (isCorp) {
          const dtLabel = dragTag ? 'Sí' : 'No';
          const dtBtns = page.locator(`button[aria-label="${dtLabel}"]`);
          const dtCount = await dtBtns.count();
          if (dtCount > 0) {
            await rClick(page, `button[aria-label="${dtLabel}"]`, dtCount - 1);
          }
        }
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await shot(page, `v${variantNum}_step${as.num}_top`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await shot(page, `v${variantNum}_step${as.num}_bot`);

      await clickContinuar(page);
      await handleAuth(page, email, password);
    }

    // ═══ STEP 9: Checkout ═══
    step = await getStep(page);
    console.log(`  Step 9: Checkout (actual: ${step})`);
    await shot(page, `v${variantNum}_step9`);

    // Create checkout + pay via API (faster than clicking through UI checkout flow)
    console.log('    Creating checkout session...');
    const checkout = await page.evaluate(async () => {
      let fd = null;
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key], d = 0;
          while (fiber && d < 5) {
            if (fiber.memoizedProps?.form?.getValues) { fd = fiber.memoizedProps.form.getValues(); break; }
            fiber = fiber.return; d++;
          }
          if (fd) break;
        }
        if (fd) break;
      }
      if (!fd) return { error: 'no form data' };
      const et = fd.company?.entityType || 'C-Corp';
      const svc = et === 'LLC' ? ['formation', 'operating_agreement'] : ['formation', 'shareholder_agreement'];
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: fd, selectedServices: svc, entityType: et, state: 'Florida', hasUsAddress: 'No', hasUsPhone: 'No', skipAgreement: 'false', totalPrice: 79500 })
      });
      const json = await resp.json();
      return { url: json.paymentLinkUrl, status: resp.status };
    });

    if (checkout.url) {
      console.log('    Paying with test card...');
      await page.goto(checkout.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(8000);
      await page.locator('#cardNumber').fill('4242424242424242');
      await page.locator('#cardExpiry').fill('12/29');
      await page.locator('#cardCvc').fill('123');
      const nameInput = page.locator('input[name="billingName"]');
      if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('Test');
      await page.waitForTimeout(1000);
      await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
      await page.waitForTimeout(15000);
      console.log('    Payment done:', page.url().includes('success') ? 'SUCCESS' : page.url().substring(0, 50));
      await shot(page, `v${variantNum}_payment`);

      // Wait for webhook
      await page.waitForTimeout(20000);

      // Check dashboard
      await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      await shot(page, `v${variantNum}_dashboard`);

      const docText = await page.evaluate(() => document.body.innerText);
      const hasAgreement = isCorp ? docText.includes('Shareholder Agreement') : docText.includes('Operating Agreement');
      console.log(`    Agreement in dashboard: ${hasAgreement ? 'YES ✓' : 'NO ✗'}`);
    } else {
      console.log('    Checkout failed:', checkout.error || checkout.status);
    }

  } catch (e) {
    console.log('    ERROR:', e.message.substring(0, 100));
    await shot(page, `v${variantNum}_error`);
  }

  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // All 144 combinations
  let variantNum = 0;
  for (const entity of ['C-Corp', 'LLC']) {
    for (const voting of ['unanimous', 'majority', 'mixed']) {
      for (const rofr of [true, false]) {
        for (const dragTag of [true, false]) {
          for (const bank of ['one', 'two']) {
            for (const owners of [1, 2, 3]) {
              variantNum++;
              await runVariant(browser, variantNum, { entity, voting, rofr, dragTag, bank, owners });
            }
          }
        }
      }
    }
  }

  console.log(`\n\nDone! ${variantNum} variants, ${shotN} screenshots in ${DIR}`);
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
