// UAT E2E against the DEPLOYED prod URL. Creates a real Auth0 account with
// test+839475938475@gmail.com and walks past the auth gate.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://company-formation-questionnaire.vercel.app';
const OUT = join(process.env.USERPROFILE, 'Downloads', 'pw-uat-e2e');
mkdirSync(OUT, { recursive: true });
const PROFILE = join(OUT, '.chromium-profile');
mkdirSync(PROFILE, { recursive: true });

const EMAIL = 'test+839475938475@gmail.com';
const PASSWORD = 'Test!Password2026XY9';

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const f = join(OUT, `${String(shotN).padStart(2, '0')}_${label}.png`);
  try { await page.screenshot({ path: f, fullPage: true }); console.log(`  📸 ${label}`); } catch {}
}
async function waitIdle(page, ms = 800) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1400, height: 2400 },
  acceptDownloads: true,
});
const page = browser.pages()[0] || await browser.newPage();
page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message.slice(0, 160)}`));

console.log(`\n═══ UAT E2E → ${BASE} ═══`);
console.log(`  Email:    ${EMAIL}`);
console.log(`  Password: ${PASSWORD}\n`);

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Empresa
// ─────────────────────────────────────────────────────────────────────
console.log(`── Step 1: Empresa ──`);
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await waitIdle(page, 1500);
await shot(page, 'step1_loaded');

// 1a formation state
await page.locator('select[name="company.formationState"]').selectOption('Florida');

// 1b entity type C-Corp
await page.locator('button[role="radio"][aria-label="C-Corp"]').click();
await page.waitForTimeout(400);

// 1c company name base (uppercase input)
await page.locator('input[placeholder="Nombre de la empresa"]').first().fill('UATE2E');

// 1d entity suffix: Controller-rendered <select> — find the one whose
// options contain "Corp"
{
  const selects = page.locator('select');
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    const opts = await s.locator('option').allInnerTexts();
    if (opts.some((o) => o.trim() === 'Corp')) { await s.selectOption('Corp'); break; }
  }
}
await page.waitForTimeout(400);

// 1e hasUsaAddress = Sí (first of two Sí toggles on the step)
await page.locator('button[role="radio"][aria-label="Sí"]').nth(0).click();
await page.waitForTimeout(800);

// 1f address fields — located by their label text
await page.getByLabel('Dirección línea 1').fill('200 S Biscayne Blvd');
await page.getByLabel('Dirección línea 2').fill('Suite 400');
await page.getByLabel('Ciudad').fill('Miami');
await page.getByLabel('Estado/Provincia').fill('FL');
await page.getByLabel('Código postal').fill('33131');

// 1g hasUsPhone stays at default No → fill forwardPhone
await page.locator('input[name="forwardPhone"]').fill('3055551234').catch(() => {});

// 1h numberOfShares (Corp) — placeholder "10,000"
await page.locator('input[placeholder="10,000"]').fill('10000').catch(() => {});

// 1i business purpose
await page.locator('textarea[name="company.businessPurpose"]').fill('Desarrollo de software y consultoría tecnológica');

await shot(page, 'step1_filled');

// Continuar → Auth0
console.log(`→ Continuar`);
await page.locator('button:has-text("Continuar")').last().click();

// Wait for Auth0 redirect
await page.waitForURL(/auth0\.com/, { timeout: 45000 }).catch(() => {});
await waitIdle(page, 2500);
await shot(page, 'auth0_landing');
console.log(`\n── Auth0: ${page.url()} ──`);

// If we landed on login rather than signup, look for a link to signup
for (const sel of [
  'a:has-text("Sign up")', 'a:has-text("Registrarse")',
  'a:has-text("Create account")', 'a:has-text("Crear cuenta")',
]) {
  const a = page.locator(sel).first();
  if (await a.isVisible().catch(() => false)) {
    await a.click();
    console.log(`  🖱 signup link: ${sel}`);
    await page.waitForTimeout(1500);
    break;
  }
}

// Fill Auth0 signup form
const emailField = page.locator('input[type="email"], input[name="email"], input[inputmode="email"]').first();
const pwField    = page.locator('input[type="password"], input[name="password"]').first();
if (await emailField.isVisible().catch(() => false)) {
  await emailField.fill(EMAIL);
  console.log(`  ✏  email`);
}
if (await pwField.isVisible().catch(() => false)) {
  await pwField.fill(PASSWORD);
  console.log(`  ✏  password`);
}
await shot(page, 'auth0_form_filled');

// Submit
await page.locator([
  'button[type="submit"]',
  'button[data-action-button-primary]',
  'button:has-text("Continue")',
  'button:has-text("Sign Up")',
  'button:has-text("Continuar")',
  'button:has-text("Registrarse")',
].join(', ')).first().click();
console.log(`  🖱 submitted`);

// Let Auth0 process signup. It can show: consent, captcha, verification,
// or directly redirect back. Sleep-screenshot loop for 30s to capture
// what appears.
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const u = page.url();
  if (!u.includes('auth0.com') && !u.includes('/authorize') && !u.includes('/u/')) break;
}
await waitIdle(page, 2500);
await shot(page, 'after_auth0_submit');

// Handle any post-signup consent screens
for (const sel of ['button:has-text("Accept")', 'button:has-text("Allow")', 'button:has-text("Aceptar")', 'button:has-text("Permitir")']) {
  const b = page.locator(sel).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click();
    console.log(`  🖱 consent → ${sel}`);
    await page.waitForTimeout(2500);
  }
}

// Give the callback a chance to complete and restore the draft
for (let i = 0; i < 15 && !page.url().startsWith(BASE); i++) await page.waitForTimeout(2000);
await waitIdle(page, 3000);
await shot(page, 'back_on_site');

const finalUrl = page.url();
const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 800);
console.log(`\n── Final state ──`);
console.log(`  URL: ${finalUrl}`);
console.log(`  body: ${body.replace(/\s+/g, ' ').slice(0, 280)}`);

// Check session by hitting /api/auth/session
const sessionStatus = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/auth/session');
    return { status: r.status, text: (await r.text()).slice(0, 300) };
  } catch (e) { return { error: String(e) }; }
});
console.log(`  /api/auth/session → ${JSON.stringify(sessionStatus).slice(0, 300)}`);

const onProd = finalUrl.startsWith(BASE);
const verifyGate = /verify your email|confirma tu correo|email verification|check your inbox|verifica tu correo/i.test(body);
const authedStep = sessionStatus.text && /"user"/.test(sessionStatus.text);
const pastStep1 = /propietarios|owners|dueños|administrativo|resumen/i.test(body);

console.log(`\n── UAT verdict ──`);
console.log(`  Back on prod URL:            ${onProd ? '✓' : '✗'}`);
console.log(`  Auth0 session present:       ${authedStep ? '✓' : '✗'}`);
console.log(`  Email verification required: ${verifyGate ? 'YES' : 'no'}`);
console.log(`  Past Step 1:                 ${pastStep1 ? '✓' : '?'}`);

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({
  email: EMAIL, finalUrl, onProd, authedStep, verifyGate, pastStep1,
  bodyPreview: body.slice(0, 500),
  sessionProbe: sessionStatus,
}, null, 2));

await browser.close();
console.log(`\n✓ Done. Artifacts in ${OUT}`);
process.exit(onProd && authedStep ? 0 : 2);
