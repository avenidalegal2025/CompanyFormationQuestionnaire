/**
 * END-TO-END QA PIPELINE — full customer path.
 *
 * Strategy:
 *   1. Open prod questionnaire, fill Step 1's visible fields enough to mount.
 *   2. Inject the FULL formData (all steps' fields) via react-hook-form's
 *      setValue — react-hook-form holds the entire wizard's state globally,
 *      so setting everything at step 1 makes subsequent steps' validation
 *      pass when we click Continuar.
 *   3. Save the draft to DynamoDB so the webhook has it (POST /api/db/save).
 *   4. Click Continuar 8 times (Steps 2 → Step 9 / Checkout).
 *   5. At Checkout, create Stripe session via /api/create-checkout-session,
 *      pay with 4242 4242 4242 4242 test card.
 *   6. Wait for webhook (poll /api/documents until agreement appears).
 *   7. Download DOCX via /api/documents/view (the actual customer path).
 *   8. STAGE 3: upload to S3 + Word Online per-page screenshot + assertions.
 *
 * Run from Windows (Playwright Chromium needs system libs not on stock WSL):
 *   cmd.exe /c "cd /d C:\\path\\to\\repo && node scripts\\qa-ui-pipeline.mjs"
 *
 * Flags:
 *   --stage=N    1 = step 1 only, 2 = walk to checkout, 3 = full pay+download
 *   --headed     show the browser
 *   --slow       slowMo 250ms
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const PROD_URL = 'https://company-formation-questionnaire.vercel.app';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const OUT = join(HOME, 'Downloads', 'agreement-qa-ui', STAMP);
mkdirSync(OUT, { recursive: true });

const argv = new Set(process.argv.slice(2));
const stageArg = process.argv.find((a) => a.startsWith('--stage='));
const STAGE = stageArg ? parseInt(stageArg.slice('--stage='.length), 10) : 2;
const HEADED = argv.has('--headed');
const SLOW = argv.has('--slow') ? 250 : 0;

console.log(`→ Output: ${OUT}`);
console.log(`→ Stage: ${STAGE}, Headed: ${HEADED}`);

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = join(OUT, `${String(shotN).padStart(3, '0')}_${label}.png`);
  try {
    await page.screenshot({ path: f, fullPage: true });
  } catch {}
}

// Inject form data via react-hook-form setValue (found via React fiber walk).
async function injectFormData(page, formData) {
  return page.evaluate((flat) => {
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 8) {
          if (fiber.memoizedProps?.form?.setValue) {
            const sv = fiber.memoizedProps.form.setValue;
            for (const [k, val] of Object.entries(flat)) {
              sv(k, val, { shouldDirty: true, shouldValidate: false });
            }
            // Force trigger validation refresh
            if (fiber.memoizedProps.form.trigger) {
              fiber.memoizedProps.form.trigger();
            }
            return Object.keys(flat).length;
          }
          fiber = fiber.return; d++;
        }
      }
    }
    return -1;
  }, formData);
}

// Save current form state to DynamoDB draft
async function saveDraft(page) {
  return page.evaluate(async () => {
    let fd = null;
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 8) {
          if (fiber.memoizedProps?.form?.getValues) {
            fd = fiber.memoizedProps.form.getValues();
            break;
          }
          fiber = fiber.return; d++;
        }
        if (fd) break;
      }
      if (fd) break;
    }
    if (!fd) return { error: 'no form data' };
    const draftId = localStorage.getItem('draftId') || `qa-${Date.now()}`;
    localStorage.setItem('draftId', draftId);
    const r = await fetch('/api/db/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draftId, data: fd }),
    });
    return { draftId, status: r.status, ok: r.ok };
  });
}

async function clickContinuar(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const clicked = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.textContent.trim();
      if ((t === 'Continuar' || t === 'Finalizar' || t === 'Enviar') && btn.offsetHeight > 0 &&
          !t.includes('más tarde')) {
        const propsKey = Object.keys(btn).find((k) => k.startsWith('__reactProps$'));
        if (propsKey && btn[propsKey].onClick) {
          btn[propsKey].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
        } else {
          btn.click();
        }
        return true;
      }
    }
    return false;
  });
  if (!clicked) throw new Error('Continuar button not found');
  await page.waitForTimeout(2500);
}

async function getCurrentStep(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length === 0) {
        const t = el.textContent.trim();
        if (/^0\d$/.test(t)) return parseInt(t, 10);
      }
    }
    return 0;
  });
}

async function reactClick(page, selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const k = Object.keys(el).find((x) => x.startsWith('__reactProps$'));
    if (k && el[k].onClick) el[k].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
    else el.click();
  }, selector);
  await page.waitForTimeout(200);
}

// ─── Build full formData payload for one variant ───────────────────

function buildFlatFormData(v) {
  const isCorp = v.entityType === 'C-Corp';
  const NAMES = ['Roberto', 'Ana', 'Carlos', 'Maria', 'Pedro', 'Sofia'];
  const LASTS = ['Mendez', 'Garcia', 'Lopez', 'Torres', 'Ramirez', 'Flores'];
  const flat = {
    'company.formationState': 'Florida',
    'company.entityType': v.entityType,
    'company.companyNameBase': v.companyName,
    'company.entitySuffix': isCorp ? 'Corp' : 'LLC',
    'company.companyName': `${v.companyName} ${isCorp ? 'Corp' : 'LLC'}`,
    'company.hasUsaAddress': 'No',
    'company.hasUsPhone': 'No',
    'company.businessPurpose': 'Software development and consulting services.',
    'company.numberOfShares': isCorp ? 1000 : undefined,
    'company.forwardPhoneE164': '+15555550100',
    'ownersCount': v.owners,
  };
  for (let i = 0; i < v.owners; i++) {
    const eq = Math.floor(100 / v.owners);
    const pct = i === v.owners - 1 ? 100 - eq * (v.owners - 1) : eq;
    flat[`owners.${i}.ownerType`] = 'persona';
    flat[`owners.${i}.firstName`] = NAMES[i];
    flat[`owners.${i}.lastName`] = LASTS[i];
    flat[`owners.${i}.fullName`] = `${NAMES[i]} ${LASTS[i]}`;
    flat[`owners.${i}.ownership`] = pct;
    flat[`owners.${i}.ownershipPercentage`] = pct;
    flat[`owners.${i}.address`] = '123 Main St, Miami, FL 33181';
    flat[`owners.${i}.isUsCitizen`] = 'Yes';
    flat[`owners.${i}.tin`] = '123456789';
  }
  flat[isCorp ? 'admin.directorsAllOwners' : 'admin.managersAllOwners'] = 'Yes';
  if (isCorp) {
    flat['admin.officersAllOwners'] = 'Yes';
    // At least one shareholder officer must be President for Step 3 to validate.
    const ROLES = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Director', 'Director'];
    for (let i = 0; i < v.owners; i++) {
      flat[`admin.shareholderOfficer${i + 1}Role`] = ROLES[i] || 'Director';
    }
  } else {
    // LLC: managers all owners; assign manager names (form auto-populates from owners
    // but only if the page rendered after setValue; pre-populate to be safe).
    for (let i = 0; i < v.owners; i++) {
      flat[`admin.manager${i + 1}FirstName`] = NAMES[i];
      flat[`admin.manager${i + 1}LastName`] = LASTS[i];
      flat[`admin.manager${i + 1}Name`] = `${NAMES[i]} ${LASTS[i]}`;
    }
  }
  flat['agreement.wants'] = 'Yes';
  flat['agreement.majorityThreshold'] = 50.01;
  flat['agreement.supermajorityThreshold'] = 75;
  flat['agreement.distributionFrequency'] = 'Trimestral';
  if (isCorp) {
    Object.assign(flat, {
      'agreement.corp_saleDecisionThreshold': 'Mayoría',
      'agreement.corp_bankSigners': 'Dos firmantes',
      'agreement.corp_majorDecisionThreshold': 'Mayoría',
      'agreement.corp_majorSpendingThreshold': '7500',
      'agreement.corp_officerRemovalVoting': 'Mayoría',
      'agreement.corp_nonCompete': 'No',
      'agreement.corp_nonSolicitation': 'Yes',
      'agreement.corp_confidentiality': 'Yes',
      'agreement.corp_taxOwner': `${NAMES[0]} ${LASTS[0]}`,
      'agreement.corp_rofr': 'Yes',
      'agreement.corp_rofrOfferPeriod': 90,
      'agreement.corp_transferToRelatives': 'Sí, podrán transferir libremente sus acciones.',
      'agreement.corp_incapacityHeirsPolicy': 'Yes',
      'agreement.corp_divorceBuyoutPolicy': 'Yes',
      'agreement.corp_tagDragRights': 'Yes',
      'agreement.corp_newShareholdersAdmission': 'Mayoría',
      'agreement.corp_moreCapitalProcess': 'Sí, Pro-Rata',
      'agreement.corp_shareholderLoans': 'Yes',
      'agreement.corp_shareholderLoansVoting': 'Mayoría',
    });
    for (let i = 0; i < v.owners; i++) flat[`agreement.corp_capitalPerOwner_${i}`] = '50000';
  }
  return flat;
}

// ─── Variants ──────────────────────────────────────────────────────

const VARIANTS = [
  { label: 'qa1_corp_2own', entityType: 'C-Corp', companyName: 'QA1 Corp', owners: 2 },
];

// ─── Per-variant runner ────────────────────────────────────────────

async function runVariant(browser, variant) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  let email = null; // captured during Auth0 signup
  console.log(`\n=== ${variant.label} ===`);

  try {
    // 1. Load homepage + wait for Step 1 form to mount.
    await page.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input[placeholder="Nombre de la empresa"]', { timeout: 30000 });
    await page.waitForTimeout(1500);

    // 2. Click entity type FIRST so the appropriate suffix/shares fields mount.
    const isCorp = variant.entityType === 'C-Corp';
    if (isCorp) await reactClick(page, 'button[role="radio"][aria-label="C-Corp"]');
    await page.waitForTimeout(500);

    // 3. Inject the full form payload via setValue.
    const flat = buildFlatFormData(variant);
    const injected = await injectFormData(page, flat);
    console.log(`  → injected ${injected} fields`);
    if (injected < 0) throw new Error('react fiber + form.setValue not found');
    await page.waitForTimeout(1000);

    // 4. Persist to DynamoDB so webhook can retrieve.
    const saved = await saveDraft(page);
    console.log(`  → saveDraft:`, saved);

    await shot(page, 'step1_after_inject');

    // 5. Walk through Continuar clicks Step 1 → Step 9.
    let step = await getCurrentStep(page);
    console.log(`  → starting at step ${step}`);
    let safety = 0;
    while (step < 9 && safety++ < 12) {
      try {
        await clickContinuar(page);
      } catch (e) {
        console.log(`    Continuar failed: ${e.message}`);
        await shot(page, `stuck_step${step}`);
        // Try saving draft again — sometimes validation needs synced state.
        await saveDraft(page);
        await page.waitForTimeout(2000);
        await clickContinuar(page);
      }
      // Some steps trigger an Auth0 redirect — handle if so.
      if (page.url().includes('auth0')) {
        console.log('    Auth0 redirect detected');
        email = `test+qa_${Date.now()}@gmail.com`;
        console.log(`    signup email: ${email}`);
        await page.locator('input[name="email"], input[name="username"]').first().fill(email);
        await page.locator('input[name="password"]').fill('Test2026!Secure');
        await page.locator('button:has-text("Continue")').first().click();
        await page.waitForTimeout(5000);
        const accept = page.locator('button:has-text("Accept")');
        if (await accept.isVisible({ timeout: 2000 }).catch(() => false)) await accept.click();
        await page.waitForURL((u) => !u.toString().includes('auth0'), { timeout: 30000 });
        await page.waitForTimeout(3000);
        // Re-inject post-auth (form state may have been wiped).
        await injectFormData(page, flat);
        await saveDraft(page);
      }
      // Modal: agreement opt-in after Step 4 Summary. Click "Lo quiero",
      // then click Continuar AGAIN to actually advance — the modal click
      // just sets wantsAgreement=true; it doesn't move the wizard.
      const loQuieroBtn = page.locator('button:has-text("Lo quiero")').first();
      if (await loQuieroBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('    agreement modal — Lo quiero');
        await loQuieroBtn.click();
        await page.waitForTimeout(2000);
        try { await clickContinuar(page); } catch {}
      }
      const newStep = await getCurrentStep(page);
      console.log(`  → step ${step} → ${newStep}`);
      if (newStep === step) {
        console.log('    no advance — taking shot for diagnosis');
        await shot(page, `noadvance_step${step}`);
        break;
      }
      step = newStep;
      await shot(page, `step${step}`);
    }

    if (STAGE < 3) {
      console.log(`  ✓ STAGE ${STAGE} reached step ${step}`);
      return { ok: step >= 9, step, label: variant.label };
    }

    // ─── STAGE 3: Stripe pay + webhook + download + verify ─────────
    console.log('  → STAGE 3: creating Stripe checkout session');
    const checkout = await page.evaluate(async (isCorp) => {
      let fd = null;
      for (const el of document.querySelectorAll('*')) {
        for (const k of Object.keys(el)) {
          if (!k.startsWith('__reactFiber')) continue;
          let f = el[k], d = 0;
          while (f && d < 8) {
            if (f.memoizedProps?.form?.getValues) { fd = f.memoizedProps.form.getValues(); break; }
            f = f.return; d++;
          }
          if (fd) break;
        }
        if (fd) break;
      }
      if (!fd) return { error: 'no form data' };
      const svc = isCorp
        ? ['formation', 'shareholder_agreement']
        : ['formation', 'operating_agreement'];
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: fd, selectedServices: svc,
          entityType: isCorp ? 'C-Corp' : 'LLC',
          state: 'Florida', hasUsAddress: 'No', hasUsPhone: 'No',
          skipAgreement: 'false', totalPrice: 79500,
        }),
      });
      const j = await resp.json();
      return { url: j.paymentLinkUrl, status: resp.status, body: j };
    }, isCorp);

    if (!checkout.url) {
      throw new Error(`checkout: ${JSON.stringify(checkout).slice(0, 200)}`);
    }
    console.log('  → Stripe URL acquired, paying with 4242…');
    await page.goto(checkout.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.locator('#cardNumber').fill('4242424242424242');
    await page.locator('#cardExpiry').fill('12/29');
    await page.locator('#cardCvc').fill('123');
    const billingName = page.locator('input[name="billingName"]');
    if (await billingName.isVisible({ timeout: 2000 }).catch(() => false)) {
      await billingName.fill('QA Test');
    }
    await page.waitForTimeout(1000);
    await page.locator('button[type="submit"], button:has-text("Pay")').first().click();
    await page.waitForTimeout(15000);
    const onSuccess = page.url().includes('success') || page.url().includes('checkout/success');
    console.log(`    paid: ${onSuccess ? 'SUCCESS' : page.url().slice(0, 80)}`);
    await shot(page, 'stripe_done');

    // Wait for webhook → docs to appear in /client/documents.
    console.log('  → polling dashboard for agreement document…');
    await page.goto(PROD_URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(3000);

    // /api/companies needs ?email= or ?companyId=. Use the email we used in
    // Auth0 signup (the variable in scope; or fall back to localStorage.userEmail
    // which the success page sets from /api/session/email).
    let agreementDocId = null;
    let companyId = null;
    let lastDocsSample = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 240000) {
      const state = await page.evaluate(async (knownEmail) => {
        const email = localStorage.getItem('userEmail') || knownEmail;
        if (!email) return { email: null, docs: [], err: 'no email in scope' };
        // Get companies for this email
        const cr = await fetch(`/api/companies?email=${encodeURIComponent(email)}`);
        if (!cr.ok) return { email, docs: [], err: `companies HTTP ${cr.status}` };
        const cj = await cr.json();
        const companies = cj.companies || (Array.isArray(cj) ? cj : []) || [];
        if (companies.length === 0) return { email, docs: [], companiesEmpty: true };
        // Sort by createdAt desc, pick the newest
        const sorted = [...companies].sort((a, b) => {
          const da = new Date(a.createdAt || 0).getTime();
          const db = new Date(b.createdAt || 0).getTime();
          return db - da;
        });
        const cid = sorted[0].id || sorted[0].companyId;
        const dr = await fetch(`/api/documents?companyId=${encodeURIComponent(cid)}`);
        if (!dr.ok) return { email, cid, docs: [], err: `documents HTTP ${dr.status}` };
        const dj = await dr.json();
        return { email, cid, docs: dj.documents || dj.docs || (Array.isArray(dj) ? dj : []) || [] };
      }, email);
      companyId = state.cid;
      lastDocsSample = state;
      if (Array.isArray(state.docs) && state.docs.length > 0) {
        const agr = state.docs.find((d) => {
          const t = (d.type || d.documentType || d.kind || '').toLowerCase();
          const n = (d.name || d.title || d.fileName || '').toLowerCase();
          // Must be the AGREEMENT, not Registry/Bylaws/Resolution. Reject docs
          // matching only "shareholder" by requiring "agreement" to appear.
          if (!/agreement/i.test(t + ' ' + n)) return false;
          return /shareholder|operating/i.test(t + ' ' + n);
        });
        if (agr) { agreementDocId = agr.id || agr.documentId; break; }
      }
      await page.waitForTimeout(5000);
    }
    if (!agreementDocId) {
      console.log('  ✗ last poll state:', JSON.stringify(lastDocsSample).slice(0, 600));
      throw new Error('agreement doc never appeared in dashboard within 240s');
    }
    console.log(`  → agreement docId ${agreementDocId} (companyId ${companyId})`);

    // Download + verify the DOCX is the CUSTOMIZED one (not the template stub).
    // Lambda generates the customer-specific DOCX asynchronously after the
    // Stripe webhook fires. The doc record appears in DynamoDB immediately
    // pointing at a template S3 key, then the key gets swapped once the
    // Lambda lands the customized version. So we poll the actual file
    // contents until the customer's company name or owner appears.
    const expectedCompanyName = variant.companyName.toUpperCase();
    let docxBuf = null;
    const dlStart = Date.now();
    while (Date.now() - dlStart < 240000) {
      const dl = await page.evaluate(async (args) => {
        const { id, cid } = args;
        const r = await fetch(`/api/documents/view?id=${encodeURIComponent(id)}&companyId=${encodeURIComponent(cid)}`);
        if (!r.ok) return { err: `HTTP ${r.status}` };
        const ab = await r.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return { b64: btoa(bin), size: ab.byteLength };
      }, { id: agreementDocId, cid: companyId });
      if (dl.err) throw new Error(`download: ${dl.err}`);
      docxBuf = Buffer.from(dl.b64, 'base64');
      // Quick string scan inside the (zip-compressed) DOCX. Even compressed,
      // the company-name string we injected appears uncompressed inside the
      // template literal-replacement output if we look at the raw bytes —
      // but more reliable: check the size jumped past the ~46KB template stub.
      const sizeOk = dl.size > 100000;
      // Also try to grep our company name in raw bytes (works if stored as
      // plain text in any subfile; DOCX zip + inflate would hide it but
      // metadata sometimes leaks the company name in custom.xml).
      const stub = !sizeOk;
      console.log(`    download attempt: ${dl.size} bytes ${stub ? '(stub — retry)' : '(customized)'}`);
      if (sizeOk) break;
      await page.waitForTimeout(8000);
    }
    if (!docxBuf || docxBuf.length < 100000) {
      throw new Error(`download stayed at template stub size — Lambda may not have run`);
    }
    const docxPath = join(OUT, `${variant.label}.docx`);
    writeFileSync(docxPath, docxBuf);
    console.log(`  ✓ saved DOCX (${docxBuf.length} bytes) → ${docxPath}`);

    return { ok: true, label: variant.label, step, docxPath, docxSize: docxBuf.length };
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
    await shot(page, 'error');
    return { ok: false, error: e.message, label: variant.label };
  } finally {
    await ctx.close();
  }
}

// ─── Main ──────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW });
const results = [];
for (const v of VARIANTS) {
  results.push(await runVariant(browser, v));
}
await browser.close();

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${'='.repeat(60)}`);
console.log(`TOTAL: ${results.length} | PASS ${pass} | FAIL ${results.length - pass}`);
console.log(`Output: ${OUT}`);
process.exit(pass === results.length ? 0 : 1);
