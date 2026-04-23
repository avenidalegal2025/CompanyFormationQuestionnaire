/**
 * Batch verification of the agreement-docgen plan features that the
 * existing 144-variant matrix doesn't exercise:
 *
 *   A) Specific Responsibilities + per-owner description paragraphs
 *      (corp_responsibilityDesc_N / llc_roleDesc_N)
 *   B) Custom majority/supermajority thresholds set in Step 6's
 *      definition block (majorityThreshold / supermajorityThreshold)
 *
 * For every variant we also run the sequential-numbering + orphan
 * cross-ref checks, since renumbering is the most fragile part of
 * the pipeline and any insertion shift could reintroduce the 10.5→10.6
 * bug.
 *
 * Run: node scripts/verify-plan-combinations.mjs
 */
import PizZip from 'pizzip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://company-formation-questionnaire.vercel.app/api/agreement/generate';
const OUT = join(process.env.USERPROFILE || '.', 'Downloads', 'plan-combinations');
mkdirSync(OUT, { recursive: true });

const NAMES = [
  { firstName: 'Alice', lastName: 'Founder' },
  { firstName: 'Bob', lastName: 'Builder' },
  { firstName: 'Carol', lastName: 'Chen' },
  { firstName: 'David', lastName: 'Delgado' },
  { firstName: 'Eve', lastName: 'Estrada' },
  { firstName: 'Frank', lastName: 'Fischer' },
];

// ---------- DOCX analysis helpers ----------

function extractText(buf) {
  const xml = new PizZip(buf).file('word/document.xml').asText();
  return {
    xml,
    text: (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '')).join(''),
  };
}

function numberedSections(xml) {
  const pattern = /<w:p[^>]*>([^]*?)<\/w:p>/g;
  const rows = [];
  let m;
  while ((m = pattern.exec(xml)) !== null) {
    const body = m[1];
    const isH3 = body.includes('<w:pStyle w:val="Heading3"/>');
    const hasNumTab = /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(body);
    const texts = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
    if (!texts) continue;
    const startsWithNumSpace = /^\d+\.\d+\s/.test(texts);
    const isH4WithNum =
      body.includes('<w:pStyle w:val="Heading4"/>') && /^\d+\.\d+/.test(texts);
    if (!isH3 && !hasNumTab && !startsWithNumSpace && !isH4WithNum) continue;
    rows.push(texts.substring(0, 100));
  }
  return rows;
}

function checkNumbering(rows) {
  const errors = [];
  const byArticle = new Map();
  for (const r of rows) {
    // The LLC template uses letter-enumerated (A./B./C.) Heading3 sub-clauses
    // inside some numbered sections — those aren't expected to have N.M. Skip.
    if (/^[A-Z]\.\s*[A-Z]/.test(r)) continue;
    const m = r.match(/^(\d+)\.(\d+)/);
    if (!m) { errors.push(`unnumbered: ${r}`); continue; }
    const art = parseInt(m[1], 10);
    const sub = parseInt(m[2], 10);
    if (!byArticle.has(art)) byArticle.set(art, []);
    byArticle.get(art).push(sub);
  }
  for (const [art, subs] of byArticle.entries()) {
    let expected = 1;
    for (const s of subs) {
      if (s !== expected) errors.push(`Art ${art}: expected ${art}.${expected}, saw ${art}.${s}`);
      expected++;
    }
  }
  return { errors, byArticle };
}

function checkCrossRefs(xml, byArticle) {
  const bodyText = xml.replace(/<[^>]+>/g, ' ');
  const validSections = new Set();
  for (const [art, subs] of byArticle.entries()) {
    for (const sub of subs) validSections.add(`${art}.${sub}`);
  }
  const orphans = [];
  const seen = new Set();
  // IRS Code references that legitimately appear in agreement templates.
  // These are external statutory refs, not internal cross-references.
  const irsCodeRefs = new Set([
    '1.704', '1.704-1', '1.704-2', '1.752', '1.752-1', '1.708',
    '83.', '704.', '731.', '1014.', '302.', '368.',
  ]);
  for (const m of bodyText.matchAll(/\b(Sections?|Paragraphs?|Articles?)\s+(\d+\.\d+)/gi)) {
    const ref = `${m[1]} ${m[2]}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (irsCodeRefs.has(m[2])) continue;
    if (!validSections.has(m[2])) orphans.push(ref);
  }
  return orphans;
}

// ---------- payload builders ----------

function baseForm(entityType, ownerCount) {
  const suffix = entityType === 'C-Corp' ? 'Corp' : 'LLC';
  const isCorp = entityType === 'C-Corp';
  const owners = [];
  const pctEach = Math.floor(100 / ownerCount);
  for (let i = 0; i < ownerCount; i++) {
    owners.push({
      firstName: NAMES[i].firstName,
      lastName: NAMES[i].lastName,
      fullName: `${NAMES[i].firstName} ${NAMES[i].lastName}`,
      ownership: i === ownerCount - 1 ? 100 - pctEach * (ownerCount - 1) : pctEach,
    });
  }
  const agreement = {
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,
    distributionFrequency: 'Trimestral',
  };
  if (isCorp) {
    Object.assign(agreement, {
      corp_saleDecisionThreshold: 'Mayoría',
      corp_bankSigners: 'Dos firmantes',
      corp_majorDecisionThreshold: 'Mayoría',
      corp_majorSpendingThreshold: '10000',
      corp_officerRemovalVoting: 'Mayoría',
      corp_nonCompete: 'No',
      corp_nonSolicitation: 'Yes',
      corp_confidentiality: 'Yes',
      corp_taxOwner: owners[0].fullName,
      corp_rofr: 'Yes',
      corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: 'Sí, podrán transferir libremente sus acciones.',
      corp_incapacityHeirsPolicy: 'Yes',
      corp_divorceBuyoutPolicy: 'Yes',
      corp_tagDragRights: 'Yes',
      corp_newShareholdersAdmission: 'Mayoría',
      corp_moreCapitalProcess: 'Sí, Pro-Rata',
      corp_shareholderLoans: 'No',
    });
    for (let i = 0; i < ownerCount; i++) agreement[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(agreement, {
      llc_companySaleDecision: 'Mayoría',
      llc_bankSigners: 'Dos firmantes',
      llc_majorDecisions: 'Mayoría',
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: 'Mayoría',
      llc_nonCompete: 'No',
      llc_nonSolicitation: 'Yes',
      llc_confidentiality: 'Yes',
      llc_taxPartner: owners[0].fullName,
      llc_rofr: 'Yes',
      llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: 'Yes',
      llc_dissolutionDecision: 'Mayoría',
      llc_newMembersAdmission: 'Mayoría',
      llc_newPartnersAdmission: 'Mayoría',
      llc_managingMembers: 'Yes',
      llc_additionalContributions: 'Sí, Pro-Rata',
      llc_memberLoans: 'No',
      llc_minTaxDistribution: 30,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`llc_capitalContributions_${i}`] = '50000';
  }

  return {
    ownersCount: ownerCount,
    company: {
      entityType,
      companyNameBase: `PLANTEST ${entityType} ${ownerCount}`,
      entitySuffix: suffix,
      formationState: 'Florida',
      hasUsaAddress: 'No',
      numberOfShares: 1000,
    },
    owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
    admin: isCorp
      ? { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }
      : { managersAllOwners: 'Yes' },
    agreement,
  };
}

function withResponsibilities(fd, isCorp, ownerCount, titles, descs) {
  const a = fd.agreement;
  if (isCorp) {
    a.corp_hasSpecificResponsibilities = 'Yes';
    for (let i = 0; i < ownerCount; i++) {
      a[`corp_specificResponsibilities_${i}`] = titles[i];
      a[`corp_responsibilityDesc_${i}`] = descs[i];
    }
  } else {
    a.llc_hasSpecificRoles = 'Yes';
    for (let i = 0; i < ownerCount; i++) {
      a[`llc_specificRoles_${i}`] = titles[i];
      a[`llc_roleDesc_${i}`] = descs[i];
    }
  }
  return fd;
}

// ---------- test matrix ----------

const tests = [];

// Test group A — Responsibilities enabled, every owner count, both entities
for (const entityType of ['C-Corp', 'LLC']) {
  for (const ownerCount of [1, 2, 3, 4, 5, 6]) {
    const isCorp = entityType === 'C-Corp';
    const titles = [];
    const descs = [];
    for (let i = 0; i < ownerCount; i++) {
      titles.push(`Role-${i}-Title-Sentinel-${ownerCount}own`);
      descs.push(`UniqueDesc${i}#${ownerCount} — marker text for owner ${i}.`);
    }
    const fd = withResponsibilities(baseForm(entityType, ownerCount), isCorp, ownerCount, titles, descs);
    tests.push({
      label: `A_${entityType}_${ownerCount}own_RESP`,
      formData: fd,
      assertions: (text, xml) => {
        const errs = [];
        const heading = isCorp ? 'Specific Responsibilities of Shareholders.'
                              : 'Specific Responsibilities of Members.';
        if (!text.includes(heading)) errs.push(`missing "${heading}"`);
        // every owner name appears
        for (let i = 0; i < ownerCount; i++) {
          const fullName = `${NAMES[i].firstName} ${NAMES[i].lastName}`;
          // LLC template may not render all 6 member slots — soft check: at least first 2
          if (isCorp || i < 2) {
            if (!text.includes(fullName)) errs.push(`missing owner ${fullName}`);
          }
        }
        // every unique title appears (first 2 owners for LLC — template limit)
        const titleCheckMax = isCorp ? ownerCount : Math.min(ownerCount, 2);
        for (let i = 0; i < titleCheckMax; i++) {
          if (!text.includes(titles[i])) errs.push(`missing title ${titles[i]}`);
          if (!text.includes(descs[i])) errs.push(`missing desc for owner ${i}`);
        }
        return errs;
      },
    });
  }
}

// Test group B — Custom majority / supermajority thresholds, both entities
const thresholdCases = [
  { maj: 50.01, sup: 75 },
  { maj: 51, sup: 67 },
  { maj: 60, sup: 80 },
  { maj: 65, sup: 90 },
];
for (const entityType of ['C-Corp', 'LLC']) {
  for (const { maj, sup } of thresholdCases) {
    const isCorp = entityType === 'C-Corp';
    const fd = baseForm(entityType, 2);
    fd.agreement.majorityThreshold = maj;
    fd.agreement.supermajorityThreshold = sup;
    // Force a Mayoría and Supermayoría voting option to be selected so the
    // threshold text gets rendered in context somewhere.
    if (isCorp) {
      fd.agreement.corp_saleDecisionThreshold = 'Supermayoría';
      fd.agreement.corp_majorDecisionThreshold = 'Mayoría';
    } else {
      fd.agreement.llc_companySaleDecision = 'Supermayoría';
      fd.agreement.llc_majorDecisions = 'Mayoría';
    }
    tests.push({
      label: `B_${entityType}_MAJ${maj}_SUP${sup}`,
      formData: fd,
      assertions: (text) => {
        const errs = [];
        const majPct = maj.toFixed(2);
        const supPct = sup.toFixed(2);
        if (!text.includes(majPct) && !text.includes(`${maj}%`)) errs.push(`missing majority ${maj}`);
        if (!text.includes(supPct) && !text.includes(`${sup}%`)) errs.push(`missing supermajority ${sup}`);
        return errs;
      },
    });
  }
}

// ---------- runner ----------

let pass = 0, fail = 0;
const failures = [];

for (const [i, t] of tests.entries()) {
  const n = String(i + 1).padStart(2, '0');
  process.stdout.write(`#${n} ${t.label.padEnd(40)} `);
  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: t.formData, draftId: `plantest-${i}` }),
      signal: AbortSignal.timeout(45000),
    });
    if (!resp.ok) {
      const body = await resp.text();
      fail++;
      failures.push({ label: t.label, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` });
      console.log(`FAIL HTTP ${resp.status}`);
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(join(OUT, `${n}_${t.label}.docx`), buf);
    const { xml, text } = extractText(buf);

    // Feature assertions
    const errs = t.assertions(text, xml);

    // Universal: no leftover placeholders
    if (text.includes('{{')) errs.push('leftover {{}}');
    if (text.includes('%%')) errs.push('leftover %%');

    // Universal: sequential numbering + no orphan cross-refs
    const rows = numberedSections(xml);
    const { errors: numErrs, byArticle } = checkNumbering(rows);
    errs.push(...numErrs.slice(0, 3)); // cap to avoid noise
    const orphans = checkCrossRefs(xml, byArticle);
    // We tolerate the one template-bogus "4.4" orphan if it appears — but
    // flag everything else. Empirically we've seen no orphans on recent
    // prod runs, so just count.
    if (orphans.length > 0) errs.push(`orphan refs: ${orphans.slice(0, 3).join(', ')}`);

    if (errs.length === 0) {
      pass++;
      console.log(`PASS (${rows.length} sections)`);
    } else {
      fail++;
      failures.push({ label: t.label, errors: errs });
      console.log(`FAIL: ${errs[0]}`);
      for (const e of errs.slice(1)) console.log(`      ${e}`);
    }
  } catch (e) {
    fail++;
    failures.push({ label: t.label, error: e.message });
    console.log(`ERROR ${e.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`TOTAL: ${tests.length} | PASS ${pass} | FAIL ${fail}`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  ${f.label}: ${f.errors ? f.errors.join(' | ') : f.error}`);
  }
}
process.exit(fail > 0 ? 1 : 0);
