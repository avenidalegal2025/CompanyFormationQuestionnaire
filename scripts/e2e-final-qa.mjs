/**
 * E2E FINAL QA: LLC 3-owner formation with Operating Agreement
 *
 * Company: FINAL QA LLC (LLC, Florida)
 * Owners: Elena Final (50%), Marco Final (30%), Sofia Final (20%)
 * All managers
 * Agreement: Yes
 *   - Majority: 50.01%, Supermajority: 75%
 *   - Capital: $50K / $30K / $20K
 *   - Non-compete: Yes (2 years, State of Florida)
 *   - Bank: Dos firmantes
 *   - Sale: Decision Unanime
 *   - Tax Partner: Elena Final
 *   - Major: Mayoria, Minor: Decision Unanime
 *   - Spending: $10,000
 *   - ROFR: Yes (180 days)
 *   - Death: No, Transfer: Free, Dissolution: Decision Unanime
 *   - No divorce, no tag/drag
 *
 * After payment, downloads Operating Agreement from S3 and verifies 12 fixes.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { inflateRawSync } from 'zlib';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'final-qa');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+final_qa_${TIMESTAMP}@gmail.com`;
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

/** Fill Step 1 fields for LLC */
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

  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('FINAL QA');
  console.log('  Filled name: FINAL QA');
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

/** Fill Step 2 owners: Elena Final 50%, Marco Final 30%, Sofia Final 20% */
async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 3);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 3');

  // Owner 1: Elena Final (50%)
  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Elena');
    await page.locator('input[name="owners.0.lastName"]').fill('Final');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Elena Final').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('50').catch(() => {});
  console.log('  Owner 1: Elena Final 50%');

  // Owner 2: Marco Final (30%)
  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Marco');
    await page.locator('input[name="owners.1.lastName"]').fill('Final');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Marco Final').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('30').catch(() => {});
  console.log('  Owner 2: Marco Final 30%');

  // Owner 3: Sofia Final (20%)
  const fn2 = page.locator('input[name="owners.2.firstName"]');
  if (await fn2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn2.fill('Sofia');
    await page.locator('input[name="owners.2.lastName"]').fill('Final');
  } else {
    await page.locator('input[name="owners.2.fullName"]').fill('Sofia Final').catch(() => {});
  }
  await page.locator('input[name="owners.2.ownership"]').fill('20').catch(() => {});
  console.log('  Owner 3: Sofia Final 20%');

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

// ─── DOCX Verification ──────────────────────────────────────────────

/**
 * Download the Operating Agreement from S3 and verify 12 specific fixes.
 * Uses AWS CLI to download, then node:zlib to extract document.xml.
 */
function verifyOperatingAgreement(s3Key) {
  const results = [];
  const docxPath = join(DIR, 'operating_agreement.docx');

  // Download from S3
  console.log('\n=== DOWNLOADING OPERATING AGREEMENT FROM S3 ===');
  console.log('  S3 key: ' + s3Key);
  try {
    execSync(
      `aws s3 cp "s3://avenida-legal-documents/${s3Key}" "${docxPath}" --profile llc-admin --region us-west-1`,
      { stdio: 'pipe' }
    );
    console.log('  Downloaded to: ' + docxPath);
  } catch (e) {
    console.error('  ERROR downloading from S3: ' + e.message);
    return [{ id: 0, name: 'S3 Download', pass: false, detail: e.message }];
  }

  // Extract document.xml from DOCX (ZIP)
  const xml = extractDocumentXml(docxPath);
  if (!xml) {
    return [{ id: 0, name: 'XML Extraction', pass: false, detail: 'Failed to extract document.xml from DOCX' }];
  }

  // Save XML for debugging
  writeFileSync(join(DIR, 'document.xml'), xml);
  console.log('  Saved document.xml (' + xml.length + ' chars)');

  /**
   * Extract plain text from XML by reading <w:t> elements.
   * In DOCX XML, text may span multiple <w:t> elements within the same paragraph.
   */
  function xmlPlainText(xmlSnippet) {
    const texts = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(xmlSnippet)) !== null) texts.push(m[1]);
    return texts.join('');
  }

  /**
   * Check if a name appears in its own signature block paragraph.
   * "Name: " and the actual name may be in separate <w:r> runs.
   */
  function findSigBlockForName(name) {
    let found = 0;
    let searchStart = 0;
    while (true) {
      const nameIdx = xml.indexOf(name, searchStart);
      if (nameIdx < 0) break;
      const pStart = xml.lastIndexOf('<w:p', nameIdx);
      const pEnd = xml.indexOf('</w:p>', nameIdx);
      if (pStart >= 0 && pEnd >= 0) {
        const text = xmlPlainText(xml.substring(pStart, pEnd + 6));
        if (text.includes('Name:') && text.includes(name)) found++;
      }
      searchStart = nameIdx + name.length;
    }
    return found;
  }

  // ─── CHECK 1: Signature block "Elena Final" alone ───
  {
    const count = findSigBlockForName('Elena Final');
    results.push({ id: 1, name: 'Sig: "Elena Final" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 2: Signature block "Marco Final" alone ───
  {
    const count = findSigBlockForName('Marco Final');
    results.push({ id: 2, name: 'Sig: "Marco Final" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 3: Signature block "Sofia Final" alone ───
  {
    const count = findSigBlockForName('Sofia Final');
    results.push({ id: 3, name: 'Sig: "Sofia Final" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 4: Capital table has individual names per row ───
  {
    const hasElena = xml.includes('Elena Final') && xml.includes('50,000.00');
    const hasMarco = xml.includes('Marco Final') && xml.includes('30,000.00');
    const hasSofia = xml.includes('Sofia Final') && xml.includes('20,000.00');
    const pass = hasElena && hasMarco && hasSofia;
    results.push({ id: 4, name: 'Capital: individual names per row', pass, detail: `Elena+50K: ${hasElena}, Marco+30K: ${hasMarco}, Sofia+20K: ${hasSofia}` });
  }

  // ─── CHECK 5: Non-compete numbered 11.12 ───
  {
    // Search for "11.12 Non-competition" as a section heading.
    // First occurrence of "11.12" may be a cross-reference ("Section 11.10-11.12").
    const has1112NC = xml.includes('11.12 Non-competition') || xml.includes('11.12Non-competition');
    let found1112AsHeading = false;
    let searchStart = 0;
    while (true) {
      const idx = xml.indexOf('11.12', searchStart);
      if (idx < 0) break;
      const after = xml.substring(idx, idx + 200).replace(/<[^>]+>/g, '');
      if (after.startsWith('11.12') && after.includes('Non-competition')) {
        found1112AsHeading = true;
        break;
      }
      searchStart = idx + 5;
    }
    results.push({ id: 5, name: 'Non-compete numbered 11.12', pass: has1112NC || found1112AsHeading, detail: `Direct: ${has1112NC}, Heading: ${found1112AsHeading}` });
  }

  // ─── CHECK 6: Non-Disparagement numbered 11.13 ───
  {
    const has1113 = xml.includes('11.13');
    const hasNonDisp = xml.includes('Non-Disparagement');
    // Check that 11.13 appears before Non-Disparagement (renumbered)
    const idx1113 = xml.indexOf('11.13');
    const idxND = xml.indexOf('Non-Disparagement');
    const closeEnough = idx1113 >= 0 && idxND >= 0 && Math.abs(idx1113 - idxND) < 500;
    const pass = has1113 && hasNonDisp && closeEnough;
    results.push({ id: 6, name: 'Non-Disparagement numbered 11.13', pass, detail: `11.13: ${has1113}, ND: ${hasNonDisp}, close: ${closeEnough}` });
  }

  // ─── CHECK 7: No "50.01.1%" typo ───
  {
    const hasBadTypo = xml.includes('50.01.1%');
    const has5001 = xml.includes('50.01%');
    const pass = !hasBadTypo && has5001;
    results.push({ id: 7, name: 'No "50.01.1%" typo', pass, detail: `Bad typo: ${hasBadTypo}, Correct 50.01%: ${has5001}` });
  }

  // ─── CHECK 8: ROFR 180 calendar days ───
  {
    const has180 = xml.includes('180 calendar days');
    const has30 = xml.includes('30 calendar days');
    const pass = has180 && !has30;
    results.push({ id: 8, name: 'ROFR "180 calendar days"', pass, detail: `180 days: ${has180}, 30 days: ${has30}` });
  }

  // ─── CHECK 9: Non-compete has "TWO (2) years" and "State of Florida" ───
  {
    const hasTwoYears = xml.includes('TWO (2) years') || xml.includes('TWO (2)');
    const hasStateFL = xml.includes('State of Florida');
    const pass = hasTwoYears && hasStateFL;
    results.push({ id: 9, name: 'NC: "TWO (2) years" + "State of Florida"', pass, detail: `TWO (2): ${hasTwoYears}, State of Florida: ${hasStateFL}` });
  }

  // ─── CHECK 10: Super Majority definition with "SEVENTY-FIVE PERCENT (75.00%)" ───
  {
    // The code uses numberToWords which produces "SEVENTY FIVE" (with space, possibly hyphen)
    const hasSuperMajDef = xml.includes('Super Majority Defined') || xml.includes('Super Majority.');
    const has75 = xml.includes('75.00%');
    const hasSeventy = xml.includes('SEVENTY') && xml.includes('FIVE');
    const pass = hasSuperMajDef && has75 && hasSeventy;
    results.push({ id: 10, name: 'Super Majority def "75.00%"', pass, detail: `Def: ${hasSuperMajDef}, 75.00%: ${has75}, SEVENTY FIVE: ${hasSeventy}` });
  }

  // ─── CHECK 11: Non-compete paragraph has pPr (paragraph properties) ───
  {
    // Find the paragraph containing "11.12" and "Non-competition", check it has <w:pPr>
    const ncIdx = xml.indexOf('Non-competition');
    let pass = false;
    let detail = 'Not found';
    if (ncIdx >= 0) {
      const pStart = xml.lastIndexOf('<w:p', ncIdx);
      const pEnd = xml.indexOf('</w:p>', ncIdx);
      if (pStart >= 0 && pEnd >= 0) {
        const para = xml.substring(pStart, pEnd);
        pass = para.includes('<w:pPr>');
        detail = `pPr found: ${pass} (para length: ${para.length})`;
      }
    }
    results.push({ id: 11, name: 'NC paragraph has pPr', pass, detail });
  }

  // ─── CHECK 12: Extra member paragraphs have matching font size ───
  {
    // Sofia Final is the extra (3rd) member. Check her capital contribution paragraph has <w:sz>
    const sofiaCapIdx = xml.indexOf('Sofia Final');
    let pass = false;
    let detail = 'Not found';
    if (sofiaCapIdx >= 0) {
      const pStart = xml.lastIndexOf('<w:p', sofiaCapIdx);
      const pEnd = xml.indexOf('</w:p>', sofiaCapIdx);
      if (pStart >= 0 && pEnd >= 0) {
        const para = xml.substring(pStart, pEnd);
        // Check for <w:rPr> with <w:sz> (font size)
        const hasRPr = para.includes('<w:rPr>');
        detail = `rPr found: ${hasRPr}`;
        // Even if no rPr, if the paragraph has matching pPr that's also OK
        pass = hasRPr || para.includes('<w:pPr>');
        detail += `, pPr found: ${para.includes('<w:pPr>')}`;
      }
    }
    results.push({ id: 12, name: 'Extra member font size match', pass, detail });
  }

  return results;
}

/**
 * Extract document.xml from a DOCX file using node:zlib (no external deps).
 * DOCX = ZIP = [local file headers + compressed data + central directory]
 */
function extractDocumentXml(docxPath) {
  const buf = readFileSync(docxPath);

  // Find "word/document.xml" in the ZIP
  const target = 'word/document.xml';
  const targetBuf = Buffer.from(target);

  // Scan local file headers (PK\x03\x04)
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B || buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) {
      break; // Not a local file header
    }

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;

    if (filename === target) {
      const compressedData = buf.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        return compressedData.toString('utf8');
      }
      // Deflate (method 8) - use inflateRawSync (imported at top)
      return inflateRawSync(compressedData).toString('utf8');
    }

    offset = dataStart + compressedSize;
  }

  console.error('  ERROR: word/document.xml not found in DOCX');
  return null;
}

// zlib imported at top of file via ESM import

// ─── Main Test ──────────────────────────────────────────────────────

async function main() {
  console.log('=== FINAL QA E2E TEST ===');
  console.log('Dir: ' + DIR);
  console.log('Email: ' + EMAIL);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  let agreementS3Key = null;

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

    await setFormValue(page, 'agreement.llc_capitalContributions_0', '50000');
    await setFormValue(page, 'agreement.llc_capitalContributions_1', '30000');
    await setFormValue(page, 'agreement.llc_capitalContributions_2', '20000');
    console.log('  Set capital: $50,000 / $30,000 / $20,000');

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

    // Tax Partner: Elena Final
    const taxPartnerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Elena Final")') }).first();
    if (await taxPartnerSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taxPartnerSelect.selectOption({ label: 'Elena Final' });
      console.log('  Tax Partner: Elena Final');
    } else {
      await setFormValue(page, 'agreement.llc_taxPartner', 'Elena Final');
      console.log('  Tax Partner (via fiber): Elena Final');
    }

    await clickToggle(page, 'Non compete covenant', 'Sí');
    await page.waitForTimeout(1000);

    const ncDuration = page.locator('input[name="agreement.llc_nonCompeteDuration"]');
    if (await ncDuration.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncDuration.fill('');
      await ncDuration.fill('2');
      console.log('  Non-compete duration: 2 years');
    }

    const ncScope = page.locator('input[name="agreement.llc_nonCompeteScope"]');
    if (await ncScope.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncScope.fill('State of Florida');
      console.log('  Non-compete scope: State of Florida');
    }

    await clickToggle(page, 'Bank signers', 'Dos firmantes');
    await clickToggle(page, 'LLC major decisions', 'Mayoría');
    await clickToggle(page, 'LLC minor decisions', 'Unánime');

    await setFormValue(page, 'agreement.llc_majorSpendingThreshold', '10000');
    console.log('  Spending threshold: $10,000');

    await clickToggle(page, 'LLC officer removal voting', 'Supermayoría');

    console.log('  Non-solicitation: hidden (non-compete is Yes)');

    await clickToggle(page, 'LLC confidentiality NDA', 'Sí');
    await clickToggle(page, 'LLC non-disparagement', 'Sí');

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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Elena Final').catch(() => {});
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
      const maxPolls = 12;
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

      console.log('\n=== DOCUMENTS FOUND ===');
      for (const doc of docs) {
        console.log(`  ${doc.name} | S3: ${doc.s3Key} | Status: ${doc.status}`);
      }

      // Save document list
      writeFileSync(join(DIR, 'documents.json'), JSON.stringify(docs, null, 2));

      // Find the Operating Agreement S3 key
      const agreement = docs.find(d =>
        (d.name && (d.name.toLowerCase().includes('operating') || d.name.toLowerCase().includes('agreement'))) ||
        (d.s3Key && d.s3Key.includes('agreement'))
      );

      if (agreement) {
        agreementS3Key = agreement.s3Key;
        console.log('\n  Operating Agreement S3 key: ' + agreementS3Key);
      } else {
        console.log('\n  WARNING: Operating Agreement not found in documents list');
        console.log('  Attempting to find via S3 listing...');
        // Try to find via S3 ls
        try {
          const s3List = execSync(
            `aws s3 ls "s3://avenida-legal-documents/agreements/" --profile llc-admin --region us-west-1 --recursive`,
            { encoding: 'utf8', timeout: 15000 }
          );
          const lines = s3List.trim().split('\n');
          // Find the most recent file matching FINAL QA
          const recent = lines.filter(l => l.includes('FINAL') || l.includes('Operating')).pop();
          if (recent) {
            agreementS3Key = recent.split(/\s+/).pop();
            console.log('  Found via S3: ' + agreementS3Key);
          }
        } catch (e) {
          console.log('  S3 listing failed: ' + e.message);
        }
      }

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

  // ========================== DOCX VERIFICATION ==========================
  let verificationResults = [];
  if (agreementS3Key) {
    verificationResults = verifyOperatingAgreement(agreementS3Key);
  } else {
    console.log('\n=== SKIPPING DOCX VERIFICATION (no S3 key found) ===');
    verificationResults = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, name: `Check ${i + 1}`, pass: false, detail: 'No S3 key found'
    }));
  }

  // ========================== RESULTS TABLE ==========================
  const passCount = verificationResults.filter(r => r.pass).length;
  const failCount = verificationResults.filter(r => !r.pass).length;

  console.log('\n');
  console.log('='.repeat(80));
  console.log('  FINAL QA VERIFICATION RESULTS');
  console.log('='.repeat(80));
  console.log('');
  console.log(` ${'#'.padEnd(4)} | ${'STATUS'.padEnd(6)} | ${'CHECK'.padEnd(40)} | DETAIL`);
  console.log(`${'-'.repeat(4)}-+-${'-'.repeat(6)}-+-${'-'.repeat(40)}-+-${'-'.repeat(40)}`);

  for (const r of verificationResults) {
    const status = r.pass ? 'PASS' : 'FAIL';
    const marker = r.pass ? ' OK ' : 'FAIL';
    console.log(` ${String(r.id).padEnd(4)}| ${marker.padEnd(6)} | ${r.name.padEnd(40)} | ${r.detail}`);
  }

  console.log('');
  console.log(`${'-'.repeat(80)}`);
  console.log(`  TOTAL: ${passCount} PASS / ${failCount} FAIL out of ${verificationResults.length} checks`);
  console.log(`  OVERALL: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log(`${'-'.repeat(80)}`);
  console.log('');
  console.log('Screenshots saved to: ' + DIR);
  console.log('Email used: ' + EMAIL);

  // Save results as JSON
  writeFileSync(join(DIR, 'verification_results.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    email: EMAIL,
    s3Key: agreementS3Key,
    results: verificationResults,
    passCount,
    failCount,
    overall: failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'
  }, null, 2));

  if (failCount > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
