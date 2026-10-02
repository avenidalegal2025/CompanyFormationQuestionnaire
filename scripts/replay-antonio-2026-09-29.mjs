/**
 * Replays, click by click, the flow Antonio ran on the 2026-09-29 call
 * (recording 16:40 -> 24:00), against PRODUCTION instead of the preview
 * deployment he used (the preview has no STRIPE_SECRET_KEY, which is what
 * produced "Failed to create checkout session").
 *
 * Real clicks and typing in a visible browser — no React-internals shortcuts —
 * so it behaves like a person. A screenshot is saved after every step.
 *
 * Two hand-offs to the human, on purpose:
 *   1. Auth0 sign-up: the script fills nothing there. Sign up yourself in the
 *      window (use an @avenidalegal.com address for the $1 demo price; any
 *      other address is charged the full $1,980). The script waits.
 *   2. Stripe: the script clicks "Proceder al Pago" and stops on Stripe's
 *      page. Paying is yours. The window stays open until you close it.
 *
 * Usage:  node scripts/replay-antonio-2026-09-29.mjs
 *         BASE_URL=https://... node scripts/replay-antonio-2026-09-29.mjs
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.BASE_URL || 'https://company-formation-questionnaire.vercel.app';
const DIR = join(process.env.USERPROFILE || '.', 'Downloads', `avenida-replay-${Date.now()}`);
mkdirSync(DIR, { recursive: true });

// Values as typed in the recording. SSNs were masked on screen (only the last
// four digits show), so the first five digits here are placeholders.
const COMPANY = 'PIRAGUA';
const FORWARD_PHONE = '7865120434';
const PURPOSE = 'Frozen treats distribution';
const OWNERS = [
  { pct: '33', first: 'Haagen', last: 'Daaz',  addr: '4394 SW 74th Ave', city: 'Miami',       citizen: true,  ssn: '123453433' },
  { pct: '44', first: 'Ben',    last: 'Jerry', addr: '4223 W 10th Ln',   city: 'Hialeah',     citizen: false },
  { pct: '23', first: 'Freeze', last: 'Pops',  addr: '933 Normandy Dr',  city: 'Miami Beach', citizen: true,  ssn: '123459999' },
];
const CAPITAL = ['330', '440', '230'];

let n = 0;
async function shot(page, label) {
  const f = `${String(++n).padStart(2, '0')}_${label}.png`;
  await page.screenshot({ path: join(DIR, f), fullPage: true });
  console.log(`  [shot] ${f}`);
}

async function toggle(page, group, option, nth = 0) {
  const btn = page
    .locator(`[role="radiogroup"][aria-label="${group}"]`).filter({ visible: true }).nth(nth)
    .locator(`[role="radio"][aria-label="${option}"]`);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  console.log(`  ${group} -> ${option}`);
}

async function typeInto(locator, text) {
  // Forms keep hidden mirror inputs (e.g. company.companyName); act only on what a person can see.
  locator = locator.filter({ visible: true }).first();
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  // Select-all and type over it, like a person. Do NOT fill('') first: some
  // fields (e.g. non-compete scope, Step8Agreement3.tsx) re-insert their default
  // the instant they are empty, and the typed text would be appended to it.
  await locator.press('Control+a');
  await locator.pressSequentially(text, { delay: 40 });
  const got = await locator.inputValue().catch(() => text);
  if (got.replace(/,/g, '') !== text.replace(/,/g, '')) console.log(`  [warn] typed "${text}" but field shows "${got}"`);
}

/** Google Places: type the street, wait for suggestions, take the one in the right city. */
async function address(page, nth, street, city) {
  const input = page.getByPlaceholder('Escriba y seleccione la dirección').nth(nth);
  await typeInto(input, street);
  const item = page.locator('.pac-container:visible .pac-item', { hasText: city }).first();
  await item.waitFor({ timeout: 10000 });
  await item.click();
  await page.waitForTimeout(800);
  console.log(`  address ${nth + 1}: ${street}, ${city} -> ${await input.inputValue()}`);
}

async function clickButton(page, name) {
  const btn = page.getByRole('button', { name, exact: true }).last();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  console.log(`  [click] ${name}`);
  await page.waitForTimeout(2500);
  const hints = await page.getByText('Selecciona una opción').filter({ visible: true }).count();
  if (hints) console.log(`  [warn] ${hints} required question(s) still unanswered after "${name}"`);
}

/** Hand Auth0 to the human; resume when the browser is back on the app. */
async function waitForHumanSignup(page) {
  // The redirect to Auth0 can land several seconds after the click.
  await page.waitForURL(/auth0/, { timeout: 10000 }).catch(() => {});
  if (!page.url().includes('auth0')) return;
  await shot(page, 'auth0');
  console.log('\n  >>> Sign up in the browser window (an @avenidalegal.com email gets the $1 price).');
  console.log('  >>> The script continues by itself once you are back on the form.\n');
  await page.waitForURL(u => u.toString().startsWith(BASE_URL), { timeout: 10 * 60 * 1000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  console.log('  back on the app: ' + page.url());
}

async function main() {
  console.log(`Replay -> ${BASE_URL}\nScreenshots -> ${DIR}\n`);
  // Playwright's bundled Chromium (`npx playwright install chromium`). The
  // installed Google Chrome exits immediately when launched this way.
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  // The whole run is recorded to <DIR>/video/*.webm (written when the context closes).
  currentContext = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: join(DIR, 'video'), size: { width: 1400, height: 900 } },
  });
  const page = await currentContext.newPage();
  page.setDefaultTimeout(30000);
  currentPage = page;

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });

  console.log('== 01 Empresa');
  await page.locator('select[name="company.formationState"]').selectOption('Florida').catch(() => {});
  await toggle(page, 'Tipo de entidad', 'LLC');
  await typeInto(page.getByPlaceholder('Nombre de la empresa', { exact: true }), COMPANY);
  await toggle(page, 'Cuenta con dirección en USA', 'No');
  await toggle(page, 'Cuenta con número de teléfono USA', 'No');
  await typeInto(page.locator('input[name="forwardPhone"]'), FORWARD_PHONE);
  await typeInto(page.locator('textarea[name="company.businessPurpose"]'), PURPOSE);
  await shot(page, 'step01_empresa');
  await clickButton(page, 'Continuar');
  await waitForHumanSignup(page);

  console.log('== 02 Propietarios');
  await typeInto(page.getByPlaceholder('Ingrese número (1-6)').first(), String(OWNERS.length));
  await page.waitForTimeout(1000);
  for (const [i, o] of OWNERS.entries()) {
    // On the preview Antonio used, "Persona" came preselected. Production starts
    // with neither option chosen, and "Continuar" silently does nothing until it is.
    await toggle(page, 'Tipo de propietario', 'Persona', i);
    await typeInto(page.locator(`input[name="owners.${i}.ownership"]`), o.pct);
    await typeInto(page.locator(`input[name="owners.${i}.firstName"]`), o.first);
    await typeInto(page.locator(`input[name="owners.${i}.lastName"]`), o.last);
    await address(page, i, o.addr, o.city);
    await toggle(page, 'Residencia en EE.UU.', o.citizen ? 'Sí' : 'No', i);
    if (o.citizen) {
      // SSN inputs only exist for citizens; the one just revealed is the last.
      // The SSN box is permanently readOnly and builds its value from keydown
      // events (SSNEINInput.tsx), so press keys rather than fill().
      const ssn = page.getByPlaceholder('###-##-####').filter({ visible: true }).last();
      await ssn.scrollIntoViewIfNeeded();
      await ssn.click();
      await page.keyboard.type(o.ssn, { delay: 60 });
      console.log(`  ssn ${i + 1}: ${await ssn.inputValue()}`);
    }
    console.log(`  socio ${i + 1}: ${o.first} ${o.last} ${o.pct}%`);
  }
  await shot(page, 'step02_propietarios');
  await clickButton(page, 'Continuar');
  await waitForHumanSignup(page);

  console.log('== 03 Administrativo');
  await toggle(page, 'Socios son gerentes', 'Sí');
  await shot(page, 'step03_administrativo');
  await clickButton(page, 'Enviar');
  await waitForHumanSignup(page);

  console.log('== 04 Resumen');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, 'step04_resumen');
  await clickButton(page, 'Enviar');
  const loQuiero = page.getByRole('button', { name: 'Lo quiero' });
  await loQuiero.waitFor({ timeout: 10000 });
  await shot(page, 'step04_modal_operating_agreement');
  await loQuiero.click();
  console.log('  [click] Lo quiero');
  await page.waitForTimeout(2500);

  console.log('== 05 Dueños & Roles');
  for (const [i, amt] of CAPITAL.entries()) {
    await typeInto(page.locator('table input[type="text"]').nth(i), amt);
  }
  await toggle(page, 'Managing members', 'Sí');
  await toggle(page, 'Has specific roles', 'No');
  await shot(page, 'step05_duenos_roles');
  await clickButton(page, 'Continuar');

  console.log('== 06 Capital & Préstamos');
  await typeInto(page.locator('input[name="agreement.majorityThreshold"]'), '50.01');
  await typeInto(page.locator('input[name="agreement.supermajorityThreshold"]'), '75');
  await toggle(page, 'New members admission', 'Unánime');
  await toggle(page, 'Additional contributions process', 'Sí, Pro-Rata');
  await toggle(page, 'Member loans', 'No');
  // Required on production since cb5f27d5 (no pre-selected answers); not visible in
  // the recording because the preview pre-answered them. Old defaults used.
  await toggle(page, 'Additional contributions decision', 'Unánime');
  await page.locator('select').filter({ visible: true }).filter({ has: page.locator('option[value="Trimestral"]') })
    .first().selectOption('Trimestral');
  console.log('  distribución -> Trimestral');
  await shot(page, 'step06_capital_prestamos');
  await clickButton(page, 'Continuar');

  console.log('== 07 Gobierno & Decisiones');
  await toggle(page, 'LLC sale decision', 'Unánime');
  await page.locator('select[name="agreement.llc_taxPartner"]').selectOption('Haagen Daaz');
  await toggle(page, 'Non compete covenant', 'Sí');
  await typeInto(page.locator('input[name="agreement.llc_nonCompeteDuration"]'), '2');
  await typeInto(page.locator('input[name="agreement.llc_nonCompeteScope"]'), 'Estado de Florida');
  await toggle(page, 'Bank signers', 'Dos firmantes');
  await toggle(page, 'LLC major decisions', 'Unánime');
  await toggle(page, 'LLC minor decisions', 'Mayoría');
  await typeInto(page.getByPlaceholder('Monto', { exact: true }), '8675');
  await toggle(page, 'LLC officer removal voting', 'Mayoría');
  await shot(page, 'step07_gobierno_decisiones');
  await clickButton(page, 'Continuar');

  console.log('== 08 Acciones & Sucesión');
  // Right of first refusal is always included now; only its offer period is asked.
  await typeInto(page.locator('input[name="agreement.llc_rofrOfferPeriod"]'), '40');
  await toggle(page, 'Incapacity heirs policy', 'Sí');
  await page.locator('select[name="agreement.llc_transferToRelatives"]')
    .selectOption('Sí, si la decisión de los socios es unánime.');
  await toggle(page, 'LLC dissolution decision', 'Unánime');
  await toggle(page, 'LLC divorce buyout', 'Sí');
  await toggle(page, 'LLC tag drag rights', 'No');
  await shot(page, 'step08_acciones_sucesion');
  await clickButton(page, 'Continuar');

  console.log('== 09 Checkout');
  await clickButton(page, 'Revisar Paquete y Proceder al Pago');
  await shot(page, 'step09_carrito');
  const total = await page.getByText(/USD\s*[\d,]+\.\d\d/).last().textContent().catch(() => '?');
  console.log(`  cart total shown: ${total}`);
  await clickButton(page, 'Proceder al Pago');

  // The call ended here with "Failed to create checkout session" on the preview.
  const failed = page.getByText('Failed to create checkout session');
  const reached = await Promise.race([
    page.waitForURL(/checkout\.stripe\.com/, { timeout: 45000 }).then(() => 'stripe'),
    failed.waitFor({ timeout: 45000 }).then(() => 'failed'),
  ]).catch(() => 'timeout');
  await shot(page, `step09_after_pay_click_${reached}`);

  if (reached === 'stripe') {
    // Stripe charges exactly its line items: one "demo ($1)" line = $1; the four
    // services = full price (shown in local currency when adaptive pricing kicks in).
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText().catch(() => '');
    console.log(/demo \(\$1\)/i.test(text)
      ? '  PRICE CHECK: $1 demo line -> paying charges US$1.00'
      : '  PRICE CHECK: FULL PRICE (no "demo ($1)" line) -> paying charges ~US$1,980. Do not pay unless intended.');
    console.log('\n  REACHED STRIPE CHECKOUT. Payment is yours to enter. Close the window when done.');
  } else {
    console.log(`\n  Did NOT reach Stripe (${reached}). URL: ${page.url()}`);
  }
  await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
  await currentContext.close().catch(() => {});
  console.log('  video: ' + join(DIR, 'video'));
  await browser.close();
}

let currentPage, currentContext;
main().catch(async e => {
  console.error('FATAL:', e.message);
  if (currentPage) await currentPage.screenshot({ path: join(DIR, 'FAILED.png'), fullPage: true }).catch(() => {});
  console.error('  failure screenshot: ' + join(DIR, 'FAILED.png') + '  url: ' + currentPage?.url());
  await currentContext?.close().catch(() => {}); // flushes the video file
  console.error('  video: ' + join(DIR, 'video'));
  process.exit(1);
});
