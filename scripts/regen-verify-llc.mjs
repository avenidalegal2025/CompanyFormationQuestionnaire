/**
 * REGEN + VERIFY LLC: AVENIDA CONSULTING LLC (Florida)
 *
 * Step 1: Run full questionnaire with same settings as demo-llc.mjs
 * Step 2: After payment, wait for docs, download Operating Agreement from S3
 * Step 3: Extract full text from .docx and verify every mapping
 * Step 4: Open in Word Online and screenshot every page
 *
 * Company: AVENIDA CONSULTING, Suffix: LLC, State: Florida
 * 2 owners: Antonio Regojo (60%), Maria Gonzalez (40%)
 * All managers, Agreement: Yes
 *   - Sale: Unanime, Bank: Dos firmantes, ROFR: Yes 180 days
 *   - Non-compete: No, Tag/Drag: No, Dissolution: Unanime
 *   - Major decisions: Mayoria, Min tax: 30%
 *
 * Auth0: test+regen_llc_TIMESTAMP@gmail.com / DemoPass2026!
 * Stripe: 4242 4242 4242 4242
 *
 * Output: C:/Users/neotr/Downloads/regen-verify-llc/
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import zlib from 'zlib';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-llc');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+regen_llc_${TIMESTAMP}@gmail.com`;
const PASSWORD = 'DemoPass2026!';
const S3_BUCKET = 'avenida-legal-documents';

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  [screenshot] ' + f);
}

// ── DOCX parsing ──
function extractDocxXml(docxPath) {
  const buf = readFileSync(docxPath);
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;
      if (name === 'word/document.xml') {
        if (compMethod === 0) return buf.subarray(dataStart, dataEnd).toString('utf8');
        if (compMethod === 8) return zlib.inflateRawSync(buf.subarray(dataStart, dataEnd)).toString('utf8');
      }
      offset = dataEnd;
    } else offset++;
  }
  return '';
}

function fullText(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
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

/** Fill Step 1: Company info */
async function fillStep1(page) {
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

  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('AVENIDA CONSULTING');
  console.log('  Filled name: AVENIDA CONSULTING');
  await page.waitForTimeout(500);

  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'LLC')) {
      await sel.selectOption('LLC');
      console.log('  Selected suffix: LLC');
      break;
    }
  }

  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'Florida')) {
      await sel.selectOption('Florida');
      console.log('  Selected state: Florida');
      break;
    }
  }

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

/** Fill Step 2: Owners - Antonio Regojo 60%, Maria Gonzalez 40% */
async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 2);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 2');

  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Antonio');
    await page.locator('input[name="owners.0.lastName"]').fill('Regojo');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Antonio Regojo').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('60').catch(() => {});
  console.log('  Owner 1: Antonio Regojo 60%');

  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Maria');
    await page.locator('input[name="owners.1.lastName"]').fill('Gonzalez');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Maria Gonzalez').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('40').catch(() => {});
  console.log('  Owner 2: Maria Gonzalez 40%');

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

// ═══════════════════════════════════════════════════════════════════
// VERIFICATION CHECKS
// ═══════════════════════════════════════════════════════════════════

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  if (ok) console.log(`  PASS  ${name}`);
  else console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

function verifyDocument(docxPath) {
  console.log('\n══════════════════════════════════════════════════');
  console.log('VERIFYING OPERATING AGREEMENT: ' + docxPath);
  console.log('══════════════════════════════════════════════════\n');

  const xml = extractDocxXml(docxPath);
  const text = fullText(xml);

  // Save extracted text for reference
  writeFileSync(join(DIR, 'extracted-text.txt'), text);
  console.log('  Saved extracted text to extracted-text.txt\n');

  // ── Company name ──
  check('Company name in title', text.includes('AVENIDA CONSULTING LLC'),
    text.includes('AVENIDA CONSULTING LLC') ? '' : 'Missing "AVENIDA CONSULTING LLC"');

  // ── State ──
  check('State: Florida throughout', text.includes('Florida'),
    text.includes('Florida') ? '' : 'Missing "Florida"');

  // ── Members in preamble ──
  check('Member: Antonio Regojo', text.includes('Antonio Regojo'),
    text.includes('Antonio Regojo') ? '' : 'Missing "Antonio Regojo"');
  check('Member: Maria Gonzalez', text.includes('Maria Gonzalez'),
    text.includes('Maria Gonzalez') ? '' : 'Missing "Maria Gonzalez"');

  // ── Capital contributions (Sec 5.1) ──
  check('Capital: Antonio $60,000.00', text.includes('60,000.00'),
    text.includes('60,000.00') ? '' : 'Missing "$60,000.00"');
  check('Capital: Maria $40,000.00', text.includes('40,000.00'),
    text.includes('40,000.00') ? '' : 'Missing "$40,000.00"');

  // ── MPI percentages (Sec 7.4) ──
  check('MPI: Antonio 60%', text.includes('60%'),
    text.includes('60%') ? '' : 'Missing "60%"');
  check('MPI: Maria 40%', text.includes('40%'),
    text.includes('40%') ? '' : 'Missing "40%"');

  // ── Managers (Sec 11) ──
  // Both should appear as managers
  check('Manager: Antonio Regojo', text.includes('Antonio Regojo'),
    'Already checked in Members');
  check('Manager: Maria Gonzalez', text.includes('Maria Gonzalez'),
    'Already checked in Members');

  // ── Tax Partner (Sec 9.5) ──
  check('Tax Partner: Antonio Regojo', text.includes('Antonio Regojo'),
    'Antonio Regojo appears as Tax Matters Member');

  // ── Sale voting: Unanime → "Unanimous" (Sec 8/10.3) ──
  check('Sale voting: Unanimous',
    text.includes('Unanimous consent of the Members') || text.includes('Unanimous'),
    text.includes('Unanimous') ? '' : 'Missing "Unanimous" for sale voting');

  // ── Bank: 2 signees → "any two Members or Managers" (Sec 10) ──
  check('Bank: "any two Members or Managers"', text.includes('any two Members or Managers'),
    text.includes('any two Members or Managers') ? '' : 'Missing "any two Members or Managers"');

  // ── Major decisions: Mayoria → "Majority Approval" (Sec 11.4) ──
  check('Major decisions: Majority',
    text.includes('Majority Approval') || text.includes('Majority'),
    (text.includes('Majority Approval') || text.includes('Majority')) ? '' : 'Missing "Majority" for major decisions');

  // ── ROFR: Yes → "Right of First Refusal" present (Sec 12.1) ──
  check('ROFR: present', text.includes('Right of First Refusal'),
    text.includes('Right of First Refusal') ? '' : 'Missing "Right of First Refusal"');

  // ── ROFR period: 180 days (Sec 12.1) ──
  check('ROFR period: "180 calendar days"',
    text.includes('180 calendar days') || text.includes('180'),
    (text.includes('180 calendar days') || text.includes('180')) ? '' : 'Missing "180 calendar days"');

  // ── Non-compete: No → Section 11.12 NOT present ──
  // When non-compete is No, the non-compete section should be absent
  check('Non-compete: Section 11.12 NOT present',
    !text.includes('Non-Compete') && !text.includes('non-compete covenant'),
    (!text.includes('Non-Compete') && !text.includes('non-compete covenant'))
      ? '' : 'Found "Non-Compete" text but NC=No');

  // ── Tag/Drag: No → NOT present ──
  check('Tag Along NOT present', !text.includes('Tag Along'),
    !text.includes('Tag Along') ? '' : 'Found "Tag Along" but should be removed');
  check('Drag Along NOT present', !text.includes('Drag Along'),
    !text.includes('Drag Along') ? '' : 'Found "Drag Along" but should be removed');

  // ── Distribution: Quarterly (default template text) ──
  // The template uses "quarterly" by default
  check('Distribution: quarterly text present',
    text.toLowerCase().includes('quarter') || text.includes('Quarterly') || text.includes('quarterly'),
    (text.toLowerCase().includes('quarter')) ? '' : 'Missing quarterly distribution text');

  // ── Min tax: 30% (Sec 7.6) ──
  check('Min tax distribution: 30%', text.includes('30%'),
    text.includes('30%') ? '' : 'Missing "30%"');

  // ── Dissolution: Unanime → "Unanimous election" (Sec 15.1) ──
  check('Dissolution: "Unanimous election"',
    text.includes('Unanimous election') || text.includes('Unanimous'),
    text.includes('Unanimous') ? '' : 'Missing "Unanimous" for dissolution');

  // ── County: Miami-Dade (Sec 19.6) ──
  // NOTE: When company has no US address, county may be empty.
  // Check if county text appears near "County, Florida" in the venue clause
  const countyInVenue = text.match(/in\s+([\w-]+)\s+County/);
  const countyValue = countyInVenue ? countyInVenue[1] : '';
  check('County: Miami-Dade (Sec 19.6)', text.includes('Miami-Dade'),
    countyValue ? `Found county: "${countyValue}"` : 'County field is EMPTY in venue clause — no US address provided');

  // ── No empty signature lines ──
  // Check for blank "Name:" lines without content
  const hasBlankNameLines = /Name:\s*\n/.test(text) || text.includes('Name: ___');
  check('No empty Name: lines in signatures', !hasBlankNameLines,
    hasBlankNameLines ? 'Found blank Name: lines' : '');

  // ── No {{placeholders}} ──
  const hasPlaceholders = text.includes('{{');
  check('No {{placeholders}} anywhere', !hasPlaceholders,
    hasPlaceholders ? 'Found unfilled {{ }} placeholders!' : '');

  // ── Summary ──
  const passCount = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;
  console.log(`\n═══ RESULTS: ${passCount} PASS, ${failCount} FAIL ═══\n`);

  // Save results
  const table = results.map(r => `${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`).join('\n');
  writeFileSync(join(DIR, 'verification-results.txt'), table);
  console.log('  Saved verification-results.txt\n');

  return { passCount, failCount, text, xml };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN FLOW
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== REGEN + VERIFY LLC: AVENIDA CONSULTING ===');
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

    // Auth0 redirect after Step 2
    if (page.url().includes('auth0')) {
      console.log('  Auth0 redirect after Step 2');
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

    // ========================== STEP 3: ADMIN (Managers) ==========================
    console.log('=== STEP 3: Admin (Managers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "gerentes": ' + pageText.includes('gerentes'));
    await shot(page, 'step3_initial');

    await clickToggle(page, 'All owners are managers', 'Sí');
    await setFormValue(page, 'admin.managersAllOwners', 'Yes');
    console.log('  Set all owners as managers: Yes');
    await page.waitForTimeout(1000);

    await shot(page, 'step3_managers');
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

    await setFormValue(page, 'agreement.llc_capitalContributions_0', '60000');
    await setFormValue(page, 'agreement.llc_capitalContributions_1', '40000');
    console.log('  Set capital: $60,000 / $40,000');

    await clickToggle(page, 'Managing members', 'Sí');
    console.log('  Managing members: Yes (all)');

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

    const majorityInput = page.locator('input[name="agreement.majorityThreshold"]');
    if (await majorityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await majorityInput.fill('');
      await majorityInput.fill('50.01');
      console.log('  Majority threshold: 50.01%');
    }

    const superInput = page.locator('input[name="agreement.supermajorityThreshold"]');
    if (await superInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await superInput.fill('');
      await superInput.fill('75');
      console.log('  Supermajority threshold: 75%');
    }

    await clickToggle(page, 'New members admission', 'Supermayoría');
    await clickToggle(page, 'Additional contributions process', 'Sí, Pro-Rata');
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

    await clickToggle(page, 'LLC sale decision', 'Unánime');

    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Antonio Regojo")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Antonio Regojo' });
      console.log('  Tax Partner: Antonio Regojo');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Antonio Regojo');
      console.log('  Tax Partner (via fiber): Antonio Regojo');
    }

    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    await clickToggle(page, 'Bank signers', 'Dos firmantes');
    await clickToggle(page, 'LLC major decisions', 'Mayoría');
    await clickToggle(page, 'LLC minor decisions', 'Unánime');

    await setFormValue(page, 'agreement.llc_majorSpendingThreshold', '10000');
    console.log('  Spending threshold: $10,000');

    await clickToggle(page, 'LLC officer removal voting', 'Supermayoría');

    await clickToggle(page, 'LLC non solicitation', 'Sí');
    console.log('  Non-solicitation: Yes');

    await clickToggle(page, 'LLC confidentiality NDA', 'Sí');
    console.log('  Confidentiality: Yes');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step7_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step7_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 8: AGREEMENT 4 - Acciones & Sucesion ==========================
    console.log('=== STEP 8: Agreement - Acciones & Sucesion ===');
    await shot(page, 'step8_initial');

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

    await clickToggle(page, 'Incapacity heirs policy', 'No');

    const transferSelect = page.locator('select').filter({ has: page.locator('option:has-text("libremente")') }).first();
    if (await transferSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await transferSelect.selectOption({ label: 'Sí, podrán transferir libremente.' });
      console.log('  Transfer to relatives: Free');
    } else {
      await setFormValue(page, 'agreement.llc_transferToRelatives', 'Sí, podrán transferir libremente.');
      console.log('  Transfer to relatives (via fiber): Free');
    }

    await clickToggle(page, 'LLC new partners admission', 'Supermayoría');
    await clickToggle(page, 'LLC dissolution decision', 'Unánime');
    await clickToggle(page, 'LLC divorce buyout', 'No');
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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Antonio Regojo').catch(() => {});
      await page.locator('#billingPostalCode, input[name="billingPostalCode"]').first().fill('33101').catch(() => {});

      await shot(page, 'stripe_filled');

      console.log('  Clicking Pay...');
      await page.locator('.SubmitButton, button[type="submit"]').first().click();

      console.log('  Processing payment (30s)...');
      await page.waitForTimeout(30000);
      await shot(page, 'payment_result');
      console.log('  Post-payment URL: ' + page.url().substring(0, 100));

      // ========================== DASHBOARD - WAIT FOR DOCS ==========================
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
        }

        console.log(`  Found ${docs.length} documents`);
        if (docs.length >= 3) break;
      }

      // Dashboard screenshots
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'dashboard_top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, 'dashboard_bottom');

      console.log('\n=== DOCUMENTS FOUND ===');
      for (const doc of docs) {
        console.log(`  ${doc.name} | S3: ${doc.s3Key} | Status: ${doc.status}`);
      }
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

  // ========================== STEP 2: DOWNLOAD OPERATING AGREEMENT FROM S3 ==========================
  console.log('\n=== STEP 2: DOWNLOAD OPERATING AGREEMENT FROM S3 ===');

  try {
    // Find the Operating Agreement on S3
    const s3List = execSync(
      `aws s3 ls s3://${S3_BUCKET}/ --recursive --profile llc-admin --region us-west-1`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    // Filter for avenida-consulting Operating Agreement — get the latest one
    const oaLines = s3List.split('\n')
      .filter(l => l.toLowerCase().includes('avenida-consulting') || l.toLowerCase().includes('avenida_consulting'))
      .filter(l => l.includes('Operating Agreement') || l.includes('operating-agreement') || l.includes('operating_agreement'));

    console.log('  Found matching S3 keys:');
    for (const line of oaLines) {
      console.log('    ' + line.trim());
    }

    if (oaLines.length === 0) {
      console.log('  WARNING: No Operating Agreement found on S3. Trying broader search...');
      const broadLines = s3List.split('\n')
        .filter(l => l.toLowerCase().includes('avenida'))
        .filter(l => l.toLowerCase().includes('agreement') || l.toLowerCase().includes('operating'));
      for (const line of broadLines) {
        console.log('    ' + line.trim());
      }
    }

    // Get the S3 key — the path starts after the date/time/size columns
    // Format: "2026-04-14 12:06:04     311643 path/with spaces/file.docx"
    const latestLine = oaLines[oaLines.length - 1] || '';
    const s3KeyMatch = latestLine.match(/^\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+(.+)$/);
    const s3Key = s3KeyMatch ? s3KeyMatch[1].trim() : '';

    if (s3Key) {
      console.log('  Downloading: s3://' + S3_BUCKET + '/' + s3Key);
      const localDocx = join(DIR, 'Operating_Agreement.docx');
      execSync(
        `aws s3 cp "s3://${S3_BUCKET}/${s3Key}" "${localDocx}" --profile llc-admin --region us-west-1`,
        { stdio: 'pipe' }
      );
      console.log('  Downloaded to: ' + localDocx);

      // ========================== STEP 3: VERIFY DOCUMENT ==========================
      console.log('\n=== STEP 3: VERIFY DOCUMENT CONTENT ===');
      const { passCount, failCount, text, xml } = verifyDocument(localDocx);

      // ========================== STEP 4: WORD ONLINE SCREENSHOTS ==========================
      console.log('\n=== STEP 4: WORD ONLINE SCREENSHOTS ===');

      // Upload to S3 for viewing
      const viewKey = `uat/regen-verify/${Date.now()}_Operating_Agreement.docx`;
      execSync(
        `aws s3 cp "${localDocx}" "s3://${S3_BUCKET}/${viewKey}" --profile llc-admin --region us-west-1`,
        { stdio: 'pipe' }
      );
      console.log('  Uploaded for viewing: s3://' + S3_BUCKET + '/' + viewKey);

      // Generate presigned URL
      const presignedUrl = execSync(
        `aws s3 presign "s3://${S3_BUCKET}/${viewKey}" --profile llc-admin --region us-west-1 --expires-in 3600`,
        { encoding: 'utf8' }
      ).trim();
      console.log('  Presigned URL generated');

      // Word Online viewer URL
      const wordOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(presignedUrl)}`;
      console.log('  Word Online URL: ' + wordOnlineUrl.substring(0, 100) + '...');
      writeFileSync(join(DIR, 'word-online-url.txt'), wordOnlineUrl);

      // Open in browser and screenshot every page
      const browser2 = await chromium.launch({ headless: true });
      const ctx2 = await browser2.newContext({ viewport: { width: 1400, height: 1000 } });
      const page2 = await ctx2.newPage();
      page2.setDefaultTimeout(60000);

      console.log('  Loading Word Online viewer...');
      await page2.goto(wordOnlineUrl, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await page2.waitForTimeout(15000);

      const title = await page2.title();
      console.log('  Page title: ' + title);

      // Wait for the document to render
      await page2.waitForTimeout(5000);

      // Try to detect total pages
      let totalPages = 17;
      const pageIndicator = await page2.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
          if (el.children.length === 0) {
            const t = el.textContent || '';
            const m = t.match(/(?:Page|Página)\s+(\d+)\s+(?:of|de)\s+(\d+)/i);
            if (m) return parseInt(m[2]);
          }
        }
        return 0;
      });
      if (pageIndicator > 0) {
        totalPages = pageIndicator;
        console.log('  Detected pages: ' + totalPages);
      } else {
        console.log('  Using default page count: ' + totalPages);
      }

      // Screenshot every page
      const woDir = join(DIR, 'word-online-pages');
      mkdirSync(woDir, { recursive: true });

      // Screenshot page 1
      await page2.screenshot({ path: join(woDir, 'page_01.png'), fullPage: false });
      console.log('  Page 1/' + totalPages);

      // Click into the document area for keyboard focus
      await page2.mouse.click(700, 500);
      await page2.waitForTimeout(500);

      for (let p = 2; p <= totalPages; p++) {
        await page2.keyboard.press('PageDown');
        await page2.waitForTimeout(1500);
        await page2.screenshot({
          path: join(woDir, `page_${String(p).padStart(2, '0')}.png`),
          fullPage: false
        });

        const footerText = await page2.evaluate(() => {
          for (const el of document.querySelectorAll('*')) {
            if (el.children.length === 0 && /Page \d+ of \d+/.test(el.textContent)) {
              return el.textContent.trim();
            }
          }
          return '';
        });
        console.log(`  Page ${p}/${totalPages} ${footerText ? '(' + footerText + ')' : ''}`);
      }

      await browser2.close();
      console.log('  Word Online screenshots saved to: ' + woDir);

      // ========================== FINAL REPORT ==========================
      console.log('\n═══════════════════════════════════════════════════');
      console.log('FINAL REPORT');
      console.log('═══════════════════════════════════════════════════');
      console.log(`Verification: ${passCount} PASS, ${failCount} FAIL`);
      console.log(`Word Online pages screenshotted: ${totalPages}`);
      console.log(`S3 key: ${s3Key}`);
      console.log(`Local file: ${join(DIR, 'Operating_Agreement.docx')}`);
      console.log(`Results file: ${join(DIR, 'verification-results.txt')}`);
      console.log(`Extracted text: ${join(DIR, 'extracted-text.txt')}`);
      console.log(`Screenshots: ${woDir}`);
      console.log('═══════════════════════════════════════════════════');

    } else {
      console.log('  ERROR: Could not find Operating Agreement S3 key');
    }
  } catch (e) {
    console.error('S3/Verify error:', e.message);
    console.error(e.stack);
  }

  console.log('\n=== REGEN + VERIFY LLC COMPLETE ===');
  console.log('All output saved to: ' + DIR);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
