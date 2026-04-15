/**
 * REGEN + VERIFY: C-Corp "AVENIDA TECH Inc" — Full Questionnaire → S3 Download → 30-Check Verification
 *
 * Company: AVENIDA TECH (C-Corp, Florida, Inc suffix)
 * Owners: Carlos Martinez (55%), Laura Fernandez (45%)
 * 10,000 authorized shares
 * Both directors and officers: Carlos=President, Laura=Vice-President
 * Agreement: Yes
 *   - Sale: Supermayoria
 *   - Bank: Dos firmantes
 *   - ROFR: Yes (90 days)
 *   - Death: Yes (forced sale)
 *   - Divorce: Yes
 *   - Tag/Drag: Yes
 *   - Non-compete: No
 *   - Non-solicitation: Yes
 *   - Confidentiality: Yes
 *
 * Auth0: test+regen_corp_TIMESTAMP@gmail.com / DemoPass2026!
 * Stripe: 4242 4242 4242 4242
 *
 * Steps:
 *   1. Run full questionnaire
 *   2. Download Shareholder Agreement from S3
 *   3. Verify 30 paragraph mappings
 *   4. Print PASS/FAIL table
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { inflateRawSync } from 'zlib';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'regen-verify-corp');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+regen_corp_${TIMESTAMP}@gmail.com`;
const PASSWORD = 'DemoPass2026!';

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log('  [screenshot] ' + f);
}

// ─── Shared helpers ────────────────────────────────────────────────

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

// ─── Auth0 ─────────────────────────────────────────────────────────

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

// ─── Step fills ────────────────────────────────────────────────────

async function fillStep1(page) {
  // Select C-Corp entity type
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
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('AVENIDA TECH');
  console.log('  Filled name: AVENIDA TECH');
  await page.waitForTimeout(500);

  // Select Inc suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'Inc')) {
      await sel.selectOption('Inc');
      console.log('  Selected suffix: Inc');
      break;
    }
  }

  // Select Florida state
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

  // Set 10,000 authorized shares
  await setFormValue(page, 'company.numberOfShares', 10000);
  console.log('  Set 10,000 authorized shares');
}

async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 2);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 2');

  // Owner 1: Carlos Martinez (55%)
  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Carlos');
    await page.locator('input[name="owners.0.lastName"]').fill('Martinez');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Carlos Martinez').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('55').catch(() => {});
  console.log('  Owner 1: Carlos Martinez 55%');

  // Owner 2: Laura Fernandez (45%)
  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Laura');
    await page.locator('input[name="owners.1.lastName"]').fill('Fernandez');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Laura Fernandez').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('45').catch(() => {});
  console.log('  Owner 2: Laura Fernandez 45%');

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

// ─── DOCX extraction ──────────────────────────────────────────────

function extractDocumentXml(docxPath) {
  const buf = readFileSync(docxPath);
  const target = 'word/document.xml';
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B || buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) break;
    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (filename === target) {
      const compressedData = buf.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return compressedData.toString('utf8');
      return inflateRawSync(compressedData).toString('utf8');
    }
    offset = dataStart + compressedSize;
  }
  console.error('  ERROR: word/document.xml not found in DOCX');
  return null;
}

function xmlPlainText(xmlSnippet) {
  const texts = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xmlSnippet)) !== null) texts.push(m[1]);
  return texts.join('');
}

// ─── 30-check Verification ────────────────────────────────────────

function verifyShareholderAgreement(s3Key) {
  const results = [];
  const docxPath = join(DIR, 'shareholder_agreement.docx');

  console.log('\n=== DOWNLOADING SHAREHOLDER AGREEMENT FROM S3 ===');
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

  const xml = extractDocumentXml(docxPath);
  if (!xml) {
    return [{ id: 0, name: 'XML Extraction', pass: false, detail: 'Failed to extract document.xml' }];
  }

  writeFileSync(join(DIR, 'document.xml'), xml);
  console.log('  Saved document.xml (' + xml.length + ' chars)');

  const fullText = xmlPlainText(xml);
  writeFileSync(join(DIR, 'full_text.txt'), fullText);
  console.log('  Saved full_text.txt (' + fullText.length + ' chars)');

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

  // ─── CHECK 1: Company name ALL CAPS: "AVENIDA TECH INC" ───
  {
    const hasAllCaps = fullText.includes('AVENIDA TECH INC');
    results.push({ id: 1, name: 'Company name: "AVENIDA TECH INC" (ALL CAPS)', pass: hasAllCaps, detail: `Found: ${hasAllCaps}` });
  }

  // ─── CHECK 2: State: "Florida" in Sec 2.1 ───
  {
    const hasFlorida = fullText.includes('Florida');
    results.push({ id: 2, name: 'State: "Florida"', pass: hasFlorida, detail: `Found: ${hasFlorida}` });
  }

  // ─── CHECK 3: Shareholders listed: Carlos Martinez, Laura Fernandez ───
  {
    const hasCarlos = fullText.includes('Carlos Martinez');
    const hasLaura = fullText.includes('Laura Fernandez');
    results.push({ id: 3, name: 'Shareholders: Carlos Martinez + Laura Fernandez', pass: hasCarlos && hasLaura, detail: `Carlos: ${hasCarlos}, Laura: ${hasLaura}` });
  }

  // ─── CHECK 4: Shares: Carlos 5,500 ───
  {
    const has5500 = fullText.includes('5,500') || fullText.includes('5500');
    results.push({ id: 4, name: 'Shares: Carlos 5,500', pass: has5500, detail: `Found 5,500 or 5500: ${has5500}` });
  }

  // ─── CHECK 5: Shares: Laura 4,500 ───
  {
    const has4500 = fullText.includes('4,500') || fullText.includes('4500');
    results.push({ id: 5, name: 'Shares: Laura 4,500', pass: has4500, detail: `Found 4,500 or 4500: ${has4500}` });
  }

  // ─── CHECK 6: Capital: Carlos $55,000.00 ───
  {
    const has55k = fullText.includes('$55,000.00') || fullText.includes('55,000.00');
    results.push({ id: 6, name: 'Capital: Carlos $55,000.00', pass: has55k, detail: `Found: ${has55k}` });
  }

  // ─── CHECK 7: Capital: Laura $45,000.00 ───
  {
    const has45k = fullText.includes('$45,000.00') || fullText.includes('45,000.00');
    results.push({ id: 7, name: 'Capital: Laura $45,000.00', pass: has45k, detail: `Found: ${has45k}` });
  }

  // ─── CHECK 8: Pct: Carlos 55.00% ───
  {
    const has55pct = fullText.includes('55.00%');
    results.push({ id: 8, name: 'Pct: Carlos 55.00%', pass: has55pct, detail: `Found: ${has55pct}` });
  }

  // ─── CHECK 9: Pct: Laura 45.00% ───
  {
    const has45pct = fullText.includes('45.00%');
    results.push({ id: 9, name: 'Pct: Laura 45.00%', pass: has45pct, detail: `Found: ${has45pct}` });
  }

  // ─── CHECK 10: NO empty 3rd row ($% pattern) ───
  {
    // Check for empty table rows with "$" and "%" but no actual data
    const hasDollarPercent = fullText.includes('$%') || fullText.includes('$ %');
    // Also check for a third row in the Sec 4.2 table that has no name
    // Extract text around table area
    const sec42Idx = fullText.indexOf('4.2');
    let hasEmpty3rdRow = false;
    if (sec42Idx >= 0) {
      const region = fullText.substring(sec42Idx, sec42Idx + 2000);
      // Check for patterns like empty names followed by $ or %
      hasEmpty3rdRow = /\n\s*\$\s*%/.test(region) || region.includes('$%');
    }
    results.push({ id: 10, name: 'NO empty 3rd row in Sec 4.2 table', pass: !hasDollarPercent && !hasEmpty3rdRow, detail: `$% pattern: ${hasDollarPercent}, empty 3rd row: ${hasEmpty3rdRow}` });
  }

  // ─── CHECK 11: NO 12.5% Owner signature ───
  {
    const has125 = fullText.includes('12.5%') || fullText.includes('12.50%');
    results.push({ id: 11, name: 'NO 12.5% Owner signature block', pass: !has125, detail: `Found 12.5%: ${has125}` });
  }

  // ─── CHECK 12: NO empty "Name:" signature block ───
  {
    // Search for "Name:" followed by nothing meaningful in signature area
    let hasEmptyNameSig = false;
    const sigIdx = fullText.lastIndexOf('SIGNATURE PAGE');
    if (sigIdx >= 0) {
      const sigArea = fullText.substring(sigIdx);
      // Check for "Name:" followed by whitespace/nothing (empty sig block)
      // Each "Name:" should be followed by an actual name
      const nameLines = sigArea.split(/Name:\s*/);
      for (let i = 1; i < nameLines.length; i++) {
        const afterName = nameLines[i].trim().substring(0, 30);
        if (!afterName || afterName.startsWith('%') || afterName.startsWith('$') || /^\s*$/.test(afterName.substring(0, 5))) {
          hasEmptyNameSig = true;
          break;
        }
      }
    }
    results.push({ id: 12, name: 'NO empty "Name:" signature block', pass: !hasEmptyNameSig, detail: `Empty Name sig: ${hasEmptyNameSig}` });
  }

  // ─── CHECK 13: Sale: Supermayoria → "Super Majority consent or approval" ───
  {
    const hasSuperMajSale = fullText.includes('Super Majority consent') || fullText.includes('Super Majority approval');
    results.push({ id: 13, name: 'Sale: "Super Majority consent or approval"', pass: hasSuperMajSale, detail: `Found: ${hasSuperMajSale}` });
  }

  // ─── CHECK 14: Major decisions: Mayoria → "Majority affirmative vote" ───
  {
    const hasMajVote = fullText.includes('Majority affirmative vote') || fullText.includes('Majority vote');
    results.push({ id: 14, name: 'Major: "Majority affirmative vote"', pass: hasMajVote, detail: `Found: ${hasMajVote}` });
  }

  // ─── CHECK 15: Bank: 2 signees → "two of the Officers" ───
  {
    const hasTwoOfficers = fullText.includes('two of the Officers') || fullText.includes('two (2) of the Officers') || fullText.includes('TWO (2) of the Officers');
    results.push({ id: 15, name: 'Bank: "two of the Officers"', pass: hasTwoOfficers, detail: `Found: ${hasTwoOfficers}` });
  }

  // ─── CHECK 16: ROFR: Yes → "Right of First Refusal" present ───
  {
    const hasROFR = fullText.includes('Right of First Refusal');
    results.push({ id: 16, name: 'ROFR: "Right of First Refusal" present', pass: hasROFR, detail: `Found: ${hasROFR}` });
  }

  // ─── CHECK 17: ROFR period: "90" days ───
  {
    const has90days = fullText.includes('90') && (fullText.includes('calendar days') || fullText.includes('days'));
    const has90Calendar = fullText.includes('90 calendar days') || fullText.includes('(90)') || fullText.includes('ninety');
    results.push({ id: 17, name: 'ROFR period: "90" days', pass: has90days, detail: `90+days: ${has90days}, 90 calendar: ${has90Calendar}` });
  }

  // ─── CHECK 18: Death: Yes → Successor/heirs language ───
  {
    const hasSuccessor = fullText.includes('successor') || fullText.includes('Successor') ||
      fullText.includes('heir') || fullText.includes('Heir') ||
      fullText.includes('death') || fullText.includes('Death') ||
      fullText.includes('incapacit') || fullText.includes('Incapacit');
    results.push({ id: 18, name: 'Death: Successor/heirs language', pass: hasSuccessor, detail: `Found: ${hasSuccessor}` });
  }

  // ─── CHECK 19: Divorce: Yes → Divorce buyout language ───
  {
    const hasDivorce = fullText.includes('divorce') || fullText.includes('Divorce') || fullText.includes('marital');
    results.push({ id: 19, name: 'Divorce: buyout language present', pass: hasDivorce, detail: `Found: ${hasDivorce}` });
  }

  // ─── CHECK 20: Tag/Drag: Yes → "Tag Along" + "Drag Along" ───
  {
    const hasTag = fullText.includes('Tag Along') || fullText.includes('Tag-Along') || fullText.includes('tag along');
    const hasDrag = fullText.includes('Drag Along') || fullText.includes('Drag-Along') || fullText.includes('drag along');
    results.push({ id: 20, name: 'Tag/Drag: "Tag Along" + "Drag Along"', pass: hasTag && hasDrag, detail: `Tag: ${hasTag}, Drag: ${hasDrag}` });
  }

  // ─── CHECK 21: Non-compete: No → Sec 10.10 NOT present ───
  {
    const hasNC1010 = fullText.includes('10.10') && (fullText.includes('Covenant Against Competition') || fullText.includes('Non-Compet'));
    // More broadly check for non-compete section heading
    const hasNCSection = fullText.includes('Covenant Against Competition') || fullText.includes('Non-Competition Covenant');
    results.push({ id: 21, name: 'Non-compete: Sec 10.10 NOT present', pass: !hasNC1010 && !hasNCSection, detail: `10.10+NC: ${hasNC1010}, NC section: ${hasNCSection}` });
  }

  // ─── CHECK 22: Dissolution: Corp has NO separate dissolution field — defaults to Majority ───
  // NOTE: Corp dissolution_voting is hardcoded to "majority" in agreement-mapper.ts (line 238).
  // The Corp questionnaire does not expose a dissolution voting question (unlike LLC).
  // The template says "Majority election to dissolve by the Shareholders" which is correct.
  {
    const hasMajElection = fullText.includes('Majority election') || fullText.includes('majority election');
    results.push({ id: 22, name: 'Dissolution: "Majority election" (Corp default)', pass: hasMajElection, detail: `Majority election present: ${hasMajElection} (Corp defaults to Majority — no separate field)` });
  }

  // ─── CHECK 23: Officer removal: Supermayoria → "Super Majority vote of the Shareholders" ───
  {
    const hasSuperMajRemoval = fullText.includes('Super Majority vote of the Shareholders') ||
      (fullText.includes('Super Majority vote') && fullText.includes('remov'));
    // Also check XML for split runs
    const xmlText = xmlPlainText(xml);
    const hasSuperMajRemovalXml = xmlText.includes('Super Majority vote of the Shareholders');
    results.push({ id: 23, name: 'Officer removal: "Super Majority vote of the Shareholders"', pass: hasSuperMajRemoval || hasSuperMajRemovalXml, detail: `Text: ${hasSuperMajRemoval}, XML: ${hasSuperMajRemovalXml}` });
  }

  // ─── CHECK 24: County: Miami-Dade ───
  {
    const hasMiamiDade = fullText.includes('Miami-Dade') || fullText.includes('Miami Dade');
    results.push({ id: 24, name: 'County: Miami-Dade', pass: hasMiamiDade, detail: `Found: ${hasMiamiDade}` });
  }

  // ─── CHECK 25: Carlos sig alone → "Name: Carlos Martinez" ───
  {
    const count = findSigBlockForName('Carlos Martinez');
    results.push({ id: 25, name: 'Sig: "Name: Carlos Martinez" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 26: Laura sig alone → "Name: Laura Fernandez" ───
  {
    const count = findSigBlockForName('Laura Fernandez');
    results.push({ id: 26, name: 'Sig: "Name: Laura Fernandez" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 27: Carlos % Owner → "55.00% Owner" in signature ───
  {
    const sigIdx = fullText.lastIndexOf('SIGNATURE PAGE');
    let has55Owner = false;
    if (sigIdx >= 0) {
      const sigArea = fullText.substring(sigIdx);
      has55Owner = sigArea.includes('55.00% Owner') || sigArea.includes('55.00%Owner');
    } else {
      has55Owner = fullText.includes('55.00% Owner');
    }
    results.push({ id: 27, name: 'Carlos sig: "55.00% Owner"', pass: has55Owner, detail: `Found: ${has55Owner}` });
  }

  // ─── CHECK 28: Laura % Owner → "45.00% Owner" in signature ───
  {
    const sigIdx = fullText.lastIndexOf('SIGNATURE PAGE');
    let has45Owner = false;
    if (sigIdx >= 0) {
      const sigArea = fullText.substring(sigIdx);
      has45Owner = sigArea.includes('45.00% Owner') || sigArea.includes('45.00%Owner');
    } else {
      has45Owner = fullText.includes('45.00% Owner');
    }
    results.push({ id: 28, name: 'Laura sig: "45.00% Owner"', pass: has45Owner, detail: `Found: ${has45Owner}` });
  }

  // ─── CHECK 29: No {{placeholders}} ───
  {
    const placeholderRe = /\{\{[^}]+\}\}/g;
    const matches = xml.match(placeholderRe) || [];
    const textMatches = fullText.match(placeholderRe) || [];
    const hasBrokenPlaceholder = fullText.includes('{{') || fullText.includes('}}');
    const allPlaceholders = [...new Set([...matches, ...textMatches])];
    results.push({
      id: 29, name: 'No {{placeholders}}',
      pass: allPlaceholders.length === 0 && !hasBrokenPlaceholder,
      detail: allPlaceholders.length === 0 && !hasBrokenPlaceholder
        ? 'Clean - no placeholders found'
        : `Found: ${allPlaceholders.join(', ')}${hasBrokenPlaceholder ? ' (broken {{ or }})' : ''}`
    });
  }

  // ─── CHECK 30: No blank page between SIGNATURE PAGE TO FOLLOW and signatures ───
  {
    // In DOCX XML, a blank page would be a page break followed by empty paragraphs before signature content
    const sigFollowIdx = xml.indexOf('SIGNATURE PAGE TO FOLLOW');
    let hasBlankPage = false;
    if (sigFollowIdx >= 0) {
      // Look for the next paragraph with content after "SIGNATURE PAGE TO FOLLOW"
      const afterSig = xml.substring(sigFollowIdx, sigFollowIdx + 3000);
      // Count page breaks (w:br w:type="page") before any Name: content
      const pageBreaks = (afterSig.match(/<w:br\s+w:type="page"/g) || []).length;
      // Check for consecutive empty paragraphs (more than 2 empty <w:p> elements)
      const emptyParagraphs = afterSig.split('<w:p').filter(p => {
        const text = xmlPlainText(p);
        return text.trim() === '';
      }).length;
      // A "blank page" would have a page break + many empty paragraphs
      hasBlankPage = pageBreaks > 1 || emptyParagraphs > 10;
    }
    results.push({ id: 30, name: 'No blank page before signatures', pass: !hasBlankPage, detail: `Blank page: ${hasBlankPage}` });
  }

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== REGEN + VERIFY: AVENIDA TECH Inc (C-Corp) ===');
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

    const isStep1 = await page.locator('button[aria-label="C-Corp"]').isVisible({ timeout: 2000 }).catch(() => false);
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
    if ((pageText.includes('accionistas') || pageText.includes('Nombre')) && pageText.includes('%')) {
      console.log('  On Step 2 (Owners), checking data...');
      const hasOwnerData = await page.locator('input[name="owners.0.firstName"]').inputValue().catch(() => '');
      if (!hasOwnerData) {
        console.log('  Re-filling owner data...');
        await fillStep2(page);
      }
      await clickContinuar(page);
      await page.waitForTimeout(3000);
    }

    // ========================== STEP 3: ADMIN ==========================
    console.log('=== STEP 3: Admin (Directors & Officers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "directores": ' + pageText.includes('directores'));
    await shot(page, 'step3_initial');

    await page.waitForTimeout(2000);

    // Carlos = President, Laura = Vice-President
    await setFormValue(page, 'admin.shareholderOfficer1Role', 'President');
    await setFormValue(page, 'admin.shareholderOfficer2Role', 'Vice-President');
    console.log('  Set roles: Carlos=President, Laura=Vice-President');

    const roleSelects = await page.locator('select:visible').all();
    let rolesAssigned = 0;
    const roleOrder = ['President', 'Vice-President'];
    for (const sel of roleSelects) {
      const opts = await sel.locator('option').allTextContents();
      if (opts.some(o => o === 'President') && rolesAssigned < roleOrder.length) {
        await sel.selectOption(roleOrder[rolesAssigned]);
        console.log(`  UI: Assigned ${roleOrder[rolesAssigned]}`);
        rolesAssigned++;
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

    // Capital: $55,000 / $45,000
    await setFormValue(page, 'agreement.corp_capitalPerOwner_0', '55000');
    await setFormValue(page, 'agreement.corp_capitalPerOwner_1', '45000');
    console.log('  Set capital: $55,000 / $45,000');

    const capInputs = await page.locator('input[name*="capitalPerOwner"]').all();
    if (capInputs.length >= 2) {
      await capInputs[0].fill('55000').catch(() => {});
      await capInputs[1].fill('45000').catch(() => {});
      console.log('  UI: Filled capital inputs');
    }

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

    // New shareholders admission: Supermayoria
    await clickToggle(page, 'New shareholders admission', 'Supermayoría');

    // Additional contributions: Pro-Rata
    await clickToggle(page, 'More capital process', 'Sí, Pro-Rata');

    // Shareholder loans: No
    await clickToggle(page, 'Shareholder loans', 'No');
    console.log('  Shareholder loans: No');

    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'step6_top');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, 'step6_bottom');

    await clickContinuar(page);
    await waitForStable(page, 3000);

    // ========================== STEP 7: AGREEMENT 3 - Gobierno & Decisiones ==========================
    console.log('=== STEP 7: Agreement - Gobierno & Decisiones ===');
    await shot(page, 'step7_initial');

    // Sale: Supermayoria
    await clickToggle(page, 'Sale decision threshold', 'Supermayoría');

    // Non-compete: No
    await clickToggle(page, 'Non compete covenant', 'No');
    console.log('  Non-compete: No');
    await page.waitForTimeout(1000);

    // Bank: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');

    // Major decisions: Mayoria
    await clickToggle(page, 'Major decision threshold', 'Mayoría');

    // Spending threshold: $5,000
    await setFormValue(page, 'agreement.corp_majorSpendingThreshold', '5000');
    const spendingInput = page.locator('input[name="agreement.corp_majorSpendingThreshold"]');
    if (await spendingInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spendingInput.fill('');
      await spendingInput.fill('5000');
    }
    console.log('  Set spending threshold: $5,000');

    // Officer removal: Supermayoria
    await clickToggle(page, 'Officer removal voting', 'Supermayoría');

    // Non-solicitation: Yes
    await clickToggle(page, 'Non solicitation covenant', 'Sí');
    console.log('  Non-solicitation: Yes');

    // Confidentiality: Yes
    await clickToggle(page, 'Confidentiality NDA', 'Sí');

    // Distribution: Trimestral
    await setFormValue(page, 'agreement.distributionFrequency', 'Trimestral');
    await clickToggle(page, 'Distribution frequency', 'Trimestral');
    console.log('  Distribution frequency: Trimestral');

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

    // Transfer to relatives: Unanimous
    await setFormValue(page, 'agreement.corp_transferToRelatives', 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.');
    console.log('  Transfer to relatives: Unanimous');
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

    // Death/Incapacity: Yes (forced sale)
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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Carlos Martinez').catch(() => {});
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

      writeFileSync(join(DIR, 'documents.json'), JSON.stringify(docs, null, 2));

      // Find the Shareholder Agreement S3 key
      const agreement = docs.find(d =>
        (d.name && d.name.toLowerCase().includes('shareholder agreement')) ||
        (d.s3Key && d.s3Key.includes('Shareholder Agreement'))
      ) || docs.find(d =>
        (d.name && d.name.toLowerCase().includes('agreement') && !d.name.toLowerCase().includes('registry')) ||
        (d.s3Key && d.s3Key.includes('agreement'))
      );

      if (agreement) {
        agreementS3Key = agreement.s3Key;
        console.log('\n  Shareholder Agreement S3 key: ' + agreementS3Key);
      } else {
        console.log('\n  WARNING: Shareholder Agreement not found in documents list');
        console.log('  Attempting to find via S3 listing...');
        try {
          const s3List = execSync(
            `aws s3 ls "s3://avenida-legal-documents/" --profile llc-admin --region us-west-1 --recursive`,
            { encoding: 'utf8', timeout: 30000 }
          );
          const lines = s3List.trim().split('\n');
          // Look for most recent avenida-tech shareholder agreement
          const matches = lines.filter(l =>
            l.toLowerCase().includes('avenida') && l.toLowerCase().includes('tech') &&
            l.toLowerCase().includes('shareholder') && l.toLowerCase().includes('agreement')
          );
          if (matches.length > 0) {
            agreementS3Key = matches[matches.length - 1].split(/\s+/).slice(3).join(' ');
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
    verificationResults = verifyShareholderAgreement(agreementS3Key);
  } else {
    console.log('\n=== SKIPPING DOCX VERIFICATION (no S3 key found) ===');
    verificationResults = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, name: `Check ${i + 1}`, pass: false, detail: 'No S3 key found'
    }));
  }

  // ========================== PRESIGNED URL ==========================
  if (agreementS3Key) {
    try {
      const presigned = execSync(
        `aws s3 presign "s3://avenida-legal-documents/${agreementS3Key}" --profile llc-admin --region us-west-1 --expires-in 3600`,
        { encoding: 'utf8', timeout: 15000 }
      ).trim();
      writeFileSync(join(DIR, 'presigned_url.txt'), presigned);
      console.log('\n  Presigned URL saved to presigned_url.txt');
      console.log('  URL (first 120 chars): ' + presigned.substring(0, 120));

      // Build Word Online URL
      const encodedUrl = encodeURIComponent(presigned);
      const wordOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
      writeFileSync(join(DIR, 'word_online_url.txt'), wordOnlineUrl);
      console.log('  Word Online URL saved to word_online_url.txt');
    } catch (e) {
      console.log('  Presigned URL generation failed: ' + e.message);
    }
  }

  // ========================== RESULTS TABLE ==========================
  const passCount = verificationResults.filter(r => r.pass).length;
  const failCount = verificationResults.filter(r => !r.pass).length;

  console.log('\n');
  console.log('='.repeat(120));
  console.log('  REGEN VERIFICATION RESULTS: AVENIDA TECH INC (C-CORP)');
  console.log('='.repeat(120));
  console.log('');
  console.log(` ${'#'.padEnd(4)} | ${'STATUS'.padEnd(6)} | ${'CHECK'.padEnd(55)} | DETAIL`);
  console.log(`${'-'.repeat(4)}-+-${'-'.repeat(6)}-+-${'-'.repeat(55)}-+-${'-'.repeat(60)}`);

  for (const r of verificationResults) {
    const marker = r.pass ? ' PASS' : ' FAIL';
    console.log(` ${String(r.id).padEnd(4)}| ${marker.padEnd(6)} | ${r.name.padEnd(55)} | ${r.detail}`);
  }

  console.log('');
  console.log(`${'-'.repeat(120)}`);
  console.log(`  TOTAL: ${passCount} PASS / ${failCount} FAIL out of ${verificationResults.length} checks`);
  console.log(`  OVERALL: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log(`${'-'.repeat(120)}`);
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
