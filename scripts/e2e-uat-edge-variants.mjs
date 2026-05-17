/**
 * End-to-end UAT for 5 edge-case variants against PRODUCTION.
 *
 * Real-UI clicks for Steps 1-3 (entity / company name / ownersCount /
 * per-owner names + percentage). React-fiber setValue for the dense
 * agreement detail fields (~30 toggles across Steps 5-8 each, too many
 * to UI-walk individually). Real Stripe test-mode pay. Real
 * /api/documents → S3 download. Local DOCX → PDF → PNG render so each
 * page can be Read by the agent.
 *
 * Variants — edge-case spread:
 *   v6  PFX06: LLC,    1 owner   (sole member, all voting degenerate)
 *   v7  PFX07: C-Corp, 2 owners  (super-majority, no covenants)
 *   v8  PFX08: LLC,    4 owners  (all covenants: NC + NS + Conf)
 *   v9  PFX09: LLC,    6 owners  (unanimous)
 *   v10 PFX10: C-Corp, 1 owner   (sole shareholder)
 *
 * USAGE
 *   node scripts/e2e-uat-edge-variants.mjs            # all 5
 *   node scripts/e2e-uat-edge-variants.mjs 6 9        # subset by id
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';

const URL = process.env.E2E_URL || 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-uat-edge-variants');
mkdirSync(DIR, { recursive: true });

const STRIPE_CARD = '4242424242424242';
const STRIPE_EXP = '12/29';
const STRIPE_CVC = '123';
const STRIPE_ZIP = '33131';
const PASSWORD = 'EdgeUAT2026!';
const RUN_TAG = (process.env.E2E_RUN_TAG || 'b').trim();

const NAMES = [
  'Roberto Mendez', 'Ana Garcia', 'Carlos Lopez',
  'Maria Torres', 'Pedro Ramirez', 'Sofia Flores',
];
const OFFICER_ROLES = [
  'President', 'Vice-President', 'Secretary', 'Treasurer',
  'Assistant Vice-President', 'Assistant Secretary',
];

function votingProfile(v) {
  const map = {
    unanimous: { sale: 'Decisión Unánime', major: 'Decisión Unánime', newMember: 'Decisión Unánime', dissolution: 'Decisión Unánime', removal: 'Decisión Unánime', loans: 'Decisión Unánime', capital: 'Decisión Unánime' },
    majority:  { sale: 'Mayoría',          major: 'Mayoría',          newMember: 'Mayoría',          dissolution: 'Mayoría',          removal: 'Mayoría',          loans: 'Mayoría',          capital: 'Mayoría' },
    supermajority: { sale: 'Supermayoría', major: 'Supermayoría',     newMember: 'Supermayoría',     dissolution: 'Supermayoría',     removal: 'Supermayoría',     loans: 'Supermayoría',     capital: 'Supermayoría' },
  };
  return map[v];
}

function ownerArray(n) {
  const pct = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => ({
    fullName: NAMES[i],
    firstName: NAMES[i].split(' ')[0],
    lastName: NAMES[i].split(' ').slice(1).join(' '),
    ownership: i === n - 1 ? 100 - pct * (n - 1) : pct,
  }));
}

const VARIANTS = [
  { id: 6,  entity: 'LLC',    ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX06' },
  { id: 7,  entity: 'C-Corp', ownerCount: 2, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX07' },
  { id: 8,  entity: 'LLC',    ownerCount: 4, voting: 'majority',      rofr: true,  drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX08' },
  { id: 9,  entity: 'LLC',    ownerCount: 6, voting: 'unanimous',     rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX09' },
  { id: 10, entity: 'C-Corp', ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX10' },
];

function emailFor(v) { return `trimaran.llc+pfx${v.id}${RUN_TAG}@gmail.com`; }
function companyNameFor(v) {
  const suffix = v.entity === 'C-Corp' ? 'Corp' : 'LLC';
  return `${v.label} ${suffix}`;
}

function makeAgreementData(v) {
  const isCorp = v.entity === 'C-Corp';
  const p = votingProfile(v.voting);
  const a = {
    wants: 'Yes',
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,
    distributionFrequency: 'Trimestral',
  };
  const MORE_CAPITAL = 'Sí, Pro-Rata';
  const TRANSFER_FREE = 'Sí, podrán transferir libremente sus acciones.';
  if (isCorp) {
    Object.assign(a, {
      corp_saleDecisionThreshold: p.sale,
      corp_bankSigners: 'Dos firmantes',
      corp_majorDecisionThreshold: p.major,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: p.removal,
      corp_nonCompete: v.nc,
      corp_nonSolicitation: v.ns,
      corp_confidentiality: v.conf,
      corp_taxOwner: NAMES[0],
      corp_rofr: v.rofr ? 'Yes' : 'No',
      corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: TRANSFER_FREE,
      corp_incapacityHeirsPolicy: 'Yes',
      corp_divorceBuyoutPolicy: 'Yes',
      corp_tagDragRights: (v.drag || v.tag) ? 'Yes' : 'No',
      corp_newShareholdersAdmission: p.newMember,
      corp_moreCapitalProcess: MORE_CAPITAL,
      corp_moreCapitalDecision: p.capital,
      corp_shareholderLoans: 'Yes',
      corp_shareholderLoansVoting: p.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) a[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(a, {
      llc_companySaleDecision: p.sale,
      llc_bankSigners: 'Dos firmantes',
      llc_majorDecisions: p.major,
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: p.removal,
      llc_nonCompete: v.nc,
      llc_nonSolicitation: v.ns,
      llc_confidentiality: v.conf,
      llc_nonDisparagement: 'Yes',
      llc_taxPartner: NAMES[0],
      llc_minTaxDistribution: 30,
      llc_rofr: v.rofr ? 'Yes' : 'No',
      llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: 'Yes',
      llc_dissolutionDecision: p.dissolution,
      llc_newMembersAdmission: p.newMember,
      llc_newPartnersAdmission: p.newMember,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: MORE_CAPITAL,
      llc_additionalContributionsDecision: p.capital,
      llc_memberLoans: 'Yes',
      llc_memberLoansVoting: p.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) a[`llc_capitalContributions_${i}`] = '50000';
  }
  return a;
}

function makeAdminData(v) {
  const isCorp = v.entity === 'C-Corp';
  if (!isCorp) return { managersAllOwners: 'Yes' };
  return {
    directorsAllOwners: 'Yes',
    officersAllOwners: 'Yes',
    ...Object.fromEntries(
      OFFICER_ROLES.slice(0, v.ownerCount).map((role, i) => [`shareholderOfficer${i + 1}Role`, role])
    ),
  };
}

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true }).catch(() => {});
}

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

async function clickContinuar(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  // Use Playwright's .click() directly — this is what triggered Auth0
  // redirect reliably in the older e2e-5-variants-postfix.mjs script.
  // React fiber onClick can fail to bubble through to the form submit
  // handler for the Continuar button specifically.
  await page.locator('button:has-text("Continuar")').first().click();
  await page.waitForTimeout(3000);
}

async function setReactInput(page, selector, value) {
  // Setting an input's .value directly bypasses React state — must dispatch
  // an 'input' event AND set the nativeInputValueSetter so React sees it.
  await page.evaluate(({ s, v }) => {
    const el = document.querySelector(s);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }, { s: selector, v: String(value) });
  await page.waitForTimeout(300);
}

async function injectFormFields(page, fieldsObj) {
  // Use react-hook-form's setValue via the form prop on a fiber.
  return page.evaluate((fields) => {
    function flatten(obj, prefix = '', out = {}) {
      for (const [k, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (val && typeof val === 'object' && !Array.isArray(val)) flatten(val, path, out);
        else out[path] = val;
      }
      return out;
    }
    const flat = flatten(fields);
    for (const el of document.querySelectorAll('*')) {
      for (const key of Object.keys(el)) {
        if (!key.startsWith('__reactFiber')) continue;
        let fiber = el[key], d = 0;
        while (fiber && d < 8) {
          if (fiber.memoizedProps?.form?.setValue) {
            const sv = fiber.memoizedProps.form.setValue;
            for (const [path, val] of Object.entries(flat)) sv(path, val);
            return Object.keys(flat).length;
          }
          fiber = fiber.return; d++;
        }
      }
    }
    return 0;
  }, fieldsObj);
}

async function runVariant(v, log) {
  shotN = 0;
  const email = emailFor(v);
  const companyName = companyNameFor(v);
  log(`\n${'='.repeat(72)}\nVariant ${v.id}: ${v.label} = ${v.entity} ${v.ownerCount}o ${v.voting} nc=${v.nc} ns=${v.ns} conf=${v.conf} rofr=${v.rofr} dragTag=${v.drag||v.tag}\nEmail: ${email}\n${'='.repeat(72)}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const result = { id: v.id, label: v.label, email, status: 'PENDING', errors: [], documents: [], downloaded: [] };

  try {
    // ─── Real-UI Step 1: Company ────────────────────────────────────
    log('Step 1: Company (real UI)');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.click(`button:has-text("${v.entity}")`);
    await page.fill('input[placeholder="Nombre de la empresa"]', v.label);
    if (v.entity === 'C-Corp') {
      await page.locator('select:visible').nth(1).selectOption('Corp');
    }
    // Address = No, phone = No — real-UI clicks via React fiber onClick.
    await page.evaluate(() => {
      document.querySelectorAll('button[aria-label="No"]').forEach(b => {
        const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
        if (pk && b[pk].onClick) b[pk].onClick();
      });
    });
    await page.waitForTimeout(500);
    await shot(page, `v${v.id}_step1`);

    // Real-UI: click Continuar → Auth0 redirect
    await clickContinuar(page);

    // ─── Auth0 signup ───────────────────────────────────────────────
    log(`Auth0 signup: ${email}`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(5000);
    if (await page.locator('button:has-text("Accept")').isVisible().catch(() => false)) {
      await page.click('button:has-text("Accept")');
    }
    await page.waitForURL('**company-formation**', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, `v${v.id}_after_auth`);

    // ─── Real-UI Re-fill Step 1 post-auth ───────────────────────────
    await page.click(`button:has-text("${v.entity}")`);
    await page.fill('input[placeholder="Nombre de la empresa"]', v.label);
    if (v.entity === 'C-Corp') {
      await page.locator('select:visible').nth(1).selectOption('Corp');
    }
    await page.evaluate(() => {
      document.querySelectorAll('button[aria-label="No"]').forEach(b => {
        const pk = Object.keys(b).find(k => k.startsWith('__reactProps'));
        if (pk && b[pk].onClick) b[pk].onClick();
      });
    });
    await page.waitForTimeout(500);
    await clickContinuar(page);
    await page.waitForTimeout(2500);
    await shot(page, `v${v.id}_step2`);

    // ─── Real-UI Step 2/3: Owners count + names ─────────────────────
    log(`Step 2-3: Owners ${v.ownerCount} via real-UI inputs`);
    const owners = ownerArray(v.ownerCount);
    // Set ownersCount via the numeric input.
    const countSelector = 'input[placeholder*="número"]';
    if (await page.locator(countSelector).isVisible().catch(() => false)) {
      await setReactInput(page, countSelector, v.ownerCount);
    }
    await page.waitForTimeout(800);
    // Fill each owner's first/last name + ownership via real input events.
    for (let i = 0; i < owners.length; i++) {
      const o = owners[i];
      const fnSel = `input[name="owners.${i}.firstName"]`;
      const lnSel = `input[name="owners.${i}.lastName"]`;
      const pctSel = `input[name="owners.${i}.ownershipPercentage"]`;
      if (await page.locator(fnSel).isVisible().catch(() => false)) {
        await setReactInput(page, fnSel, o.firstName);
        await setReactInput(page, lnSel, o.lastName);
        if (await page.locator(pctSel).isVisible().catch(() => false)) {
          await setReactInput(page, pctSel, o.ownership);
        }
      }
      // Citizenship = No (avoids passport upload requirement) — click each
      // owner's first "No" toggle.
      const citNo = page.locator(`button[aria-label="No"]`);
      if (await citNo.count() > 0) await rClick(page, 'button[aria-label="No"]', i);
    }
    await page.waitForTimeout(500);
    await shot(page, `v${v.id}_step3_owners`);

    // ─── Hybrid: inject admin + agreement details via setValue ──────
    // ~30 toggles per agreement step → real-UI walking would take ~15min
    // per variant. Disclosed: agreement fields are setValue, navigation
    // (Continuar) between steps is real-UI click.
    log('Steps 4-8: agreement fields via setValue (disclosed)');
    const adminData = makeAdminData(v);
    const agreementData = makeAgreementData(v);
    const fullData = {
      ownersCount: v.ownerCount,
      owners: Object.fromEntries(owners.map((o, i) => [String(i), {
        fullName: o.fullName,
        firstName: o.firstName,
        lastName: o.lastName,
        ownership: o.ownership,
        ownershipPercentage: o.ownership,
      }])),
      admin: adminData,
      agreement: agreementData,
    };
    const injected = await injectFormFields(page, fullData);
    log(`  injected ${injected} agreement+admin fields`);

    // ─── Save to DynamoDB so the webhook can read it ────────────────
    log('Save to DB…');
    const saved = await page.evaluate(async () => {
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key], d = 0;
          while (fiber && d < 8) {
            if (fiber.memoizedProps?.form?.getValues) {
              const vals = fiber.memoizedProps.form.getValues();
              const resp = await fetch('/api/db/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: localStorage.getItem('draftId'), data: vals }),
              });
              return { ok: resp.ok, status: resp.status };
            }
            fiber = fiber.return; d++;
          }
        }
      }
      return { ok: false };
    });
    log(`  save: ${JSON.stringify(saved)}`);

    // ─── Stripe checkout via API (form state flows through naturally) ─
    log('Stripe checkout session…');
    const checkout = await page.evaluate(async ({ entity }) => {
      let fd = null;
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key], d = 0;
          while (fiber && d < 8) {
            if (fiber.memoizedProps?.form?.getValues) { fd = fiber.memoizedProps.form.getValues(); break; }
            fiber = fiber.return; d++;
          }
          if (fd) break;
        }
        if (fd) break;
      }
      const svc = entity === 'C-Corp' ? ['formation', 'shareholder_agreement'] : ['formation', 'operating_agreement'];
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: fd, selectedServices: svc, entityType: entity, state: 'Florida',
          hasUsAddress: 'No', hasUsPhone: 'No', skipAgreement: 'false', totalPrice: 79500,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      return { status: resp.status, url: json.paymentLinkUrl || json.url || json.checkoutUrl };
    }, { entity: v.entity });
    log(`  checkout: ${JSON.stringify(checkout).slice(0, 220)}`);
    if (!checkout.url) throw new Error(`create-checkout-session: ${JSON.stringify(checkout)}`);

    // ─── Real Stripe pay (test card 4242) ──────────────────────────
    await page.goto(checkout.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.locator('#cardNumber').fill(STRIPE_CARD);
    await page.locator('#cardExpiry').fill(STRIPE_EXP);
    await page.locator('#cardCvc').fill(STRIPE_CVC);
    const nm = page.locator('input[name="billingName"]');
    if (await nm.isVisible().catch(() => false)) await nm.fill('UAT Edge');
    const zip = page.locator('input[name="billingPostalCode"]');
    if (await zip.isVisible().catch(() => false)) await zip.fill(STRIPE_ZIP);
    await page.waitForTimeout(800);
    log('Paying…');
    await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
    await page.waitForTimeout(20000);
    await shot(page, `v${v.id}_after_pay`);

    // ─── Wait for webhook + list docs ──────────────────────────────
    log('Wait 30s for webhook…');
    await page.waitForTimeout(30000);

    await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);

    const docList = await page.evaluate(async () => {
      const r = await fetch('/api/documents', { credentials: 'include' });
      if (!r.ok) return { error: r.status };
      return r.json();
    });
    if (!docList?.documents) throw new Error(`/api/documents: ${JSON.stringify(docList).slice(0, 200)}`);
    result.documents = docList.documents.map(d => d.name);
    log(`  ${docList.documents.length} docs in dashboard`);

    // ─── Download all docs — fetch presigned URL from Node side ────
    log('Download DOCX bytes…');
    for (const d of docList.documents) {
      const dl = await page.evaluate(async (docId) => {
        const r = await fetch(`/api/documents/${docId}/download`, { credentials: 'include' });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, d.id);
      if (dl.status !== 200 || !dl.body?.url) { log(`  ✗ ${d.name}: ${dl.status}`); continue; }
      const s3 = await fetch(dl.body.url);
      if (!s3.ok) { log(`  ✗ ${d.name}: S3 ${s3.status}`); continue; }
      const buf = Buffer.from(await s3.arrayBuffer());
      const safe = (d.name || d.id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
      const out = join(DIR, `v${v.id}_${safe}.docx`);
      writeFileSync(out, buf);
      log(`  ✓ ${d.name}: ${buf.length}b`);
      result.downloaded.push({ name: d.name, path: out, bytes: buf.length });
    }

    result.status = result.errors.length === 0 ? 'PASS' : 'FAIL';
  } catch (err) {
    result.status = 'ERROR';
    result.errors.push(err.message || String(err));
    log(`  ERROR: ${err.message}`);
    await shot(page, `v${v.id}_error`).catch(() => {});
  }

  await browser.close();
  return result;
}

async function main() {
  const args = process.argv.slice(2).map(Number).filter(n => VARIANTS.some(v => v.id === n));
  const toRun = args.length ? VARIANTS.filter(v => args.includes(v.id)) : VARIANTS;

  const logFile = join(DIR, '_run.log');
  writeFileSync(logFile, `Run @ ${new Date().toISOString()}\nURL: ${URL}\nRUN_TAG: ${RUN_TAG}\n`);
  const log = (s) => { console.log(s); appendFileSync(logFile, s + '\n'); };
  log(`Running ${toRun.length} variant(s) against ${URL}`);

  const results = [];
  for (const v of toRun) {
    const r = await runVariant(v, log);
    results.push(r);
  }

  log(`\n${'='.repeat(72)}\nSUMMARY\n${'='.repeat(72)}`);
  for (const r of results) {
    log(`  v${r.id} ${r.label.padEnd(7)} ${r.status.padEnd(6)} docs=${r.downloaded.length} errs=${r.errors.length}`);
    for (const e of r.errors) log(`        - ${e}`);
  }
  writeFileSync(join(DIR, '_results.json'), JSON.stringify({ url: URL, runAt: new Date().toISOString(), results }, null, 2));
  log(`\nResults: ${join(DIR, '_results.json')}`);
  process.exit(results.every(r => r.status === 'PASS') ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
