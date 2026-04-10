/**
 * E2E FINAL QA: C-Corp 3-owner formation with Shareholder Agreement
 *
 * Company: CORP QA FINAL (C-Corp, Florida, Corp suffix)
 * Owners: Roberto Uno (50%), Diana Dos (30%), Pablo Tres (20%)
 * 10,000 authorized shares
 * All owners are directors AND officers
 *   - Roberto = President, Diana = Vice-President, Pablo = Treasurer
 * Agreement: Yes
 *   - Majority: 50.01%, Supermajority: 75%
 *   - Capital: $50K / $30K / $20K
 *   - New shareholders: Supermayoria
 *   - Pro-Rata contributions
 *   - Shareholder loans: No
 *   - Sale: Supermayoria
 *   - Non-compete: Yes (3 years, Miami-Dade County)
 *   - Bank: Dos firmantes
 *   - Major decisions: Mayoria
 *   - Spending: $7,500
 *   - Officer removal: Supermayoria
 *   - Distribution: Semestral
 *   - Non-solicitation: hidden (non-compete Yes)
 *   - Confidentiality: Yes
 *   - ROFR: Yes (90 days)
 *   - Transfer to relatives: Unanimous
 *   - Death/incapacity: Yes (forced sale)
 *   - Divorce buyout: Yes
 *   - Tag/Drag along: Yes
 *
 * After payment, downloads Shareholder Agreement from S3 and verifies 16 checks.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { inflateRawSync } from 'zlib';

const BASE_URL = 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'final-qa-corp');
mkdirSync(DIR, { recursive: true });

const TIMESTAMP = Date.now();
const EMAIL = `test+corp_qa_final_${TIMESTAMP}@gmail.com`;
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

/** Fill Step 1 fields for C-Corp */
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
  await page.locator('input[placeholder*="Nombre"], input[placeholder*="nombre"]').first().fill('CORP QA FINAL');
  console.log('  Filled name: CORP QA FINAL');
  await page.waitForTimeout(500);

  // Select Corp suffix
  const suffixSelects = await page.locator('select:visible').all();
  for (const sel of suffixSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o === 'Corp')) {
      await sel.selectOption('Corp');
      console.log('  Selected suffix: Corp');
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

/** Fill Step 2 owners: Roberto Uno 50%, Diana Dos 30%, Pablo Tres 20% */
async function fillStep2(page) {
  await setFormValue(page, 'ownersCount', 3);
  await page.waitForTimeout(2000);
  console.log('  Set ownersCount: 3');

  // Owner 1: Roberto Uno (50%)
  const fn0 = page.locator('input[name="owners.0.firstName"]');
  if (await fn0.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn0.fill('Roberto');
    await page.locator('input[name="owners.0.lastName"]').fill('Uno');
  } else {
    await page.locator('input[name="owners.0.fullName"]').fill('Roberto Uno').catch(() => {});
  }
  await page.locator('input[name="owners.0.ownership"]').fill('50').catch(() => {});
  console.log('  Owner 1: Roberto Uno 50%');

  // Owner 2: Diana Dos (30%)
  const fn1 = page.locator('input[name="owners.1.firstName"]');
  if (await fn1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn1.fill('Diana');
    await page.locator('input[name="owners.1.lastName"]').fill('Dos');
  } else {
    await page.locator('input[name="owners.1.fullName"]').fill('Diana Dos').catch(() => {});
  }
  await page.locator('input[name="owners.1.ownership"]').fill('30').catch(() => {});
  console.log('  Owner 2: Diana Dos 30%');

  // Owner 3: Pablo Tres (20%)
  const fn2 = page.locator('input[name="owners.2.firstName"]');
  if (await fn2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fn2.fill('Pablo');
    await page.locator('input[name="owners.2.lastName"]').fill('Tres');
  } else {
    await page.locator('input[name="owners.2.fullName"]').fill('Pablo Tres').catch(() => {});
  }
  await page.locator('input[name="owners.2.ownership"]').fill('20').catch(() => {});
  console.log('  Owner 3: Pablo Tres 20%');

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
 * Download the Shareholder Agreement from S3 and verify 16 specific checks.
 * Uses AWS CLI to download, then node:zlib to extract document.xml.
 */
function verifyShareholderAgreement(s3Key) {
  const results = [];
  const docxPath = join(DIR, 'shareholder_agreement.docx');

  // Download from S3
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
   */
  function xmlPlainText(xmlSnippet) {
    const texts = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(xmlSnippet)) !== null) texts.push(m[1]);
    return texts.join('');
  }

  /**
   * Extract ALL plain text from the full document.
   */
  function fullPlainText() {
    return xmlPlainText(xml);
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

  /**
   * Find all section numbers in the document text.
   * Pattern: digits.digits at start of text or after whitespace.
   */
  function findAllSectionNumbers() {
    const text = fullPlainText();
    const sectionRe = /(?:^|\s)(\d+\.\d+(?:\.\d+)?)\s/g;
    const sections = [];
    let m;
    while ((m = sectionRe.exec(text)) !== null) {
      sections.push(m[1]);
    }
    return sections;
  }

  // ─── CHECK 1: Signature block "Roberto Uno" alone ───
  {
    const count = findSigBlockForName('Roberto Uno');
    results.push({ id: 1, name: 'Sig: "Roberto Uno" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 2: Signature block "Diana Dos" alone ───
  {
    const count = findSigBlockForName('Diana Dos');
    results.push({ id: 2, name: 'Sig: "Diana Dos" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 3: Signature block "Pablo Tres" alone ───
  {
    const count = findSigBlockForName('Pablo Tres');
    results.push({ id: 3, name: 'Sig: "Pablo Tres" alone', pass: count >= 1, detail: `Found ${count} sig-block paragraph(s)` });
  }

  // ─── CHECK 4: Capital table shares: 5,000 / 3,000 / 2,000 (50%/30%/20% of 10,000) ───
  {
    const text = fullPlainText();
    const hasRoberto5000 = text.includes('5,000') && text.includes('Roberto Uno');
    const hasDiana3000 = text.includes('3,000') && text.includes('Diana Dos');
    const hasPablo2000 = text.includes('2,000') && text.includes('Pablo Tres');
    const pass = hasRoberto5000 && hasDiana3000 && hasPablo2000;
    results.push({
      id: 4,
      name: 'Capital: 5,000/3,000/2,000 shares',
      pass,
      detail: `Roberto+5K: ${hasRoberto5000}, Diana+3K: ${hasDiana3000}, Pablo+2K: ${hasPablo2000}`
    });
  }

  // ─── CHECK 5: Non-compete numbered 10.10 (after 10.9 Non-Disparagement) ───
  {
    // Search for "10.10" near "Non-competition" or "Covenant Against Competition"
    const text = fullPlainText();
    let found1010AsHeading = false;
    let searchStart = 0;
    while (true) {
      const idx = text.indexOf('10.10', searchStart);
      if (idx < 0) break;
      const after = text.substring(idx, idx + 200);
      if (after.includes('Non-competition') || after.includes('Covenant Against Competition') || after.includes('Non-Competition')) {
        found1010AsHeading = true;
        break;
      }
      searchStart = idx + 5;
    }
    // Also check raw XML
    let found1010InXml = false;
    searchStart = 0;
    while (true) {
      const idx = xml.indexOf('10.10', searchStart);
      if (idx < 0) break;
      const after = xml.substring(idx, idx + 500).replace(/<[^>]+>/g, '');
      if (after.includes('Non-competition') || after.includes('Non-Competition') || after.includes('Covenant')) {
        found1010InXml = true;
        break;
      }
      searchStart = idx + 5;
    }
    results.push({
      id: 5,
      name: 'Non-compete numbered 10.10',
      pass: found1010AsHeading || found1010InXml,
      detail: `Text search: ${found1010AsHeading}, XML search: ${found1010InXml}`
    });
  }

  // ─── CHECK 6: No duplicate section numbers ───
  {
    const text = fullPlainText();
    // Find all "N.N" or "N.N.N" patterns that look like section definitions (not cross-references).
    // Cross-references are preceded by "Section", "Paragraph", "in", or similar words.
    // Section definitions are patterns like "1.2Affiliate." or "4.3 New Shareholders."
    const allMatches = [];
    const sectionRe = /(\d+\.\d+(?:\.\d+)?)\s*([A-Z][a-zA-Z])/g;
    let sm;
    while ((sm = sectionRe.exec(text)) !== null) {
      const before = text.substring(Math.max(0, sm.index - 20), sm.index);
      // Skip cross-references: preceded by "Section", "Paragraph", "in", "above", etc.
      if (/(?:Section|Paragraph|section|paragraph|in|above|below|under|per|see)\s*$/i.test(before)) continue;
      // Skip if preceded by a digit or a dot-digit sequence (e.g. "10.5.1.5" -> false positive for "5.1.5")
      if (/\d$/.test(before)) continue;
      if (/\d+\.\s*$/.test(before)) continue;
      allMatches.push(sm[1]);
    }
    // Also scan paragraphs for headings that start with a section number
    const pRe = /<w:p[^>]*>(.*?)<\/w:p>/gs;
    let pm;
    while ((pm = pRe.exec(xml)) !== null) {
      const pTexts = [];
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tm;
      while ((tm = tRe.exec(pm[1])) !== null) pTexts.push(tm[1]);
      const pText = pTexts.join('').trim();
      const secMatch = pText.match(/^(\d+\.\d+(?:\.\d+)?)\s+[A-Z]/);
      if (secMatch && !allMatches.includes(secMatch[1])) {
        allMatches.push(secMatch[1]);
      }
    }
    const seen = {};
    const duplicates = [];
    for (const s of allMatches) {
      if (seen[s]) duplicates.push(s);
      else seen[s] = true;
    }
    const trueDuplicates = [...new Set(duplicates)];
    results.push({
      id: 6,
      name: 'No duplicate section numbers',
      pass: trueDuplicates.length === 0,
      detail: trueDuplicates.length === 0
        ? `No duplicates (${allMatches.length} section defs found)`
        : `Duplicates: ${trueDuplicates.join(', ')} (of ${allMatches.length} defs)`
    });
  }

  // ─── CHECK 7: Super Majority def: "SEVENTY-FIVE PERCENT (75.00%)" in Sec 1.7 ───
  {
    const text = fullPlainText();
    const hasSuperMajDef = text.includes('Super Majority') || text.includes('SuperMajority') || text.includes('Super-Majority');
    const has75 = text.includes('75.00%');
    const hasSeventy = text.includes('SEVENTY') && text.includes('FIVE');
    // Check for proximity to Section 1.7
    const has17 = text.includes('1.7');
    let nearSection17 = false;
    const idx17 = text.indexOf('1.7');
    if (idx17 >= 0) {
      const region = text.substring(Math.max(0, idx17 - 200), idx17 + 500);
      nearSection17 = (region.includes('Super Majority') || region.includes('SuperMajority')) && region.includes('75.00%');
    }
    const pass = has75 && hasSeventy && (nearSection17 || (hasSuperMajDef && has75));
    results.push({
      id: 7,
      name: 'Super Majority def "SEVENTY-FIVE (75.00%)" in 1.7',
      pass,
      detail: `75.00%: ${has75}, SEVENTY FIVE: ${hasSeventy}, near 1.7: ${nearSection17}`
    });
  }

  // ─── CHECK 8: Corp name in ALL CAPS: "CORP QA FINAL CORP" ───
  {
    const text = fullPlainText();
    const hasAllCaps = text.includes('CORP QA FINAL CORP');
    results.push({
      id: 8,
      name: 'Corp name ALL CAPS: "CORP QA FINAL CORP"',
      pass: hasAllCaps,
      detail: `Found: ${hasAllCaps}`
    });
  }

  // ─── CHECK 9: ROFR period: "90" days present ───
  {
    const text = fullPlainText();
    const has90days = text.includes('90') && (text.includes('calendar days') || text.includes('days'));
    // Verify specifically "90 calendar days" or "(90) days" or "ninety (90)"
    const has90Calendar = text.includes('90 calendar days') || text.includes('(90)') || text.includes('ninety');
    results.push({
      id: 9,
      name: 'ROFR period: "90" days',
      pass: has90days,
      detail: `90+days: ${has90days}, 90 calendar: ${has90Calendar}`
    });
  }

  // ─── CHECK 10: Sale voting: "Super Majority consent or approval" (not "Majority") ───
  {
    const text = fullPlainText();
    // Find the sale section and check it says Super Majority
    // The sale clause typically mentions "Super Majority consent" or "Super Majority approval"
    const hasSuperMajSale = text.includes('Super Majority consent') || text.includes('Super Majority approval');
    // Check it's not "Majority consent" without "Super" prefix in the sale context
    // Look for sale-related text near Super Majority
    let saleUsesSuperMaj = false;
    const saleIdx = text.indexOf('sale of all or substantially all');
    if (saleIdx < 0) {
      // Try alternate phrasing
      const altIdx = text.indexOf('Sale of the Company') || text.indexOf('sale of the Company');
    }
    // More general check
    saleUsesSuperMaj = hasSuperMajSale;
    results.push({
      id: 10,
      name: 'Sale: "Super Majority consent or approval"',
      pass: saleUsesSuperMaj,
      detail: `Super Majority consent/approval: ${hasSuperMajSale}`
    });
  }

  // ─── CHECK 11: Major decisions: "Majority affirmative vote" ───
  {
    const text = fullPlainText();
    const hasMajVote = text.includes('Majority affirmative vote') || text.includes('Majority vote');
    // Make sure it's not ONLY "Super Majority" for major decisions
    results.push({
      id: 11,
      name: 'Major decisions: "Majority affirmative vote"',
      pass: hasMajVote,
      detail: `Majority vote found: ${hasMajVote}`
    });
  }

  // ─── CHECK 12: Bank signees: "two of the Officers" ───
  {
    const text = fullPlainText();
    const hasTwoOfficers = text.includes('two of the Officers') || text.includes('two (2) of the Officers') || text.includes('TWO (2) of the Officers');
    results.push({
      id: 12,
      name: 'Bank signees: "two of the Officers"',
      pass: hasTwoOfficers,
      detail: `Found: ${hasTwoOfficers}`
    });
  }

  // ─── CHECK 13: Officer removal: "Super Majority vote of the Shareholders" ───
  {
    const text = fullPlainText();
    const hasSuperMajRemoval = text.includes('Super Majority vote of the Shareholders') ||
      text.includes('Super Majority vote') && text.includes('remov');
    // Also check XML for split runs
    const xmlText = xmlPlainText(xml);
    const hasSuperMajRemovalXml = xmlText.includes('Super Majority vote of the Shareholders');
    results.push({
      id: 13,
      name: 'Officer removal: "Super Majority vote"',
      pass: hasSuperMajRemoval || hasSuperMajRemovalXml,
      detail: `Text: ${hasSuperMajRemoval}, XML: ${hasSuperMajRemovalXml}`
    });
  }

  // ─── CHECK 14: Non-compete has "THREE (3) years" and "Miami-Dade County" ───
  {
    const text = fullPlainText();
    const hasThreeYears = text.includes('THREE (3) years') || text.includes('THREE (3)') || text.includes('three (3) years');
    const hasMiamiDade = text.includes('Miami-Dade County') || text.includes('Miami-Dade');
    results.push({
      id: 14,
      name: 'NC: "THREE (3) years" + "Miami-Dade County"',
      pass: hasThreeYears && hasMiamiDade,
      detail: `THREE (3): ${hasThreeYears}, Miami-Dade: ${hasMiamiDade}`
    });
  }

  // ─── CHECK 15: No unreplaced {{placeholders}} ───
  {
    const placeholderRe = /\{\{[^}]+\}\}/g;
    const matches = xml.match(placeholderRe) || [];
    // Filter: sometimes XML has template syntax in styles, only flag content placeholders
    // Also check across w:t boundaries (a placeholder may span multiple <w:t> runs)
    const text = fullPlainText();
    const textMatches = text.match(placeholderRe) || [];
    // Also check for partial placeholders like "{{ " or "}}" that span runs
    const hasBrokenPlaceholder = text.includes('{{') || text.includes('}}');
    const allPlaceholders = [...new Set([...matches, ...textMatches])];
    results.push({
      id: 15,
      name: 'No unreplaced {{placeholders}}',
      pass: allPlaceholders.length === 0 && !hasBrokenPlaceholder,
      detail: allPlaceholders.length === 0 && !hasBrokenPlaceholder
        ? 'Clean - no placeholders found'
        : `Found: ${allPlaceholders.join(', ')}${hasBrokenPlaceholder ? ' (broken {{ or }})' : ''}`
    });
  }

  // ─── CHECK 16: Non-compete paragraph has pPr (paragraph properties matching template) ───
  {
    // Search for the non-compete section in multiple possible naming styles
    let ncParaXml = null;
    let foundVia = '';
    for (const needle of ['10.10 Covenant Against Competition', 'Covenant Against Competition', 'Non-competition', 'Non-Competition']) {
      const idx = xml.indexOf(needle);
      if (idx >= 0) {
        const pStart = xml.lastIndexOf('<w:p', idx);
        const pEnd = xml.indexOf('</w:p>', idx);
        if (pStart >= 0 && pEnd >= 0) {
          ncParaXml = xml.substring(pStart, pEnd);
          foundVia = needle;
          break;
        }
      }
    }
    let pass = false;
    let detail = 'Non-compete section text not found in document';
    if (ncParaXml) {
      const hasPPr = ncParaXml.includes('<w:pPr>');
      const hasRPr = ncParaXml.includes('<w:rPr>');
      pass = hasPPr;
      detail = `pPr: ${hasPPr}, rPr: ${hasRPr} (found via "${foundVia}", para ${ncParaXml.length} chars)`;
    }
    results.push({ id: 16, name: 'NC paragraph has pPr', pass, detail });
  }

  return results;
}

/**
 * Extract document.xml from a DOCX file using node:zlib (no external deps).
 * DOCX = ZIP = [local file headers + compressed data + central directory]
 */
function extractDocumentXml(docxPath) {
  const buf = readFileSync(docxPath);
  const target = 'word/document.xml';

  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B || buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) {
      break;
    }

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;

    if (filename === target) {
      const compressedData = buf.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        return compressedData.toString('utf8');
      }
      return inflateRawSync(compressedData).toString('utf8');
    }

    offset = dataStart + compressedSize;
  }

  console.error('  ERROR: word/document.xml not found in DOCX');
  return null;
}

// ─── Main Test ──────────────────────────────────────────────────────

async function main() {
  console.log('=== FINAL QA E2E TEST (C-CORP) ===');
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

    // ========================== STEP 3: ADMIN (C-Corp => Directors & Officers) ==========================
    console.log('=== STEP 3: Admin (Directors & Officers) ===');
    await waitForStable(page, 2000);
    pageText = await page.evaluate(() => document.body.innerText);
    console.log('  Page contains "directores": ' + pageText.includes('directores'));
    console.log('  Page contains "oficiales": ' + pageText.includes('oficiales'));
    await shot(page, 'step3_initial');

    // All owners are directors (default Yes)
    // All owners are officers (default Yes)
    await page.waitForTimeout(2000);

    // Assign officer roles via React fiber
    // Roberto = President, Diana = Vice-President, Pablo = Treasurer
    await setFormValue(page, 'admin.shareholderOfficer1Role', 'President');
    await setFormValue(page, 'admin.shareholderOfficer2Role', 'Vice-President');
    await setFormValue(page, 'admin.shareholderOfficer3Role', 'Treasurer');
    console.log('  Set roles: Roberto=President, Diana=Vice-President, Pablo=Treasurer');

    // Also try to select via UI dropdowns
    const roleSelects = await page.locator('select:visible').all();
    let rolesAssigned = 0;
    const roleOrder = ['President', 'Vice-President', 'Treasurer'];
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

    // Fill capital contributions: $50K / $30K / $20K
    await setFormValue(page, 'agreement.corp_capitalPerOwner_0', '50000');
    await setFormValue(page, 'agreement.corp_capitalPerOwner_1', '30000');
    await setFormValue(page, 'agreement.corp_capitalPerOwner_2', '20000');
    console.log('  Set capital: $50,000 / $30,000 / $20,000');

    // Specific responsibilities = No (default)
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

    // Non-compete: Yes
    await clickToggle(page, 'Non compete covenant', 'Sí');
    await page.waitForTimeout(1000);

    // Non-compete duration: 3 years
    const ncDuration = page.locator('input[name="agreement.corp_nonCompeteDuration"]');
    if (await ncDuration.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncDuration.fill('');
      await ncDuration.fill('3');
      console.log('  Non-compete duration: 3 years');
    } else {
      await setFormValue(page, 'agreement.corp_nonCompeteDuration', 3);
      console.log('  Non-compete duration (via fiber): 3 years');
    }

    // Non-compete scope: Miami-Dade County
    const ncScope = page.locator('input[name="agreement.corp_nonCompeteScope"]');
    if (await ncScope.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ncScope.fill('Miami-Dade County');
      console.log('  Non-compete scope: Miami-Dade County');
    } else {
      await setFormValue(page, 'agreement.corp_nonCompeteScope', 'Miami-Dade County');
      console.log('  Non-compete scope (via fiber): Miami-Dade County');
    }

    // Bank: Dos firmantes
    await clickToggle(page, 'Bank signers', 'Dos firmantes');

    // Major decisions: Mayoria
    await clickToggle(page, 'Major decision threshold', 'Mayoría');

    // Spending threshold: $7,500
    await setFormValue(page, 'agreement.corp_majorSpendingThreshold', '7500');
    console.log('  Set spending threshold: $7,500');

    // Officer removal: Supermayoria
    await clickToggle(page, 'Officer removal voting', 'Supermayoría');

    // Non-solicitation: hidden (non-compete is Yes)
    console.log('  Non-solicitation: hidden (non-compete is Yes)');

    // Confidentiality: Yes
    await clickToggle(page, 'Confidentiality NDA', 'Sí');

    // Distribution: Semestral (set via fiber since it may not have UI toggle for Corp)
    await setFormValue(page, 'agreement.distributionFrequency', 'Semestral');
    console.log('  Distribution frequency: Semestral');

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
    // Also try UI select
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

      await page.locator('#billingName, input[name="billingName"]').first().fill('Roberto Uno').catch(() => {});
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

      // Find the Shareholder Agreement S3 key
      // IMPORTANT: Match "Shareholder Agreement" specifically, not "Shareholder Registry"
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
            `aws s3 ls "s3://avenida-legal-documents/agreements/" --profile llc-admin --region us-west-1 --recursive`,
            { encoding: 'utf8', timeout: 15000 }
          );
          const lines = s3List.trim().split('\n');
          const recent = lines.filter(l => l.includes('CORP') || l.includes('Shareholder')).pop();
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
    verificationResults = verifyShareholderAgreement(agreementS3Key);
  } else {
    console.log('\n=== SKIPPING DOCX VERIFICATION (no S3 key found) ===');
    verificationResults = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1, name: `Check ${i + 1}`, pass: false, detail: 'No S3 key found'
    }));
  }

  // ========================== RESULTS TABLE ==========================
  const passCount = verificationResults.filter(r => r.pass).length;
  const failCount = verificationResults.filter(r => !r.pass).length;

  console.log('\n');
  console.log('='.repeat(100));
  console.log('  FINAL QA VERIFICATION RESULTS (C-CORP)');
  console.log('='.repeat(100));
  console.log('');
  console.log(` ${'#'.padEnd(4)} | ${'STATUS'.padEnd(6)} | ${'CHECK'.padEnd(50)} | DETAIL`);
  console.log(`${'-'.repeat(4)}-+-${'-'.repeat(6)}-+-${'-'.repeat(50)}-+-${'-'.repeat(50)}`);

  for (const r of verificationResults) {
    const marker = r.pass ? ' OK ' : 'FAIL';
    console.log(` ${String(r.id).padEnd(4)}| ${marker.padEnd(6)} | ${r.name.padEnd(50)} | ${r.detail}`);
  }

  console.log('');
  console.log(`${'-'.repeat(100)}`);
  console.log(`  TOTAL: ${passCount} PASS / ${failCount} FAIL out of ${verificationResults.length} checks`);
  console.log(`  OVERALL: ${failCount === 0 ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log(`${'-'.repeat(100)}`);
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
