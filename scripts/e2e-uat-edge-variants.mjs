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
const RUN_TAG = (process.env.E2E_RUN_TAG || 'r8').trim();

export const NAMES = [
  'Roberto Mendez', 'Ana Garcia', 'Carlos Lopez',
  'Maria Torres', 'Pedro Ramirez', 'Sofia Flores',
];
// Names reserved for non-owner directors / managers / officers so we
// never confuse "owner-as-director" with "external director" when
// reviewing rendered docs.
const NON_OWNER_NAMES = [
  'Daniel Vega', 'Patricia Soto', 'Luis Herrera',
  'Carmen Rios', 'Andres Castillo', 'Gabriela Ortiz',
  'Hernan Salas',
];
function splitName(full) {
  const parts = full.split(' ');
  return { firstName: parts[0], lastName: parts.slice(1).join(' '), fullName: full };
}
const OFFICER_ROLES = [
  'President', 'Vice-President', 'Secretary', 'Treasurer',
  'Assistant Vice-President', 'Assistant Secretary',
];

export function votingProfile(v) {
  const map = {
    unanimous: { sale: 'Decisión Unánime', major: 'Decisión Unánime', newMember: 'Decisión Unánime', dissolution: 'Decisión Unánime', removal: 'Decisión Unánime', loans: 'Decisión Unánime', capital: 'Decisión Unánime' },
    majority:  { sale: 'Mayoría',          major: 'Mayoría',          newMember: 'Mayoría',          dissolution: 'Mayoría',          removal: 'Mayoría',          loans: 'Mayoría',          capital: 'Mayoría' },
    supermajority: { sale: 'Supermayoría', major: 'Supermayoría',     newMember: 'Supermayoría',     dissolution: 'Supermayoría',     removal: 'Supermayoría',     loans: 'Supermayoría',     capital: 'Supermayoría' },
    mixed:     { sale: 'Supermayoría',     major: 'Mayoría',          newMember: 'Decisión Unánime', dissolution: 'Mayoría',          removal: 'Supermayoría',     loans: 'Mayoría',          capital: 'Supermayoría' },
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

export const VARIANTS = [
  { id: 6,  entity: 'LLC',    ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX06' },
  { id: 7,  entity: 'C-Corp', ownerCount: 2, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX07' },
  { id: 8,  entity: 'LLC',    ownerCount: 4, voting: 'majority',      rofr: true,  drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX08' },
  { id: 9,  entity: 'LLC',    ownerCount: 6, voting: 'unanimous',     rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX09' },
  { id: 10, entity: 'C-Corp', ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX10' },
  // Round 2 — fills matrix gaps (Corp 4o, LLC 5o, LLC super-majority,
  // LLC mixed, single-covenant scenarios, drag/tag toggle).
  { id: 11, entity: 'C-Corp', ownerCount: 4, voting: 'supermajority', rofr: true,  drag: true,  tag: true,  nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX11' },
  { id: 12, entity: 'LLC',    ownerCount: 3, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'No',  label: 'PFX12' },
  { id: 13, entity: 'LLC',    ownerCount: 5, voting: 'supermajority', rofr: true,  drag: true,  tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX13' },
  { id: 14, entity: 'C-Corp', ownerCount: 3, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX14' },
  { id: 15, entity: 'LLC',    ownerCount: 2, voting: 'majority',      rofr: true,  drag: false, tag: true,  nc: 'No',  ns: 'No',  conf: 'Yes', label: 'PFX15' },
  { id: 16, entity: 'C-Corp', ownerCount: 6, voting: 'majority',      rofr: false, drag: true,  tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX16' },
  { id: 17, entity: 'LLC',    ownerCount: 5, voting: 'mixed',         rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX17' },
  { id: 18, entity: 'C-Corp', ownerCount: 3, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX18' },
  { id: 19, entity: 'LLC',    ownerCount: 4, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'Yes', label: 'PFX19' },
  { id: 20, entity: 'C-Corp', ownerCount: 2, voting: 'unanimous',     rofr: true,  drag: true,  tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX20' },
  { id: 21, entity: 'C-Corp', ownerCount: 5, voting: 'supermajority', rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX21' },
  { id: 22, entity: 'LLC',    ownerCount: 6, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX22' },
  { id: 23, entity: 'C-Corp', ownerCount: 4, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'No',  label: 'PFX23' },
  { id: 24, entity: 'LLC',    ownerCount: 1, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX24' },
  { id: 25, entity: 'C-Corp', ownerCount: 2, voting: 'majority',      rofr: true,  drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX25' },
  // Matrix-closing cell — Corp×mixed×6o was the only (entity × voting × owner) combo
  // missing from the catalog after 205 variants of coverage analysis (2026-06-03).
  // Mirrors PFX73 (LLC×mixed×6o full-stack) for cross-entity symmetry.
  { id: 26, entity: 'C-Corp', ownerCount: 6, voting: 'mixed',         rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX26' },
  // Round 10-14 — v51-75 fill remaining cov/voting × owner combos.
  { id: 51, entity: 'LLC',    ownerCount: 1, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'No',  label: 'PFX51' },
  { id: 52, entity: 'LLC',    ownerCount: 1, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'Yes', label: 'PFX52' },
  { id: 53, entity: 'LLC',    ownerCount: 1, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX53' },
  { id: 54, entity: 'LLC',    ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX54' },
  { id: 55, entity: 'C-Corp', ownerCount: 1, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX55' },
  { id: 56, entity: 'C-Corp', ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX56' },
  { id: 57, entity: 'C-Corp', ownerCount: 1, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'No',  label: 'PFX57' },
  { id: 58, entity: 'C-Corp', ownerCount: 1, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'Yes', label: 'PFX58' },
  { id: 59, entity: 'LLC',    ownerCount: 2, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX59' },
  { id: 60, entity: 'LLC',    ownerCount: 2, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX60' },
  { id: 61, entity: 'LLC',    ownerCount: 2, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX61' },
  { id: 62, entity: 'LLC',    ownerCount: 3, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX62' },
  { id: 63, entity: 'LLC',    ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'No',  label: 'PFX63' },
  { id: 64, entity: 'LLC',    ownerCount: 5, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'Yes', label: 'PFX64' },
  { id: 65, entity: 'LLC',    ownerCount: 6, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'No',  conf: 'No',  label: 'PFX65' },
  { id: 66, entity: 'C-Corp', ownerCount: 2, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX66' },
  { id: 67, entity: 'C-Corp', ownerCount: 3, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'No',  label: 'PFX67' },
  { id: 68, entity: 'C-Corp', ownerCount: 4, voting: 'mixed',         rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'Yes', label: 'PFX68' },
  { id: 69, entity: 'C-Corp', ownerCount: 5, voting: 'mixed',         rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX69' },
  { id: 70, entity: 'C-Corp', ownerCount: 6, voting: 'majority',      rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX70' },
  { id: 71, entity: 'LLC',    ownerCount: 4, voting: 'supermajority', rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'No',  label: 'PFX71' },
  { id: 72, entity: 'LLC',    ownerCount: 5, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'Yes', conf: 'Yes', label: 'PFX72' },
  { id: 73, entity: 'LLC',    ownerCount: 6, voting: 'mixed',         rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'No',  label: 'PFX73' },
  { id: 74, entity: 'C-Corp', ownerCount: 2, voting: 'majority',      rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX74' },
  { id: 75, entity: 'LLC',    ownerCount: 3, voting: 'unanimous',     rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX75' },
  // Round 15 — bank='one' single-signer scenarios.
  { id: 76, entity: 'LLC',    ownerCount: 2, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX76', bank: 'one' },
  { id: 77, entity: 'C-Corp', ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX77', bank: 'one' },
  { id: 78, entity: 'LLC',    ownerCount: 4, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX78', bank: 'one' },
  { id: 79, entity: 'C-Corp', ownerCount: 5, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX79', bank: 'one' },
  { id: 80, entity: 'LLC',    ownerCount: 1, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX80', bank: 'one' },
  // Round 16 — distribution frequencies (Anual / Semestral / Discreción).
  { id: 81, entity: 'LLC',    ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX81', distFreq: 'Anual' },
  { id: 82, entity: 'C-Corp', ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX82', distFreq: 'Semestral' },
  { id: 83, entity: 'LLC',    ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX83', distFreq: 'Discreción de la Junta' },
  { id: 84, entity: 'C-Corp', ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX84', distFreq: 'Anual' },
  { id: 85, entity: 'LLC',    ownerCount: 2, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX85', distFreq: 'Semestral' },
  // Round 17 — moreCapital='No' (no additional contributions).
  { id: 86, entity: 'LLC',    ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX86', moreCapital: 'No' },
  { id: 87, entity: 'C-Corp', ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX87', moreCapital: 'No' },
  { id: 88, entity: 'LLC',    ownerCount: 5, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PFX88', moreCapital: 'No' },
  { id: 89, entity: 'C-Corp', ownerCount: 2, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX89', moreCapital: 'No' },
  { id: 90, entity: 'LLC',    ownerCount: 6, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX90', moreCapital: 'No' },
  // Round 18 — loans=false (no shareholder loans).
  { id: 91, entity: 'LLC',    ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX91', loans: false },
  { id: 92, entity: 'C-Corp', ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX92', loans: false },
  { id: 93, entity: 'LLC',    ownerCount: 2, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX93', loans: false },
  { id: 94, entity: 'C-Corp', ownerCount: 5, voting: 'unanimous',     rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX94', loans: false },
  { id: 95, entity: 'LLC',    ownerCount: 6, voting: 'supermajority', rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX95', loans: false },
  // Round 19 — combo: incapacityHeirs=false / divorceBuyout=false / transferToRelatives variations (Corp).
  { id: 96, entity: 'C-Corp', ownerCount: 3, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX96', incapacityHeirs: false, divorceBuyout: false },
  { id: 97, entity: 'C-Corp', ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX97', transferToRelatives: 'unanimous' },
  { id: 98, entity: 'C-Corp', ownerCount: 5, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX98', transferToRelatives: 'majority' },
  { id: 99, entity: 'LLC',    ownerCount: 4, voting: 'majority',      rofr: false, drag: false, tag: false, nc: 'No',  ns: 'No',  conf: 'No',  label: 'PFX99', incapacityHeirs: false },
  // Stack-everything corner case: bank=one + distFreq=Anual + moreCapital=No + loans=false + incap+divorce=No
  { id: 100, entity: 'C-Corp', ownerCount: 3, voting: 'majority',     rofr: true,  drag: true,  tag: true,  nc: 'Yes', ns: 'Yes', conf: 'Yes', label: 'PF100', bank: 'one', distFreq: 'Anual', moreCapital: 'No', loans: false, incapacityHeirs: false, divorceBuyout: false, transferToRelatives: 'unanimous' },
];

// v101-200 — programmatic spread across remaining matrix gaps using a
// reproducible LCG so each run pick is deterministic but covers all
// dimensions. Each combo is sampled at most once across v1-200.
// ── Deterministic PRNG (mulberry32) so weighted samples remain
// reproducible per variant id. Same id → same config.
function variantRng(id) {
  let s = (id ^ 0x9E3779B9) >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedPick(rand, pairs) {
  // pairs: [[value, weight], …]; weights need not sum to 1.
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rand() * total;
  for (const [val, w] of pairs) {
    r -= w;
    if (r <= 0) return val;
  }
  return pairs[pairs.length - 1][0];
}

function generateMoreVariants() {
  const votings = ['majority', 'unanimous', 'supermajority', 'mixed'];
  const cov8 = [
    ['No','No','No'],['No','No','Yes'],['No','Yes','No'],['No','Yes','Yes'],
    ['Yes','No','No'],['Yes','No','Yes'],['Yes','Yes','No'],['Yes','Yes','Yes'],
  ];
  const banks = ['two','one'];
  const dists = ['Trimestral','Anual','Semestral','Discreción de la Junta'];
  const moreCaps = ['Pro-Rata','No'];
  const out = [];
  let id = 101;
  for (let i = 0; i < 400; i++) {
    const rand = variantRng(id);

    // ── Lever 1: weighted owner count matching real-world distribution.
    // ~80% of US small businesses have 1-3 owners; 4-6 are edge cases.
    const own = weightedPick(rand, [
      [1, 30], [2, 30], [3, 20], [4, 10], [5, 5], [6, 5],
    ]);

    // ── Lever 2: weighted entity. Real-world LLCs ~3:1 vs Corps for
    // small businesses; keep close to 50/50 here so we still exercise
    // the Corp pipeline thoroughly.
    const entity = weightedPick(rand, [['LLC', 55], ['C-Corp', 45]]);
    const isCorp = entity === 'C-Corp';

    // Voting / covenants / RoFR / drag-tag distributions stay roughly
    // even because each is meaningful to test on its own merits.
    const voting = weightedPick(rand, [
      ['majority', 40], ['unanimous', 25], ['supermajority', 20], ['mixed', 15],
    ]);
    const [nc, ns, conf] = cov8[Math.floor(rand() * 8)];
    const rofr = rand() < 0.55;
    const dragTag = rand() < 0.45;
    const bank = banks[Math.floor(rand() * 2)];
    const distFreq = dists[Math.floor(rand() * 4)];
    const moreCapital = moreCaps[Math.floor(rand() * 2)];
    const loans = rand() < 0.7;
    const incapacityHeirs = rand() < 0.7;
    const divorceBuyout = rand() < 0.75;

    // ── Lever 3a: Corp directors decoupled from owners.
    // Realistic small-Corp board shapes:
    //   - "all-owners" (default) for 1-2 owner founder Corps
    //   - 1-director boards (sole-director Corp) for solo founders + minority co-owners
    //   - small boards larger than owner set (outside board members / VC seats)
    let directorsAllOwners = 'Yes';
    let directorsCount;
    if (isCorp) {
      const mode = weightedPick(rand, [
        ['allOwners', 50],      // ≈ current behavior
        ['soleDirector', 25],   // 1-director regardless of owner count
        ['extraDirectors', 15], // owners + 1 outside director
        ['twoDirectors', 10],   // exactly 2 (common for couples, family biz)
      ]);
      if (mode === 'allOwners') {
        directorsAllOwners = 'Yes';
      } else if (mode === 'soleDirector') {
        directorsAllOwners = 'No';
        directorsCount = 1;
      } else if (mode === 'twoDirectors') {
        directorsAllOwners = 'No';
        directorsCount = 2;
      } else {
        directorsAllOwners = 'No';
        directorsCount = Math.min(own + 1, 7);
      }
    }

    // ── Lever 3b: Corp officer-role overlap.
    // Real small Corps often have 1 founder wearing multiple hats.
    // officersAllOwners='No' with officersCount < 4 lets us test the
    // role-duplication path; officersCount=4 + officersAllOwners='No'
    // exercises the "all 4 distinct people, none of whom are owners"
    // path (Corp w/ external management team).
    let officersAllOwners = 'Yes';
    let officersCount;
    if (isCorp) {
      const oMode = weightedPick(rand, [
        ['allOwners', 50],            // owners hold officer roles 1:1
        ['singleFounder', 20],        // 1 person = all officer slots (overlap)
        ['twoOfficers', 15],          // 2 officers (Pres + Treas typical)
        ['externalTeam', 15],         // 4 distinct non-owner officers
      ]);
      if (oMode === 'allOwners') {
        officersAllOwners = 'Yes';
      } else if (oMode === 'singleFounder') {
        officersAllOwners = 'No';
        officersCount = 1;
      } else if (oMode === 'twoOfficers') {
        officersAllOwners = 'No';
        officersCount = 2;
      } else {
        officersAllOwners = 'No';
        officersCount = 4;
      }
    }

    // ── Lever 3c: LLC management type.
    // ~70% of real US LLCs are member-managed (managersAllOwners='Yes');
    // the rest designate 1-2 managers — sometimes outside hires.
    let managersAllOwners = 'Yes';
    let managersCount;
    if (!isCorp) {
      const mMode = weightedPick(rand, [
        ['memberManaged', 70],   // every member is also a manager
        ['singleManager', 18],   // 1 designated manager
        ['twoManagers', 12],     // 2 designated managers
      ]);
      if (mMode === 'memberManaged') {
        managersAllOwners = 'Yes';
      } else if (mMode === 'singleManager') {
        managersAllOwners = 'No';
        managersCount = 1;
      } else {
        managersAllOwners = 'No';
        managersCount = 2;
      }
    }

    out.push({
      id, entity, ownerCount: own, voting,
      rofr, drag: dragTag, tag: dragTag,
      nc, ns, conf,
      bank, distFreq, moreCapital, loans, incapacityHeirs, divorceBuyout,
      directorsAllOwners, directorsCount,
      officersAllOwners, officersCount,
      managersAllOwners, managersCount,
      label: `PF${String(id).padStart(3, '0')}`,
    });
    id += 1;
  }
  return out;
}
VARIANTS.push(...generateMoreVariants());

function emailFor(v) { return `trimaran.llc+pfx${v.id}${RUN_TAG}@gmail.com`; }
function companyNameFor(v) {
  const suffix = v.entity === 'C-Corp' ? 'Corp' : 'LLC';
  return `${v.label} ${suffix}`;
}

function makeAgreementData(v) {
  const isCorp = v.entity === 'C-Corp';
  const p = votingProfile(v.voting);
  // Optional per-variant overrides, defaults preserve original behavior.
  const bank = v.bank || 'two'; // 'one' | 'two'
  const distFreq = v.distFreq || 'Trimestral'; // Trimestral | Anual | Semestral | Discreción de la Junta
  const moreCapital = v.moreCapital || 'Pro-Rata'; // 'Pro-Rata' | 'No'
  const loans = v.loans !== undefined ? v.loans : true;
  const incapacityHeirs = v.incapacityHeirs !== undefined ? v.incapacityHeirs : true;
  const divorceBuyout = v.divorceBuyout !== undefined ? v.divorceBuyout : true;
  const transferToRelatives = v.transferToRelatives || 'free'; // 'free' | 'unanimous' | 'majority'
  const a = {
    wants: 'Yes',
    majorityThreshold: 50.01,
    supermajorityThreshold: 75,
    distributionFrequency: distFreq,
  };
  const MORE_CAPITAL = moreCapital === 'No' ? 'No' : 'Sí, Pro-Rata';
  const TRANSFER_OPTS = {
    free:      'Sí, podrán transferir libremente sus acciones.',
    unanimous: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
    majority:  'Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.',
  };
  if (isCorp) {
    Object.assign(a, {
      corp_saleDecisionThreshold: p.sale,
      corp_bankSigners: bank === 'one' ? 'Un firmante' : 'Dos firmantes',
      corp_majorDecisionThreshold: p.major,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: p.removal,
      corp_nonCompete: v.nc,
      corp_nonSolicitation: v.ns,
      corp_confidentiality: v.conf,
      corp_taxOwner: NAMES[0],
      corp_rofr: v.rofr ? 'Yes' : 'No',
      corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: TRANSFER_OPTS[transferToRelatives],
      corp_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      corp_divorceBuyoutPolicy: divorceBuyout ? 'Yes' : 'No',
      corp_tagDragRights: (v.drag || v.tag) ? 'Yes' : 'No',
      corp_newShareholdersAdmission: p.newMember,
      corp_moreCapitalProcess: MORE_CAPITAL,
      corp_moreCapitalDecision: p.capital,
      corp_shareholderLoans: loans ? 'Yes' : 'No',
      corp_shareholderLoansVoting: p.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) a[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(a, {
      llc_companySaleDecision: p.sale,
      llc_bankSigners: bank === 'one' ? 'Un firmante' : 'Dos firmantes',
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
      // Harness gap fixed 2026-05-20: the LLC branch never set
      // llc_tagDragRights, so every LLC variant rendered with no drag/tag
      // regardless of v.drag/v.tag — the UAT never actually exercised LLC
      // drag/tag (product is correctly wired). Mirror the Corp field.
      llc_tagDragRights: (v.drag || v.tag) ? 'Yes' : 'No',
      llc_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      // Harness gap fixed 2026-05-30: the LLC branch was missing the divorce
      // field, so every LLC e2e UAT ran with divorce=No regardless of the
      // per-variant rand draw. The Corp branch (above) had it; mirror it here.
      // Surfaced during PFX17 page-by-page review.
      llc_divorceBuyoutPolicy: divorceBuyout ? 'Yes' : 'No',
      llc_dissolutionDecision: p.dissolution,
      llc_newMembersAdmission: p.newMember,
      llc_newPartnersAdmission: p.newMember,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: MORE_CAPITAL,
      llc_additionalContributionsDecision: p.capital,
      llc_memberLoans: loans ? 'Yes' : 'No',
      llc_memberLoansVoting: p.loans,
    });
    for (let i = 0; i < v.ownerCount; i++) a[`llc_capitalContributions_${i}`] = '50000';
  }
  return a;
}

function makeAdminData(v) {
  const isCorp = v.entity === 'C-Corp';

  if (!isCorp) {
    // LLC: managersAllOwners='Yes' uses the owner roster; 'No' designates
    // 1-2 outside managers from NON_OWNER_NAMES.
    const managersAllOwners = v.managersAllOwners || 'Yes';
    if (managersAllOwners === 'Yes') {
      return { managersAllOwners: 'Yes' };
    }
    const managersCount = v.managersCount || 1;
    const out = { managersAllOwners: 'No', managersCount };
    for (let i = 0; i < managersCount; i++) {
      const { firstName, lastName, fullName } = splitName(NON_OWNER_NAMES[i]);
      out[`manager${i + 1}FirstName`] = firstName;
      out[`manager${i + 1}LastName`] = lastName;
      out[`manager${i + 1}Name`] = fullName;
    }
    return out;
  }

  // ── Corp branch — directors + officers each have three modes.
  const out = {};

  // Directors
  const directorsAllOwners = v.directorsAllOwners || 'Yes';
  out.directorsAllOwners = directorsAllOwners;
  if (directorsAllOwners === 'No') {
    const directorsCount = v.directorsCount || 1;
    out.directorsCount = directorsCount;
    for (let i = 0; i < directorsCount; i++) {
      // For "extraDirectors" we keep the owners in the slate and add a
      // non-owner at the end. For "soleDirector"/"twoDirectors" we use
      // non-owner names to make it visually distinct from owners.
      const useOwnerName = directorsCount > v.ownerCount && i < v.ownerCount;
      const name = useOwnerName ? NAMES[i] : NON_OWNER_NAMES[i % NON_OWNER_NAMES.length];
      const { firstName, lastName, fullName } = splitName(name);
      out[`director${i + 1}FirstName`] = firstName;
      out[`director${i + 1}LastName`] = lastName;
      out[`director${i + 1}Name`] = fullName;
    }
  }

  // Officers
  const officersAllOwners = v.officersAllOwners || 'Yes';
  out.officersAllOwners = officersAllOwners;
  if (officersAllOwners === 'Yes') {
    // Map first N OFFICER_ROLES to the first N owners; rest stay blank.
    OFFICER_ROLES.slice(0, v.ownerCount).forEach((role, i) => {
      out[`shareholderOfficer${i + 1}Role`] = role;
    });
  } else {
    const officersCount = v.officersCount || 1;
    out.officersCount = officersCount;
    // If officersCount === 1, that single officer holds the President
    // role; for officersCount=2 give Pres + Treasurer; for officersCount=4
    // assign one of each canonical role to a distinct non-owner.
    const rolesForCount = {
      1: ['President'],
      2: ['President', 'Treasurer'],
      4: ['President', 'Vice-President', 'Secretary', 'Treasurer'],
    };
    const roles = rolesForCount[officersCount] || OFFICER_ROLES.slice(0, officersCount);
    for (let i = 0; i < officersCount; i++) {
      const name = NON_OWNER_NAMES[i % NON_OWNER_NAMES.length];
      const { firstName, lastName, fullName } = splitName(name);
      out[`officer${i + 1}FirstName`] = firstName;
      out[`officer${i + 1}LastName`] = lastName;
      out[`officer${i + 1}Name`] = fullName;
      out[`officer${i + 1}Role`] = roles[i] || OFFICER_ROLES[i % OFFICER_ROLES.length];
    }
  }

  return out;
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

// ─── Real-UI Step 5 Admin fill ───────────────────────────────────────
// The Step 5 manager/director/officer NAME fields are dynamic-array
// fields that only get `register()`-ed when the user toggles "No" on the
// corresponding "all owners" SegmentedToggle. Pure setValue injection
// from Step 3 fails because (a) the fields aren't registered yet, and
// (b) the toggle's onChange handler runs a useEffect that CLEARS any
// names we just injected. Real-UI clicks the toggle, lets the form
// re-render the inputs (which registers them), then fills the names.
async function fillStep5Admin(page, v, log) {
  const isCorp = v.entity === 'C-Corp';
  const needsRealUI =
    (isCorp && (v.directorsAllOwners === 'No' || v.officersAllOwners === 'No')) ||
    (!isCorp && v.managersAllOwners === 'No');
  if (!needsRealUI) {
    log('Step 5 Admin: defaults are "all owners" — no real-UI fill needed');
    return false;
  }

  // Jump directly to Admin step using the page's native authCallbackUrl
  // mechanism (page.tsx:123-145). Setting localStorage.authCallbackUrl
  // and reloading triggers the post-signup useEffect which calls
  // setStep(3) without going through Continuar's validation.
  log('Step 5 Admin: jumping to step 3 via authCallbackUrl + reload');
  await page.evaluate(() => {
    localStorage.setItem('authCallbackUrl', `/?action=continue&step=3`);
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);
  await shot(page, `v${v.id}_step5_landed`);

  // Re-inject form values so the admin step has owner data to work with.
  // (Reload may have wiped some in-memory state; localStorage drafts
  // restore most fields, but defensive re-injection is cheap.)
  const ownersForReinject = ownerArray(v.ownerCount);
  await injectFormFields(page, {
    ownersCount: v.ownerCount,
    owners: Object.fromEntries(ownersForReinject.map((o, i) => [String(i), {
      fullName: o.fullName, firstName: o.firstName, lastName: o.lastName,
      ownership: o.ownership, ownershipPercentage: o.ownership,
    }])),
    company: { entityType: v.entity === 'C-Corp' ? 'C-Corp' : 'LLC' },
  });
  await page.waitForTimeout(800);

  async function clickToggleNo(ariaLabel, label) {
    const sel = `[role="radiogroup"][aria-label="${ariaLabel}"] button[aria-label="No"]`;
    try {
      await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5000 });
      await page.locator(sel).first().click();
      await page.waitForTimeout(900);
      return true;
    } catch {
      log(`  WARN: ${label} SegmentedToggle ("${ariaLabel}") not found`);
      return false;
    }
  }

  async function fillCountThenWaitForRows(countName, count, rowSelectorTemplate) {
    await setReactInput(page, `input[name="${countName}"]`, count);
    // Wait for the LAST row's FirstName input to render so we know all are
    // registered with react-hook-form before we set values.
    const lastInputSel = rowSelectorTemplate.replace('{i}', String(count));
    try {
      await page.locator(lastInputSel).waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      log(`  WARN: row inputs did not render for ${countName}=${count}`);
    }
    await page.waitForTimeout(400);
  }

  if (!isCorp) {
    log(`Step 5: LLC managersAllOwners=${v.managersAllOwners} count=${v.managersCount}`);
    await clickToggleNo('Socios son gerentes', 'managers');
    await fillCountThenWaitForRows(
      'admin.managersCount', v.managersCount,
      'input[name="admin.manager{i}FirstName"]'
    );
    for (let i = 0; i < v.managersCount; i++) {
      const { firstName, lastName } = splitName(NON_OWNER_NAMES[i]);
      await setReactInput(page, `input[name="admin.manager${i + 1}FirstName"]`, firstName);
      await setReactInput(page, `input[name="admin.manager${i + 1}LastName"]`, lastName);
    }
  } else {
    // Corp directors
    if (v.directorsAllOwners === 'No') {
      log(`Step 5: Corp directorsAllOwners=No count=${v.directorsCount}`);
      await clickToggleNo('Accionistas serán directores', 'directors');
      await fillCountThenWaitForRows(
        'admin.directorsCount', v.directorsCount,
        'input[name="admin.director{i}FirstName"]'
      );
      for (let i = 0; i < v.directorsCount; i++) {
        const useOwnerName =
          v.directorsCount > v.ownerCount && i < v.ownerCount;
        const full = useOwnerName ? NAMES[i] : NON_OWNER_NAMES[i % NON_OWNER_NAMES.length];
        const { firstName, lastName } = splitName(full);
        await setReactInput(page, `input[name="admin.director${i + 1}FirstName"]`, firstName);
        await setReactInput(page, `input[name="admin.director${i + 1}LastName"]`, lastName);
      }
    }

    if (v.officersAllOwners === 'No') {
      log(`Step 5: Corp officersAllOwners=No count=${v.officersCount}`);
      await clickToggleNo('Accionistas serán oficiales', 'officers');
      await fillCountThenWaitForRows(
        'admin.officersCount', v.officersCount,
        'input[name="admin.officer{i}FirstName"]'
      );
      const rolesForCount = {
        1: ['President'],
        2: ['President', 'Treasurer'],
        4: ['President', 'Vice-President', 'Secretary', 'Treasurer'],
      };
      const roles =
        rolesForCount[v.officersCount] || OFFICER_ROLES.slice(0, v.officersCount);
      for (let i = 0; i < v.officersCount; i++) {
        const { firstName, lastName } = splitName(
          NON_OWNER_NAMES[i % NON_OWNER_NAMES.length]
        );
        await setReactInput(page, `input[name="admin.officer${i + 1}FirstName"]`, firstName);
        await setReactInput(page, `input[name="admin.officer${i + 1}LastName"]`, lastName);
        const roleSel = page.locator(`select[name="admin.officer${i + 1}Role"]`);
        if (await roleSel.count() > 0) {
          await roleSel.selectOption(roles[i]);
          await page.waitForTimeout(300);
        }
      }
    } else {
      log('Step 5: Corp officersAllOwners=Yes — assigning shareholder roles');
      const rolesToAssign = OFFICER_ROLES.slice(0, Math.min(v.ownerCount, 4));
      for (let i = 0; i < rolesToAssign.length; i++) {
        const roleSel = page.locator(`select[name="admin.shareholderOfficer${i + 1}Role"]`);
        if (await roleSel.count() > 0) {
          await roleSel.selectOption(rolesToAssign[i]);
          await page.waitForTimeout(300);
        }
      }
    }
  }
  await page.waitForTimeout(1000);
  await shot(page, `v${v.id}_step5_filled`);
  return true;
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
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    // Record a video of the whole front-end run when E2E_VIDEO_DIR is set (UAT evidence).
    ...(process.env.E2E_VIDEO_DIR
      ? { recordVideo: { dir: process.env.E2E_VIDEO_DIR, size: { width: 1400, height: 900 } } }
      : {}),
  });
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

    // ─── Real-UI Step 5 Admin (only when defaults are overridden) ───
    // Steps 4/5 are skipped via setValue for the "all owners" default,
    // but when a variant uses dynamic-array fields (managersAllOwners=No,
    // directorsAllOwners=No, officersAllOwners=No) those fields are only
    // `register()`-ed by the UI after the toggle flip. setValue from
    // Step 3 silently no-ops on un-registered fields, plus the toggle's
    // own useEffect clears any names we inject. Real-UI it is.
    await fillStep5Admin(page, v, log);

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
    const checkout = await page.evaluate(async ({ entity, forwardPhone }) => {
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
      // Debug: log admin slice to console (visible in test log)
      console.log('CHECKOUT_FD_ADMIN:', JSON.stringify(fd?.admin || {}));
      const svc = entity === 'C-Corp' ? ['formation', 'shareholder_agreement'] : ['formation', 'operating_agreement'];
      // Opt-in real Twilio number: when UAT_FORWARD_PHONE_E164 is set, request a
      // business phone and supply the forward-to number so the webhook provisions
      // a REAL US number. Unset → behaves exactly as before (no phone).
      if (forwardPhone) {
        fd = fd || {};
        fd.company = fd.company || {};
        fd.company.forwardPhoneE164 = forwardPhone;
        if (!svc.includes('business_phone')) svc.push('business_phone');
      }
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: fd, selectedServices: svc, entityType: entity, state: 'Florida',
          hasUsAddress: 'No', hasUsPhone: 'No', skipAgreement: 'false', totalPrice: 79500,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      return { status: resp.status, url: json.paymentLinkUrl || json.url || json.checkoutUrl };
    }, { entity: v.entity, forwardPhone: process.env.UAT_FORWARD_PHONE_E164 || '' });
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

// Run main() only when invoked directly (not when imported by audit script).
import { fileURLToPath } from 'url';
const __isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (__isMain) main().catch(e => { console.error('FATAL:', e); process.exit(2); });
