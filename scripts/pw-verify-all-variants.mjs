// Real-pipeline end-to-end verification across 4 variants:
//   1) Corp Full     — 2 owners, supermajority sale, drag+tag, ROFR, bank=2, responsibilities
//   2) Corp Minimal  — 1 owner, unanimous everywhere, no ROFR / drag / tag
//   3) LLC Full      — 2 members, manager-managed, supermajority, ROFR
//   4) LLC Minimal   — 1 member, member-managed, unanimous, no ROFR
//
// Each variant:
//   - POSTs realistic formData to http://localhost:3005/api/agreement/generate
//   - saves DOCX
//   - converts to PDF via LibreOffice
//   - rasterizes pages via pdftoppm
//   - loads every page PNG in Playwright (headless Chromium) to verify render
//   - content-checks the DOCX XML for required phrases
//   - writes a gallery.html + gallery_full.png per variant

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import PizZip from 'pizzip';

const BASE = 'http://localhost:3005';
const ROOT = join(process.env.USERPROFILE, 'Downloads', 'pw-verify-all-variants');
mkdirSync(ROOT, { recursive: true });

const SOFFICE  = 'C:\\Program Files\\LibreOffice\\program\\soffice.com';
const PDFTOPPM = 'C:\\Users\\neotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe';

// ── Variant form-data builders ─────────────────────────────────────────
function corpFull() {
  return {
    label: 'corp_full',
    expectedTextChecks: (t) => [
      ['Entity name',            t.includes('CORP FULL CORP')],
      ['Florida',                t.includes('Florida')],
      ['Miami-Dade',             t.includes('Miami-Dade')],
      ['Both shareholders',      t.includes('Alice Founder') && t.includes('Bob CoFounder')],
      ['1.7 Super Majority',     /1\.7.{0,30}Super Majority/s.test(t)],
      ['1.8 Officers',           /1\.8.{0,30}Officers/s.test(t)],
      ['1.10 Share or Shares',   /1\.10.{0,40}Share/s.test(t)],
      ['1.11 Successor',         /1\.11.{0,30}Successor/s.test(t)],
      ['Sale: Super Majority',   t.includes('Super Majority consent or approval')],
      ['Bank: two Officers',     t.includes('two of the Officers')],
      ['Spending $25,000',       t.includes('25,000')],
      ['ROFR present',           t.includes('Right of First Refusal')],
      ['Drag Along present',     t.includes('Drag Along')],
      ['Tag Along present',      t.includes('Tag Along')],
      ['75% supermajority',      t.includes('SEVENTY-FIVE PERCENT') || t.includes('75.00%')],
      ['Pct Alice 60.00%',       t.includes('60.00%')],
      ['Pct Bob 40.00%',         t.includes('40.00%')],
      ['Responsibilities CEO',   t.includes('Chief Executive Officer')],
      ['No {{}} leftover',       !t.includes('{{')],
    ],
    formData: {
      company: {
        entityType: 'C-Corp', entitySuffix: 'Corp',
        companyNameBase: 'CORP FULL Corp',
        formationState: 'Florida',
        addressLine1: '200 S Biscayne Blvd', addressLine2: 'Suite 400',
        city: 'Miami', state: 'FL', postalCode: '33131', hasUsaAddress: 'Yes',
        numberOfShares: 10000, businessPurpose: 'Technology consulting',
      },
      owners: [
        { firstName: 'Alice', lastName: 'Founder',  ownership: 60, fullName: 'Alice Founder'  },
        { firstName: 'Bob',   lastName: 'CoFounder', ownership: 40, fullName: 'Bob CoFounder' },
      ],
      ownersCount: 2,
      admin: {
        directorsAllOwners: 'Yes', directorsCount: 2,
        officersAllOwners: 'No',   officersCount: 1,
        officer1Name: 'Alice Founder', officer1Role: 'President',
      },
      agreement: {
        corp_capitalPerOwner_0: 60000, corp_capitalPerOwner_1: 40000,
        corp_hasSpecificResponsibilities: 'Yes',
        corp_specificResponsibilities_0: 'Chief Executive Officer',
        corp_responsibilityDesc_0: 'Sets strategy, leads fundraising, manages executive team.',
        corp_specificResponsibilities_1: 'Chief Technology Officer',
        corp_responsibilityDesc_1: 'Owns product architecture and engineering delivery.',
        majorityThreshold: 50.01, supermajorityThreshold: 75,
        corp_moreCapitalDecision: 'Mayoría',
        corp_shareholderLoansVoting: 'Mayoría',
        corp_saleDecisionThreshold: 'Supermayoría',
        corp_majorDecisionThreshold: 'Mayoría',
        corp_newShareholdersAdmission: 'Decisión Unánime',
        corp_officerRemovalVoting: 'Mayoría',
        corp_majorSpendingThreshold: 25000,
        corp_bankSigners: 'Dos firmantes',
        corp_taxOwner: 'Alice Founder',
        corp_transferToRelatives: 'Transferencias a familiares libremente permitidas',
        corp_rofr: 'Yes', corp_rofrOfferPeriod: 60,
        corp_incapacityHeirsPolicy: 'No',
        corp_tagDragRights: 'Yes',
        corp_nonCompete: 'No', corp_nonSolicitation: 'Yes', corp_confidentiality: 'Yes',
        distributionFrequency: 'Trimestral',
      },
    },
  };
}

function corpMinimal() {
  return {
    label: 'corp_min',
    expectedTextChecks: (t) => [
      ['Entity name',            t.includes('SOLO CORP CORP')],
      ['Sole shareholder',       t.includes('Single Owner')],
      ['Delaware',               t.includes('Delaware')],
      ['Sale: Unanimous',        t.includes('Unanimous consent or approval')],
      ['ROFR removed',           !t.includes('Right of First Refusal')],
      ['Drag Along removed',     !t.includes('Drag Along')],
      ['Tag Along removed',      !t.includes('Tag Along')],
      ['Bank: one Officer',      t.includes('one of the Officers')],
      ['No {{}} leftover',       !t.includes('{{')],
    ],
    formData: {
      company: {
        entityType: 'C-Corp', entitySuffix: 'Corp',
        companyNameBase: 'SOLO CORP Corp', formationState: 'Delaware',
        addressLine1: '456 Broad St', city: 'Dover', state: 'DE', postalCode: '19901', hasUsaAddress: 'Yes',
        numberOfShares: 1000,
      },
      owners: [{ firstName: 'Single', lastName: 'Owner', ownership: 100, fullName: 'Single Owner' }],
      ownersCount: 1,
      admin: {
        directorsAllOwners: 'Yes', directorsCount: 1,
        officersAllOwners: 'No',   officersCount: 1,
        officer1Name: 'Single Owner', officer1Role: 'President & CEO',
      },
      agreement: {
        corp_capitalPerOwner_0: 100000,
        majorityThreshold: 50, supermajorityThreshold: 75,
        corp_moreCapitalDecision: 'Decisión Unánime',
        corp_shareholderLoansVoting: 'Decisión Unánime',
        corp_saleDecisionThreshold: 'Decisión Unánime',
        corp_majorDecisionThreshold: 'Decisión Unánime',
        corp_newShareholdersAdmission: 'Decisión Unánime',
        corp_officerRemovalVoting: 'Decisión Unánime',
        corp_majorSpendingThreshold: 10000,
        corp_bankSigners: 'Un firmante',
        corp_taxOwner: 'Single Owner',
        corp_transferToRelatives: 'Transferencias a familiares libremente permitidas',
        corp_rofr: 'No',
        corp_incapacityHeirsPolicy: 'No',
        corp_tagDragRights: 'No',
        corp_nonCompete: 'No', corp_nonSolicitation: 'No', corp_confidentiality: 'No',
        distributionFrequency: 'Trimestral',
      },
    },
  };
}

function llcFull() {
  return {
    label: 'llc_full',
    expectedTextChecks: (t) => [
      ['Entity name',            t.includes('MIAMI LLC')],
      ['Marco/Sofia members',    t.includes('Marco Rodriguez') && t.includes('Sofia Hernandez')],
      ['Florida',                t.includes('Florida')],
      ['Managers (manager-managed)', t.includes('Managers')],
      ['Sale: Unanimous (LLC)',  t.includes('Unanimous consent of the Members')],
      ['Major decisions: Super Majority', t.includes('Super Majority Approval of the Members')],
      ['Dissolution: Unanimous', t.includes('Unanimous election of the Members to dissolve')],
      ['Bank: two signers',      t.includes('any two Members or Managers')],
      ['ROFR present',           t.includes('Right of First Refusal')],
      ['75% supermajority',      t.includes('SEVENTY-FIVE PERCENT (75.00%)')],
      ['No {{}} leftover',       !t.includes('{{')],
    ],
    formData: {
      company: {
        entityType: 'LLC', entitySuffix: 'LLC',
        companyNameBase: 'MIAMI LLC', formationState: 'Florida',
        addressLine1: '200 S Biscayne Blvd', addressLine2: 'Suite 400',
        city: 'Miami', state: 'FL', postalCode: '33131', hasUsaAddress: 'Yes',
        businessPurpose: 'Technology consulting',
      },
      owners: [
        { firstName: 'Marco', lastName: 'Rodriguez', ownership: 60, fullName: 'Marco Rodriguez' },
        { firstName: 'Sofia', lastName: 'Hernandez', ownership: 40, fullName: 'Sofia Hernandez' },
      ],
      ownersCount: 2,
      admin: {
        managersAllOwners: 'Yes', managersCount: 2,
      },
      agreement: {
        llc_capitalContributions_0: 60000,
        llc_capitalContributions_1: 40000,
        llc_managingMembers: 'No', // manager-managed
        llc_taxPartner: 'Marco Rodriguez',
        majorityThreshold: 50, supermajorityThreshold: 75,
        llc_additionalContributionsDecision: 'Supermayoría',
        llc_memberLoansVoting: 'Mayoría',
        llc_companySaleDecision: 'Decisión Unánime',
        llc_majorDecisions: 'Supermayoría',
        llc_newMembersAdmission: 'Decisión Unánime',
        llc_dissolutionDecision: 'Decisión Unánime',
        llc_officerRemovalVoting: 'Mayoría',
        llc_majorSpendingThreshold: 15000,
        llc_bankSigners: 'Dos firmantes',
        llc_transferToRelatives: 'Transferencias a familiares libremente permitidas',
        llc_rofr: 'Yes', llc_rofrOfferPeriod: 180,
        llc_incapacityHeirsPolicy: 'No',
        llc_tagDragRights: 'No',
        llc_nonCompete: 'No', llc_nonSolicitation: 'Yes', llc_confidentiality: 'Yes',
        llc_minTaxDistribution: 30,
        distributionFrequency: 'Trimestral',
      },
    },
  };
}

function llcMinimal() {
  return {
    label: 'llc_min',
    expectedTextChecks: (t) => [
      ['Entity name',            t.includes('SOLO LLC')],
      ['Sole member',            t.includes('Only Member')],
      ['Texas',                  t.includes('Texas')],
      ['Travis county',          t.includes('Travis')],
      ['Member-managed',         t.includes('Members')],
      ['Bank one signer',        t.includes('any Member or Manager')],
      ['ROFR removed',           !t.includes('Right of First Refusal')],
      ['Tag Along removed',      !t.includes('Tag Along')],
      ['Drag Along removed',     !t.includes('Drag Along')],
      ['No {{}} leftover',       !t.includes('{{')],
    ],
    formData: {
      company: {
        entityType: 'LLC', entitySuffix: 'LLC',
        companyNameBase: 'SOLO LLC', formationState: 'Texas',
        addressLine1: '456 Elm St', city: 'Austin', state: 'TX', postalCode: '78701', hasUsaAddress: 'Yes',
      },
      owners: [{ firstName: 'Only', lastName: 'Member', ownership: 100, fullName: 'Only Member' }],
      ownersCount: 1,
      admin: { managersAllOwners: 'Yes', managersCount: 1 },
      agreement: {
        llc_capitalContributions_0: 10000,
        llc_managingMembers: 'Yes', // member-managed
        llc_taxPartner: 'Only Member',
        majorityThreshold: 50,
        llc_additionalContributionsDecision: 'Mayoría',
        llc_memberLoansVoting: 'Mayoría',
        llc_companySaleDecision: 'Mayoría',
        llc_majorDecisions: 'Mayoría',
        llc_newMembersAdmission: 'Mayoría',
        llc_dissolutionDecision: 'Mayoría',
        llc_officerRemovalVoting: 'Mayoría',
        llc_majorSpendingThreshold: 5000,
        llc_bankSigners: 'Un firmante',
        llc_transferToRelatives: 'Transferencias a familiares libremente permitidas',
        llc_rofr: 'No',
        llc_incapacityHeirsPolicy: 'No',
        llc_tagDragRights: 'No',
        llc_nonCompete: 'No', llc_nonSolicitation: 'No', llc_confidentiality: 'No',
        distributionFrequency: 'Anual',
      },
    },
  };
}

// ── Run one variant ────────────────────────────────────────────────────
async function runVariant(browser, v) {
  const out = join(ROOT, v.label);
  mkdirSync(out, { recursive: true });
  const pagesDir = join(out, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  for (const f of readdirSync(pagesDir)) unlinkSync(join(pagesDir, f));

  console.log(`\n═══ Variant: ${v.label} ═══`);
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/agreement/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData: v.formData, draftId: `pw-verify-${v.label}` }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    return { label: v.label, ok: false, reason: `API ${resp.status}: ${err.substring(0, 200)}` };
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const docxPath = join(out, `${v.label}.docx`);
  writeFileSync(docxPath, buf);
  console.log(`  ✓ DOCX (${buf.length} bytes) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // LibreOffice → PDF
  const sof = spawnSync(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', out, docxPath], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (sof.status !== 0) return { label: v.label, ok: false, reason: 'soffice failed' };
  const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
  if (!existsSync(pdfPath)) return { label: v.label, ok: false, reason: 'PDF not found' };
  console.log(`  ✓ PDF (${statSync(pdfPath).size} bytes)`);

  // pdftoppm → per-page PNGs
  const pt = spawnSync(PDFTOPPM, ['-r', '150', '-png', pdfPath, join(pagesDir, 'page')], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (pt.status !== 0) return { label: v.label, ok: false, reason: 'pdftoppm failed' };
  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.png')).sort();
  console.log(`  ✓ ${pageFiles.length} page PNGs`);

  // Playwright — load every page, confirm render
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#333}' +
    '.p{margin:24px auto;background:#fff;max-width:900px}.p img{display:block;width:100%;height:auto}' +
    '.lbl{color:#eee;text-align:center;padding:8px;font-family:sans-serif;font-size:14px}' +
    '</style></head><body>' +
    pageFiles.map((f) =>
      `<div class="p"><div class="lbl">${v.label}/${f}</div>` +
      `<img src="file:///${join(pagesDir, f).replace(/\\/g, '/')}" /></div>`
    ).join('') +
    '</body></html>';
  const galleryPath = join(out, 'gallery.html');
  writeFileSync(galleryPath, html);
  await page.goto('file:///' + galleryPath.replace(/\\/g, '/'), { waitUntil: 'load' });

  const imgStatus = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.src.split('/').pop(), w: img.naturalWidth, h: img.naturalHeight,
      ok: img.naturalWidth > 0 && img.naturalHeight > 0,
    }))
  );
  const allImgOk = imgStatus.every((s) => s.ok);
  await page.screenshot({ path: join(out, 'gallery_full.png'), fullPage: true });
  await ctx.close();
  console.log(`  ${allImgOk ? '✓' : '✗'} Playwright loaded ${imgStatus.length}/${pageFiles.length} page PNGs`);

  // XML sanity + content checks
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml').asText();
  const opens = (xml.match(/<w:p[\s>]/g) || []).length;
  const closes = (xml.match(/<\/w:p>/g) || []).length;
  const balanced = opens === closes;
  console.log(`  ${balanced ? '✓' : '✗'} XML balance: <w:p> open=${opens} close=${closes}`);

  const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
  const checks = v.expectedTextChecks(text);
  let pass = 0, fail = 0;
  const failures = [];
  for (const [name, ok] of checks) {
    if (ok) pass++;
    else { fail++; failures.push(name); }
  }
  console.log(`  ${fail ? '✗' : '✓'} Content: ${pass}/${checks.length} passed${fail ? ` — failed: ${failures.join(', ')}` : ''}`);

  return {
    label: v.label, ok: balanced && allImgOk && fail === 0,
    pages: pageFiles.length, docxBytes: buf.length,
    balanced, allImgOk, contentPass: pass, contentTotal: checks.length,
    failures,
  };
}

// ── Main ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const variants = [corpFull(), corpMinimal(), llcFull(), llcMinimal()];
const results = [];
for (const v of variants) {
  try { results.push(await runVariant(browser, v)); }
  catch (e) { results.push({ label: v.label, ok: false, reason: e.message }); }
}
await browser.close();

console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`SUMMARY`);
console.log(`═══════════════════════════════════════════════════════`);
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  const detail = r.ok
    ? `${r.pages} pages, ${r.contentPass}/${r.contentTotal} checks, ${(r.docxBytes / 1024).toFixed(0)}KB`
    : (r.reason || `failures: ${(r.failures || []).join(', ')}`);
  console.log(`  ${icon} ${r.label.padEnd(12)} ${detail}`);
}
const allOk = results.every((r) => r.ok);
console.log(`\nOverall: ${allOk ? 'ALL VARIANTS PASS' : 'SOME VARIANTS FAILED'}`);
if (!allOk) process.exit(1);
