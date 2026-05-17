/**
 * 5-variant production-flow smoke test against the fix/article-xiii-hierarchical
 * preview deployment. For each variant:
 *   1. Auth0 signup with a Gmail alias
 *   2. Inject formData via React fiber form.setValue
 *   3. Save to DynamoDB via /api/db/save
 *   4. Stripe test-mode checkout (card 4242) via /api/create-checkout-session
 *   5. Verify documents appear in /client/documents
 *
 * Variants picked to spread the matrix (per user direction):
 *   v1: LLC, 2 owners, unanimous,    no covenants
 *   v2: LLC, 4 owners, majority,     RoFR only
 *   v3: Corp, 3 owners, mixed,       all covenants
 *   v4: Corp, 5 owners, majority,    NS + Conf
 *   v5: Corp, 6 owners, unanimous,   all covenants
 *
 * USAGE
 *   node scripts/e2e-5-variants-postfix.mjs           # run all 5 sequentially
 *   node scripts/e2e-5-variants-postfix.mjs 1         # run only variant 1
 *   node scripts/e2e-5-variants-postfix.mjs 1 3 5     # run only the listed variants
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';

const URL = process.env.E2E_URL || 'https://company-formation-questio-git-ef61b9-avenidalegal2025s-projects.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', 'e2e-5-variants-postfix');
mkdirSync(DIR, { recursive: true });

const STRIPE_CARD = '4242424242424242';
const STRIPE_EXP = '12/29';
const STRIPE_CVC = '123';
const STRIPE_ZIP = '33131';
const PASSWORD = 'PostfixSmoke2026!';

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
    mixed:     { sale: 'Supermayoría',     major: 'Mayoría',          newMember: 'Decisión Unánime', dissolution: 'Mayoría',          removal: 'Supermayoría',     loans: 'Mayoría',          capital: 'Supermayoría' },
  };
  return map[v];
}

function ownerArray(n) {
  const pct = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => ({
    fullName: NAMES[i],
    ownership: i === n - 1 ? 100 - pct * (n - 1) : pct,
  }));
}

const VARIANTS = [
  { id: 1, entity: 'LLC',    ownerCount: 2, voting: 'unanimous', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX01' },
  { id: 2, entity: 'LLC',    ownerCount: 4, voting: 'majority',  rofr: true,  drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX02' },
  { id: 3, entity: 'C-Corp', ownerCount: 3, voting: 'mixed',     rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX03' },
  { id: 4, entity: 'C-Corp', ownerCount: 5, voting: 'majority',  rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'Yes', label: 'PFX04' },
  { id: 5, entity: 'C-Corp', ownerCount: 6, voting: 'unanimous', rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX05' },
];

const RUN_TAG = (process.env.E2E_RUN_TAG || 'd').trim();
function emailFor(v) {
  return `trimaran.llc+pfx${v.id}${RUN_TAG}@gmail.com`;
}

function companyNameFor(v) {
  const suffix = v.entity === 'C-Corp' ? 'Corp' : 'LLC';
  return `${v.label} ${suffix}`;
}

function makeFormData(v) {
  const isCorp = v.entity === 'C-Corp';
  const suffix = isCorp ? 'Corp' : 'LLC';
  const profile = votingProfile(v.voting);
  const owners = ownerArray(v.ownerCount);

  const agreement = {
    wants: 'Yes',
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,
    distributionFrequency: 'Trimestral',
  };

  const MORE_CAPITAL = 'Sí, Pro-Rata';
  const TRANSFER_FREE = 'Sí, podrán transferir libremente sus acciones.';

  if (isCorp) {
    Object.assign(agreement, {
      corp_saleDecisionThreshold: profile.sale,
      corp_bankSigners: 'Dos firmantes',
      corp_majorDecisionThreshold: profile.major,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: profile.removal,
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
      corp_newShareholdersAdmission: profile.newMember,
      corp_moreCapitalProcess: MORE_CAPITAL,
      corp_shareholderLoans: 'Yes',
      corp_shareholderLoansVoting: profile.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) agreement[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(agreement, {
      llc_companySaleDecision: profile.sale,
      llc_bankSigners: 'Dos firmantes',
      llc_majorDecisions: profile.major,
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: profile.removal,
      llc_nonCompete: v.nc,
      llc_nonSolicitation: v.ns,
      llc_confidentiality: v.conf,
      llc_nonDisparagement: 'Yes',
      llc_taxPartner: NAMES[0],
      llc_minTaxDistribution: 30,
      llc_rofr: v.rofr ? 'Yes' : 'No',
      llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: 'Yes',
      llc_dissolutionDecision: profile.dissolution,
      llc_newMembersAdmission: profile.newMember,
      llc_newPartnersAdmission: profile.newMember,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: MORE_CAPITAL,
      llc_memberLoans: 'Yes',
      llc_memberLoansVoting: profile.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) agreement[`llc_capitalContributions_${i}`] = '50000';
  }

  return {
    company: {
      entityType: v.entity,
      companyNameBase: v.label,
      entitySuffix: suffix,
      formationState: 'Florida',
      companyName: companyNameFor(v),
      hasUsaAddress: 'No',
      hasUsPhone: 'No',
      numberOfShares: 1000,
    },
    ownersCount: v.ownerCount,
    owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
    admin: isCorp
      ? {
          directorsAllOwners: 'Yes',
          officersAllOwners: 'Yes',
          ...Object.fromEntries(
            OFFICER_ROLES.slice(0, v.ownerCount).map((role, i) => [`shareholderOfficer${i + 1}Role`, role])
          ),
        }
      : { managersAllOwners: 'Yes' },
    agreement,
  };
}

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = String(shotN).padStart(3, '0') + '_' + label + '.png';
  await page.screenshot({ path: join(DIR, f), fullPage: true });
}

async function runVariant(v, log) {
  shotN = 0;
  const email = emailFor(v);
  const companyName = companyNameFor(v);
  log(`\n${'='.repeat(70)}\nVariant ${v.id}: ${v.label} = ${v.entity} ${v.ownerCount}o ${v.voting}\nEmail: ${email}\n${'='.repeat(70)}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const result = { id: v.id, label: v.label, email, status: 'PENDING', errors: [], documents: [] };

  try {
    // ─── Step 1: Company + Auth0 ────────────────────────────────────
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
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
    await shot(page, `v${v.id}_step1`);

    // Click Continuar → triggers Auth0 redirect
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('button:has-text("Continuar")').first().click();
    await page.waitForTimeout(3000);

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

    // ─── Re-fill step 1 post-auth (form resets) + inject all data ───
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

    log('Injecting full form data via React fiber setValue …');
    const fd = makeFormData(v);
    const injected = await page.evaluate((fd) => {
      function flatten(obj, prefix = '', out = {}) {
        for (const [k, val] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (val && typeof val === 'object' && !Array.isArray(val)) flatten(val, path, out);
          else out[path] = val;
        }
        return out;
      }
      const flat = flatten(fd);
      for (const el of document.querySelectorAll('*')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber')) continue;
          let fiber = el[key], d = 0;
          while (fiber && d < 8) {
            if (fiber.memoizedProps?.form?.setValue) {
              const sv = fiber.memoizedProps.form.setValue;
              for (const [path, val] of Object.entries(flat)) {
                sv(path, val);
              }
              return Object.keys(flat).length;
            }
            fiber = fiber.return; d++;
          }
        }
      }
      return 0;
    }, fd);
    log(`  injected ${injected} fields`);
    if (injected === 0) throw new Error('failed to find form.setValue in React fiber');

    // ─── Save to DynamoDB ───────────────────────────────────────────
    log('Saving to DB …');
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
              const json = await resp.json().catch(() => ({}));
              return { ok: json.ok ?? resp.ok, status: resp.status, wants: vals.agreement?.wants };
            }
            fiber = fiber.return; d++;
          }
        }
      }
      return { ok: false };
    });
    log(`  save: ${JSON.stringify(saved)}`);

    // ─── Create checkout session via API ────────────────────────────
    log('Creating Stripe checkout session …');
    const checkout = await page.evaluate(async ({ entity, label }) => {
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
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: fd,
          selectedServices: ['formation', entity === 'C-Corp' ? 'shareholder_agreement' : 'operating_agreement'],
          entityType: entity,
          state: 'Florida',
          hasUsAddress: 'No',
          hasUsPhone: 'No',
          skipAgreement: 'false',
          totalPrice: 79500,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      return { status: resp.status, url: json.paymentLinkUrl || json.url || json.checkoutUrl, error: json.error, sessionId: json.sessionId };
    }, { entity: v.entity, label: v.label });
    log(`  checkout: ${JSON.stringify(checkout).slice(0, 250)}`);

    if (!checkout.url) throw new Error(`create-checkout-session failed: ${JSON.stringify(checkout)}`);

    // ─── Stripe checkout ────────────────────────────────────────────
    await page.goto(checkout.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await shot(page, `v${v.id}_stripe`);

    await page.locator('#cardNumber').fill(STRIPE_CARD);
    await page.locator('#cardExpiry').fill(STRIPE_EXP);
    await page.locator('#cardCvc').fill(STRIPE_CVC);
    const nameInput = page.locator('input[name="billingName"]');
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('Test Postfix');
    const zip = page.locator('input[name="billingPostalCode"]');
    if (await zip.isVisible().catch(() => false)) await zip.fill(STRIPE_ZIP);
    await page.waitForTimeout(800);

    log('Paying (test mode 4242) …');
    await page.locator('button:has-text("Pay"), button[type="submit"]').first().click();
    await page.waitForTimeout(20000);
    await shot(page, `v${v.id}_after_pay`);
    log(`  after-pay URL: ${page.url().slice(0, 120)}`);

    // ─── Wait for webhook + verify documents ────────────────────────
    log('Waiting 30s for webhook → doc generation …');
    await page.waitForTimeout(30000);

    await page.goto(URL + '/client/documents', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, `v${v.id}_documents`);

    const docText = await page.evaluate(() => document.body.innerText);
    const docNames = docText.match(/(Shareholder[^\n]{0,80}|Operating[^\n]{0,80}|Bylaws[^\n]{0,80}|Organizational[^\n]{0,80}|Form \d+[^\n]{0,80}|SS4[^\n]{0,80}|Registry[^\n]{0,80})/g) || [];
    const dedup = Array.from(new Set(docNames.map(s => s.trim())));
    result.documents = dedup;
    log(`  documents: ${dedup.length}`);
    for (const d of dedup) log(`    - ${d}`);

    const expectedDoc = v.entity === 'C-Corp' ? 'Shareholder' : 'Operating';
    if (!dedup.some(d => d.includes(expectedDoc))) {
      result.errors.push(`expected ${expectedDoc} Agreement not found in dashboard`);
    }

    // ─── Download ALL generated DOCX bytes for offline visual QA ────
    // Dashboard listing the document is NOT verification — must inspect
    // the actual bytes page by page.
    log('Downloading DOCX bytes …');
    const docList = await page.evaluate(async () => {
      const r = await fetch('/api/documents', { credentials: 'include' });
      if (!r.ok) return { error: r.status };
      return r.json();
    });
    if (!docList?.documents) {
      result.errors.push(`/api/documents returned ${JSON.stringify(docList).slice(0, 200)}`);
    } else {
      result.downloaded = [];
      for (const d of docList.documents) {
        try {
          const dl = await page.evaluate(async (docId) => {
            const r = await fetch(`/api/documents/${docId}/download`, { credentials: 'include' });
            return { status: r.status, body: await r.json().catch(() => ({})) };
          }, d.id);
          if (dl.status !== 200 || !dl.body?.url) {
            log(`  ✗ ${d.name}: download API ${dl.status}`);
            continue;
          }
          // Fetch the S3 presigned URL from Node side (browser CORS blocks
          // cross-origin S3 fetches from our domain).
          const s3Resp = await fetch(dl.body.url);
          if (!s3Resp.ok) {
            log(`  ✗ ${d.name}: S3 fetch ${s3Resp.status}`);
            continue;
          }
          const buf = Buffer.from(await s3Resp.arrayBuffer());
          const safe = (d.name || d.id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
          const out = join(DIR, `v${v.id}_${safe}.docx`);
          writeFileSync(out, buf);
          log(`  ✓ ${d.name}: ${buf.length}b → ${out}`);
          result.downloaded.push({ name: d.name, path: out, bytes: buf.length });
        } catch (e) {
          log(`  ✗ ${d.name}: ${e.message}`);
        }
      }
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
  const args = process.argv.slice(2).map(Number).filter(n => n >= 1 && n <= 5);
  const toRun = args.length ? VARIANTS.filter(v => args.includes(v.id)) : VARIANTS;

  const logFile = join(DIR, '_run.log');
  writeFileSync(logFile, `Run @ ${new Date().toISOString()}\nURL: ${URL}\n`);
  const log = (s) => { console.log(s); appendFileSync(logFile, s + '\n'); };

  log(`Running ${toRun.length} variant(s) against ${URL}`);

  const results = [];
  for (const v of toRun) {
    const r = await runVariant(v, log);
    results.push(r);
  }

  log(`\n${'='.repeat(70)}\nSUMMARY\n${'='.repeat(70)}`);
  for (const r of results) {
    log(`  v${r.id} ${r.label.padEnd(7)} ${r.status.padEnd(6)} docs=${r.documents.length} errs=${r.errors.length}`);
    for (const e of r.errors) log(`        - ${e}`);
  }

  writeFileSync(join(DIR, '_results.json'), JSON.stringify({ url: URL, runAt: new Date().toISOString(), results }, null, 2));
  log(`\nResults: ${join(DIR, '_results.json')}`);

  process.exit(results.every(r => r.status === 'PASS') ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
