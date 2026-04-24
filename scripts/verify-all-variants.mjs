/**
 * Single runner for ALL agreement-docgen variant coverage.
 *
 *   Group M (144): base matrix —
 *     entity(2) × voting(3) × ROFR(2) × drag/tag(2) × bank(2) × owners(3)
 *   Group A (12):  Specific Responsibilities + per-owner description —
 *     entity(2) × ownerCount(1..6)
 *   Group B (8):   Custom majority/supermajority thresholds —
 *     entity(2) × threshold-pair(4)
 *   Group C (16):  Cross-feature stress —
 *     entity(2) × ownerCount(2,6) × ROFR(Y/N) × drag/tag(Y/N), always with
 *     Responsibilities=Yes, Supermayoría on sale, custom thresholds 60/80
 *   Group D (16):  Restrictive covenants —
 *     entity(2) × nonCompete(Y/N) × nonSolicitation(Y/N) × confidentiality(Y/N)
 *   Group E (30):  Money mechanics —
 *     entity(2) × distributionFrequency(4) × moreCapital(2) × loans(2), trimmed
 *   Group F (24):  Succession —
 *     entity(2) × transferToRelatives(3) × incapacityHeirs(Y/N) × divorceBuyout(Y/N)
 *
 * Every variant also runs universal checks:
 *   • no leftover {{ }} or %% placeholders
 *   • sequential N.M numbering per Article
 *   • no orphan internal cross-refs (Section N.M pointing nowhere)
 * And per-variant structural stats are collected and diffed against a
 * committed baseline (scripts/variants-stats-baseline.csv) — any deviation
 * is surfaced for human review.
 *
 * Run: node scripts/verify-all-variants.mjs
 *      node scripts/verify-all-variants.mjs --only=M        # one group
 *      node scripts/verify-all-variants.mjs --save          # write DOCXes locally
 *      node scripts/verify-all-variants.mjs --refresh-baseline
 */

import { inflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_BASE = process.env.VERIFY_API_BASE ||
  'https://company-formation-questionnaire.vercel.app';
const API = `${API_BASE}/api/agreement/generate`;
const OUT = join(process.env.USERPROFILE || '.', 'Downloads', 'all-variants');
mkdirSync(OUT, { recursive: true });

const argv = new Set(process.argv.slice(2));
const onlyGroupArg = process.argv.find((a) => a.startsWith('--only='));
const onlyGroup = onlyGroupArg ? onlyGroupArg.slice('--only='.length) : null;
const SAVE = argv.has('--save');

const NAMES = [
  'Roberto Mendez', 'Ana Garcia', 'Carlos Lopez',
  'Maria Torres', 'Pedro Ramirez', 'Sofia Flores',
];

// ─── DOCX extraction (zero-dep) ──────────────────────────────────────

function getXml(buf) {
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const comp = buf.readUInt16LE(offset + 8);
      const cSize = buf.readUInt32LE(offset + 18);
      const nLen = buf.readUInt16LE(offset + 26);
      const eLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString('utf8', offset + 30, offset + 30 + nLen);
      const dStart = offset + 30 + nLen + eLen;
      if (name === 'word/document.xml') {
        const raw = comp === 0
          ? buf.subarray(dStart, dStart + cSize)
          : inflateRawSync(buf.subarray(dStart, dStart + cSize));
        return raw.toString('utf8');
      }
      offset = dStart + cSize;
    } else offset++;
  }
  return '';
}

function textOf(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '')).join('');
}

function numberedSections(xml) {
  const paras = xml.match(/<w:p[^>]*>([^]*?)<\/w:p>/g) || [];
  const rows = [];
  for (const p of paras) {
    const isH3 = p.includes('<w:pStyle w:val="Heading3"/>');
    const hasNumTab = /<w:t[^>]*>\d+\.\d+<\/w:t>\s*<w:tab\/>/.test(p);
    const txt = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
    if (!txt) continue;
    const startsNum = /^\d+\.\d+\s/.test(txt);
    const isH4Num =
      p.includes('<w:pStyle w:val="Heading4"/>') && /^\d+\.\d+/.test(txt);
    if (!isH3 && !hasNumTab && !startsNum && !isH4Num) continue;
    rows.push(txt.substring(0, 100));
  }
  return rows;
}

function checkNumbering(rows) {
  const errors = [];
  const byArticle = new Map();
  for (const r of rows) {
    // LLC template letter-enumerated (A./B./C.) sub-clauses — skip.
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

// IRS / Treas. Reg. external statutory refs, not internal cross-refs.
const IRS_REFS = new Set([
  '1.704', '1.704-1', '1.704-2', '1.752', '1.752-1', '1.708',
  '83.', '704.', '731.', '1014.', '302.', '368.',
]);

function checkCrossRefs(xml, byArticle) {
  const body = xml.replace(/<[^>]+>/g, ' ');
  const valid = new Set();
  for (const [art, subs] of byArticle.entries()) {
    for (const s of subs) valid.add(`${art}.${s}`);
  }
  const orphans = [];
  const seen = new Set();
  for (const m of body.matchAll(/\b(Sections?|Paragraphs?|Articles?)\s+(\d+\.\d+)/gi)) {
    const ref = `${m[1]} ${m[2]}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (IRS_REFS.has(m[2])) continue;
    if (!valid.has(m[2])) orphans.push(ref);
  }
  return orphans;
}

// ─── Payload builders ───────────────────────────────────────────────

function votingProfile(v) {
  const map = {
    unanimous: { sale: 'Decisión Unánime', major: 'Decisión Unánime', newMember: 'Decisión Unánime', dissolution: 'Decisión Unánime', removal: 'Decisión Unánime', loans: 'Decisión Unánime', capital: 'Decisión Unánime' },
    majority:  { sale: 'Mayoría',          major: 'Mayoría',          newMember: 'Mayoría',          dissolution: 'Mayoría',          removal: 'Mayoría',          loans: 'Mayoría',          capital: 'Mayoría' },
    mixed:     { sale: 'Supermayoría',     major: 'Mayoría',          newMember: 'Decisión Unánime', dissolution: 'Mayoría',          removal: 'Supermayoría',     loans: 'Mayoría',          capital: 'Supermayoría' },
  };
  return map[v];
}

function ownerArray(n) {
  const pctEach = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => ({
    fullName: NAMES[i],
    ownership: i === n - 1 ? 100 - pctEach * (n - 1) : pctEach,
  }));
}

function baseFormData({
  entity, voting = 'majority', ownerCount = 2,
  rofr = true, dragTag = true, bank = 'two',
  majorityThreshold = 50.01, supermajorityThreshold = 75,
  // extended toggles (defaults preserve existing 180 behavior)
  nonCompete = 'No',
  nonSolicitation = 'Yes',
  confidentiality = 'Yes',
  distributionFrequency = 'Trimestral',
  transferToRelatives = 'free', // 'free' | 'unanimous' | 'majority'
  incapacityHeirs = true,
  divorceBuyout = true,
  moreCapital = 'Pro-Rata', // 'Pro-Rata' | 'No'
  loans = true,
  label,
}) {
  const isCorp = entity === 'C-Corp';
  const suffix = isCorp ? 'Corp' : 'LLC';
  const v = votingProfile(voting);
  const owners = ownerArray(ownerCount);

  const TRANSFER_OPTS = {
    free: 'Sí, podrán transferir libremente sus acciones.',
    unanimous: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
    majority: 'Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.',
  };
  const MORE_CAPITAL_OPTS = { 'Pro-Rata': 'Sí, Pro-Rata', 'No': 'No' };

  const agreement = {
    wants: 'Yes',
    majorityThreshold,
    supermajorityThreshold,
    distributionFrequency,
  };

  if (isCorp) {
    Object.assign(agreement, {
      corp_saleDecisionThreshold: v.sale,
      corp_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      corp_majorDecisionThreshold: v.major,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: v.removal,
      corp_nonCompete: nonCompete,
      corp_nonSolicitation: nonSolicitation,
      corp_confidentiality: confidentiality,
      corp_taxOwner: NAMES[0],
      corp_rofr: rofr ? 'Yes' : 'No', corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: TRANSFER_OPTS[transferToRelatives],
      corp_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      corp_divorceBuyoutPolicy: divorceBuyout ? 'Yes' : 'No',
      corp_tagDragRights: dragTag ? 'Yes' : 'No',
      corp_newShareholdersAdmission: v.newMember,
      corp_moreCapitalProcess: MORE_CAPITAL_OPTS[moreCapital],
      corp_shareholderLoans: loans ? 'Yes' : 'No',
      corp_shareholderLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(agreement, {
      llc_companySaleDecision: v.sale,
      llc_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      llc_majorDecisions: v.major,
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: v.removal,
      llc_nonCompete: nonCompete,
      llc_nonSolicitation: nonSolicitation,
      llc_confidentiality: confidentiality,
      llc_nonDisparagement: 'Yes',
      llc_taxPartner: NAMES[0],
      llc_minTaxDistribution: 30,
      llc_rofr: rofr ? 'Yes' : 'No', llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      llc_dissolutionDecision: v.dissolution,
      llc_newMembersAdmission: v.newMember,
      llc_newPartnersAdmission: v.newMember,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: MORE_CAPITAL_OPTS[moreCapital],
      llc_memberLoans: loans ? 'Yes' : 'No',
      llc_memberLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`llc_capitalContributions_${i}`] = '50000';
  }

  return {
    label,
    formData: {
      company: {
        entityType: entity, companyNameBase: label.slice(0, 20), entitySuffix: suffix,
        formationState: 'Florida', companyName: label.slice(0, 20) + ' ' + suffix,
        hasUsaAddress: 'No', hasUsPhone: 'No', numberOfShares: 1000,
      },
      ownersCount: ownerCount,
      owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
      admin: isCorp
        ? { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }
        : { managersAllOwners: 'Yes' },
      agreement,
    },
    meta: {
      entity, voting, rofr, dragTag, bank, ownerCount,
      majorityThreshold, supermajorityThreshold,
      nonCompete, nonSolicitation, confidentiality, distributionFrequency,
      transferToRelatives, incapacityHeirs, divorceBuyout, moreCapital, loans,
    },
  };
}

function withResponsibilities(variant, titles, descs) {
  const isCorp = variant.meta.entity === 'C-Corp';
  const a = variant.formData.agreement;
  if (isCorp) {
    a.corp_hasSpecificResponsibilities = 'Yes';
    for (let i = 0; i < variant.meta.ownerCount; i++) {
      a[`corp_specificResponsibilities_${i}`] = titles[i];
      a[`corp_responsibilityDesc_${i}`] = descs[i];
    }
  } else {
    a.llc_hasSpecificRoles = 'Yes';
    for (let i = 0; i < variant.meta.ownerCount; i++) {
      a[`llc_specificRoles_${i}`] = titles[i];
      a[`llc_roleDesc_${i}`] = descs[i];
    }
  }
  variant.meta.responsibilities = true;
  return variant;
}

// ─── Per-group assertions ────────────────────────────────────────────

function assertMatrixBase(text, meta) {
  const errs = [];
  const { entity, voting, rofr, dragTag, bank, ownerCount } = meta;
  const isCorp = entity === 'C-Corp';

  if (rofr && !text.includes('Right of First Refusal')) errs.push('ROFR missing');
  if (!rofr && text.includes('Right of First Refusal')) errs.push('ROFR not removed');

  if (isCorp) {
    if (dragTag && !text.includes('Drag Along')) errs.push('Drag Along missing');
    if (!dragTag && text.includes('Drag Along')) errs.push('Drag Along not removed');
  }

  if (isCorp) {
    if (bank === 'two' && !text.includes('two of the Officers')) errs.push('Bank two missing');
    if (bank === 'one' && !text.includes('one of the Officers')) errs.push('Bank one missing');
  } else {
    if (bank === 'two' && !text.includes('any two Members or Managers')) errs.push('Bank two missing');
    if (bank === 'one' && !text.includes('the signature of any Member or Manager')) errs.push('Bank one missing');
  }

  const maxNameCheck = isCorp ? ownerCount : Math.min(ownerCount, 2);
  for (let i = 0; i < maxNameCheck; i++) {
    if (!text.includes(NAMES[i])) errs.push(`owner ${NAMES[i]} missing`);
  }

  const expect = {
    unanimous: isCorp ? 'Unanimous consent or approval' : 'Unanimous consent of the Members',
    majority:  isCorp ? 'Majority consent or approval'  : 'Majority consent of the Members',
    mixed:     isCorp ? 'Super Majority consent or approval' : 'Super Majority consent of the Members',
  };
  if (!text.includes(expect[voting])) errs.push(`sale voting "${expect[voting]}" missing`);
  return errs;
}

function assertResponsibilities(text, meta, titles, descs) {
  const errs = [];
  const isCorp = meta.entity === 'C-Corp';
  const heading = isCorp
    ? 'Specific Responsibilities of Shareholders.'
    : 'Specific Responsibilities of Members.';
  if (!text.includes(heading)) errs.push(`missing "${heading}"`);
  const max = isCorp ? meta.ownerCount : Math.min(meta.ownerCount, 2);
  for (let i = 0; i < max; i++) {
    if (!text.includes(titles[i])) errs.push(`missing title ${titles[i]}`);
    if (!text.includes(descs[i])) errs.push(`missing desc for owner ${i}`);
  }
  return errs;
}

function assertThresholds(text, meta) {
  const errs = [];
  const majPct = meta.majorityThreshold.toFixed(2);
  const supPct = meta.supermajorityThreshold.toFixed(2);
  if (!text.includes(majPct) && !text.includes(`${meta.majorityThreshold}%`)) {
    errs.push(`missing majority ${meta.majorityThreshold}`);
  }
  if (!text.includes(supPct) && !text.includes(`${meta.supermajorityThreshold}%`)) {
    errs.push(`missing supermajority ${meta.supermajorityThreshold}`);
  }
  return errs;
}

// ─── Variant factories ──────────────────────────────────────────────

function buildGroupM() {
  const out = [];
  const entities = ['C-Corp', 'LLC'];
  const votings = ['unanimous', 'majority', 'mixed'];
  const rofrs = [true, false];
  const drags = [true, false];
  const banks = ['two', 'one'];
  const owners = [1, 2, 3];
  for (const entity of entities)
    for (const voting of votings)
      for (const rofr of rofrs)
        for (const dragTag of drags)
          for (const bank of banks)
            for (const ownerCount of owners) {
              const label = `M_${entity}_${voting}_rofr${rofr ? 'Y' : 'N'}_dt${dragTag ? 'Y' : 'N'}_bank${bank}_${ownerCount}own`;
              const v = baseFormData({ entity, voting, ownerCount, rofr, dragTag, bank, label });
              v.run = (text) => assertMatrixBase(text, v.meta);
              out.push(v);
            }
  return out;
}

function buildGroupA() {
  const out = [];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const ownerCount of [1, 2, 3, 4, 5, 6]) {
      const titles = [], descs = [];
      for (let i = 0; i < ownerCount; i++) {
        titles.push(`Role-${i}-Title-Sentinel-${ownerCount}own`);
        descs.push(`UniqueDesc${i}#${ownerCount} — marker text for owner ${i}.`);
      }
      const label = `A_${entity}_${ownerCount}own_RESP`;
      const v = withResponsibilities(
        baseFormData({ entity, ownerCount, label }),
        titles, descs,
      );
      v.run = (text) => assertResponsibilities(text, v.meta, titles, descs);
      out.push(v);
    }
  }
  return out;
}

function buildGroupB() {
  const out = [];
  const pairs = [
    { maj: 50.01, sup: 75 },
    { maj: 51, sup: 67 },
    { maj: 60, sup: 80 },
    { maj: 65, sup: 90 },
  ];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const { maj, sup } of pairs) {
      const label = `B_${entity}_MAJ${maj}_SUP${sup}`;
      const v = baseFormData({
        entity, voting: 'mixed', ownerCount: 2,
        majorityThreshold: maj, supermajorityThreshold: sup, label,
      });
      v.run = (text) => assertThresholds(text, v.meta);
      out.push(v);
    }
  }
  return out;
}

function buildGroupC() {
  // Cross-feature stress: Responsibilities + mixed voting + custom thresholds
  // intersected with feature-flag corners (rofr/drag) × owner-count corners.
  const out = [];
  const entities = ['C-Corp', 'LLC'];
  const ownerCorners = [2, 6];
  const rofrs = [true, false];
  const drags = [true, false];
  for (const entity of entities)
    for (const ownerCount of ownerCorners)
      for (const rofr of rofrs)
        for (const dragTag of drags) {
          const titles = Array.from({ length: ownerCount }, (_, i) => `CrossTitle${i}`);
          const descs  = Array.from({ length: ownerCount }, (_, i) => `CrossDesc${i}-marker`);
          const label = `C_${entity}_${ownerCount}own_rofr${rofr ? 'Y' : 'N'}_dt${dragTag ? 'Y' : 'N'}_SUP80`;
          const v = withResponsibilities(
            baseFormData({
              entity, voting: 'mixed', ownerCount, rofr, dragTag, bank: 'two',
              majorityThreshold: 60, supermajorityThreshold: 80, label,
            }),
            titles, descs,
          );
          v.run = (text) => ([
            ...assertMatrixBase(text, v.meta),
            ...assertResponsibilities(text, v.meta, titles, descs),
            ...assertThresholds(text, v.meta),
          ]);
          out.push(v);
        }
  return out;
}

// Group D — Restrictive covenants: nonCompete × nonSolicitation × confidentiality
// Pairwise (8 combinations) × 2 entities = 16 variants. Exercises all 8 toggle
// states so any branch that was never rendered gets hit.
function buildGroupD() {
  const out = [];
  const triplets = [
    ['Yes', 'Yes', 'Yes'], ['Yes', 'Yes', 'No'], ['Yes', 'No', 'Yes'], ['Yes', 'No', 'No'],
    ['No',  'Yes', 'Yes'], ['No',  'Yes', 'No'], ['No',  'No', 'Yes'], ['No',  'No', 'No'],
  ];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const [nc, ns, cf] of triplets) {
      const label = `D_${entity}_nc${nc[0]}_ns${ns[0]}_cf${cf[0]}`;
      const v = baseFormData({
        entity, ownerCount: 2,
        nonCompete: nc, nonSolicitation: ns, confidentiality: cf, label,
      });
      v.run = (text) => assertMatrixBase(text, v.meta);
      out.push(v);
    }
  }
  return out;
}

// Group E — distributionFrequency × moreCapital × loans. Previously pinned to
// Trimestral + Pro-Rata + Yes; this exercises every branch.
function buildGroupE() {
  const out = [];
  const freqs = ['Trimestral', 'Semestral', 'Anual', 'Discreción de la Junta'];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const freq of freqs) {
      for (const moreCapital of ['Pro-Rata', 'No']) {
        for (const loans of [true, false]) {
          if (freq === 'Semestral' && moreCapital === 'No' && !loans) continue; // trim
          const label = `E_${entity}_${freq.slice(0, 4)}_mc${moreCapital === 'Pro-Rata' ? 'P' : 'N'}_ln${loans ? 'Y' : 'N'}`;
          const v = baseFormData({
            entity, ownerCount: 2,
            distributionFrequency: freq, moreCapital, loans, label,
          });
          v.run = (text) => assertMatrixBase(text, v.meta);
          out.push(v);
        }
      }
    }
  }
  return out;
}

// Group F — transferToRelatives (3 values) × incapacityHeirs × divorceBuyout.
function buildGroupF() {
  const out = [];
  const transfers = ['free', 'unanimous', 'majority'];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const transfer of transfers) {
      for (const heirs of [true, false]) {
        for (const divorce of [true, false]) {
          const label = `F_${entity}_xfer${transfer[0]}_heirs${heirs ? 'Y' : 'N'}_div${divorce ? 'Y' : 'N'}`;
          const v = baseFormData({
            entity, ownerCount: 2,
            transferToRelatives: transfer,
            incapacityHeirs: heirs, divorceBuyout: divorce,
            label,
          });
          v.run = (text) => assertMatrixBase(text, v.meta);
          out.push(v);
        }
      }
    }
  }
  return out;
}

// ─── Structural stats collection ────────────────────────────────────
//
// We DO NOT fail on absolute structural values (tables, rFonts, tab
// counts, heading counts) — the template itself has baseline quirks
// (e.g. every run explicitly declares Times New Roman, agreement tables
// use <w:tblGrid> instead of per-cell <w:tcW>). What we DO is emit
// per-variant stats, then diff a committed golden baseline on CI. Any
// deviation gets reviewed by a human. This catches format regressions
// without brittle structural rules that generate constant noise.

function collectStats(xml) {
  const stats = {};
  const tables = xml.match(/<w:tbl[ >][^]*?<\/w:tbl>/g) || [];
  stats.tables = tables.length;

  const paras = xml.match(/<w:p[ >][^]*?<\/w:p>/g) || [];
  let totalParas = 0, h3 = 0, h4 = 0, tabs = 0, numbered = 0, rFontsRuns = 0, pageBreaks = 0;
  for (const p of paras) {
    totalParas++;
    if (/<w:pStyle w:val="Heading3"\/>/.test(p)) h3++;
    if (/<w:pStyle w:val="Heading4"\/>/.test(p)) h4++;
    tabs += (p.match(/<w:tab\/>/g) || []).length;
    pageBreaks += (p.match(/<w:br[^>]*w:type="page"/g) || []).length;
    const text = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '')).join('');
    if (/^\d{1,2}\.\d{1,2}(?:\s|[A-Za-z])/.test(text)) numbered++;
    const runs = p.match(/<w:r[ >][^]*?<\/w:r>/g) || [];
    for (const r of runs) if (/<w:rFonts/.test(r)) rFontsRuns++;
  }
  stats.paragraphs = totalParas;
  stats.h3 = h3;
  stats.h4 = h4;
  stats.tabs = tabs;
  stats.pageBreaks = pageBreaks;
  stats.numbered = numbered;
  stats.rFontsRuns = rFontsRuns;
  stats.bodyLen = xml.length;
  return stats;
}

// ─── Runner ──────────────────────────────────────────────────────────

const allStats = [];

async function runOne(v) {
  const resp = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formData: v.formData, draftId: `v-${v.label}` }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return { errors: [`HTTP ${resp.status}: ${body.slice(0, 160)}`] };
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (SAVE) writeFileSync(join(OUT, `${v.label}.docx`), buf);
  const xml = getXml(buf);
  const text = textOf(xml);
  const featureErrs = v.run(text);

  const errs = [...featureErrs];
  if (text.includes('{{')) errs.push('leftover {{}}');
  if (text.includes('%%')) errs.push('leftover %%');

  const rows = numberedSections(xml);
  const { errors: numErrs, byArticle } = checkNumbering(rows);
  errs.push(...numErrs.slice(0, 3));
  const orphans = checkCrossRefs(xml, byArticle);
  if (orphans.length > 0) errs.push(`orphan refs: ${orphans.slice(0, 3).join(', ')}`);

  const stats = collectStats(xml);
  allStats.push({ label: v.label, meta: v.meta, stats, sectionCount: rows.length });

  return { errors: errs, sectionCount: rows.length };
}

async function main() {
  const allGroups = [
    { name: 'M', variants: buildGroupM() },
    { name: 'A', variants: buildGroupA() },
    { name: 'B', variants: buildGroupB() },
    { name: 'C', variants: buildGroupC() },
    { name: 'D', variants: buildGroupD() },
    { name: 'E', variants: buildGroupE() },
    { name: 'F', variants: buildGroupF() },
  ];
  const groups = onlyGroup
    ? allGroups.filter((g) => g.name === onlyGroup)
    : allGroups;

  let total = 0, pass = 0, fail = 0;
  const failures = [];
  const terse = !onlyGroup; // only dotty output when running everything

  for (const g of groups) {
    if (!terse) console.log(`\n── Group ${g.name}: ${g.variants.length} tests ──`);
    for (const v of g.variants) {
      total++;
      try {
        const { errors, sectionCount } = await runOne(v);
        if (errors.length === 0) {
          pass++;
          if (terse) process.stdout.write('.');
          else console.log(`  ${v.label.padEnd(48)} PASS (${sectionCount} sections)`);
        } else {
          fail++;
          failures.push({ label: v.label, errors });
          if (terse) process.stdout.write('F');
          else console.log(`  ${v.label.padEnd(48)} FAIL: ${errors[0]}`);
        }
      } catch (e) {
        fail++;
        failures.push({ label: v.label, errors: [e.message] });
        if (terse) process.stdout.write('E');
        else console.log(`  ${v.label.padEnd(48)} ERROR: ${e.message}`);
      }
    }
    if (terse) process.stdout.write(' ');
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`TOTAL: ${total} | PASS ${pass} | FAIL ${fail}`);
  if (fail > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  ${f.label}: ${f.errors.join(' | ')}`);
    }
  } else {
    console.log('STATUS: ALL VARIANTS VERIFIED');
  }

  // Write per-variant stats CSV for anomaly triage (launch hardening).
  // A committed golden baseline (scripts/variants-stats-baseline.csv) is
  // compared cell-by-cell; any deviation is reported and fails the run
  // unless --refresh-baseline is passed.
  const csvDeviations = [];
  if (allStats.length > 0) {
    const cols = ['label', 'entity', 'voting', 'ownerCount', 'rofr', 'dragTag',
      'sectionCount', 'paragraphs', 'h3', 'h4', 'tabs', 'pageBreaks',
      'numbered', 'tables', 'rFontsRuns', 'bodyLen'];
    const rowFor = (r) => [
      r.label,
      r.meta?.entity ?? '',
      r.meta?.voting ?? '',
      r.meta?.ownerCount ?? '',
      r.meta?.rofr ?? '',
      r.meta?.dragTag ?? '',
      r.sectionCount,
      r.stats.paragraphs,
      r.stats.h3,
      r.stats.h4,
      r.stats.tabs,
      r.stats.pageBreaks,
      r.stats.numbered,
      r.stats.tables,
      r.stats.rFontsRuns,
      r.stats.bodyLen,
    ];
    const lines = [cols.join(',')];
    for (const r of allStats) lines.push(rowFor(r).join(','));

    const csvPath = join(OUT, 'variants-stats.csv');
    writeFileSync(csvPath, lines.join('\n') + '\n');
    console.log(`\nStats CSV: ${csvPath}`);

    // Baseline diff (only meaningful when running full suite)
    const baselinePath = 'scripts/variants-stats-baseline.csv';
    const refresh = argv.has('--refresh-baseline');
    if (refresh) {
      writeFileSync(baselinePath, lines.join('\n') + '\n');
      console.log(`Baseline refreshed: ${baselinePath}`);
    } else {
      let baselineSrc = null;
      try {
        baselineSrc = readFileSync(baselinePath, 'utf8');
      } catch { /* no baseline yet */ }
      if (baselineSrc) {
        const base = new Map();
        for (const ln of baselineSrc.trim().split('\n').slice(1)) {
          const cells = ln.split(',');
          base.set(cells[0], cells);
        }
        for (const r of allStats) {
          const row = rowFor(r);
          const key = row[0];
          const b = base.get(key);
          if (!b) continue; // new variant; not a deviation
          for (let i = 6; i < cols.length; i++) {
            // columns 0..5 are identity; 6.. are structural stats
            if (String(row[i]) !== String(b[i])) {
              csvDeviations.push(`${key}.${cols[i]}: baseline=${b[i]} got=${row[i]}`);
            }
          }
        }
        if (csvDeviations.length > 0) {
          console.log(`\nSTRUCTURAL DEVIATIONS vs baseline (${csvDeviations.length}):`);
          for (const d of csvDeviations.slice(0, 30)) console.log(`  ${d}`);
          if (csvDeviations.length > 30) console.log(`  ...and ${csvDeviations.length - 30} more`);
        }
      } else {
        console.log(`(no baseline at ${baselinePath} — run with --refresh-baseline to create)`);
      }
    }
  }

  process.exit((fail > 0 || csvDeviations.length > 0) ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
