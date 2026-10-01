/* Answer model for agreement QA.
 *
 * One `Case` = one questionnaire submission. It is turned into the exact form
 * payload the web app posts (toPayload) and run through the production
 * transform (mapFormToDocgenAnswers -> generateDocument).
 *
 * Weights reflect how clients actually answer (set 2026-10-01; no real paid
 * clients exist yet, so these are the business owner's estimates):
 *   LLC 50 / Corp 50 · owners mostly 1-3 · at most one owner has an SSN ·
 *   holding companies as owners are rare · spending threshold almost always
 *   $10,000 · percentages are standard splits (decimals tested once).
 * Rare values are still exercised by the pairwise layer (pairwise.ts).
 *
 * Option strings are the literal values the form sends (Step*.tsx) — never
 * paraphrases — so the mapper is tested against what production receives.
 */
import * as fs from "fs";

export type Entity = "LLC" | "C-Corp" | "S-Corp";
export const VOTE = { majority: "Mayoría", supermajority: "Supermayoría", unanimous: "Decisión Unánime" } as const;
export type VoteKey = keyof typeof VOTE;

export const LLC_XFER = {
  free: "Sí, podrán transferir libremente.",
  majority: "Sí, si la decisión de la mayoría de los socios.",
  unanimous: "Sí, si la decisión de los socios es unánime.",
} as const;
export const CORP_XFER = {
  free: "Sí, podrán transferir libremente sus acciones.",
  majority: "Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.",
  unanimous: "Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.",
} as const;
export type Xfer = keyof typeof LLC_XFER;

export const LLC_VOTE_KEYS = [
  "llc_newMembersAdmission", "llc_additionalContributionsDecision", "llc_memberLoansVoting",
  "llc_companySaleDecision", "llc_majorDecisions", "llc_minorDecisions",
  "llc_officerRemovalVoting", "llc_dissolutionDecision",
] as const;
export const CORP_VOTE_KEYS = [
  "corp_newShareholdersAdmission", "corp_moreCapitalDecision", "corp_shareholderLoansVoting",
  "corp_saleDecisionThreshold", "corp_majorDecisionThreshold", "corp_officerRemovalVoting",
] as const;

export interface Owner {
  first: string; last: string; pct: number; capital: number;
  type: "persona" | "empresa"; usCitizen: boolean; companyName?: string;
}

export interface Case {
  id: string;
  layer: string;
  entity: Entity;
  companyBase: string;
  owners: Owner[];
  votes: Record<string, VoteKey>;          // per vote key
  rofr: boolean; rofrDays: number;
  dragTag: boolean;
  nonCompete: boolean; ncYears: number; ncScope: string;
  nonSolicitation: boolean;
  heirsForced: boolean;
  divorce: boolean;
  xfer: Xfer;
  bankTwoSigners: boolean;
  loans: boolean;
  proRata: boolean;
  managingMembers: boolean;          // LLC
  specificRoles: boolean;            // LLC (Corp: specific responsibilities)
  distribution: string;
  spending: number;
  taxPartnerIdx: number;             // which owner is tax partner (LLC) / tax owner (Corp)
  majority: number; supermajority: number;
}

// ── deterministic RNG ──────────────────────────────────────────────────
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, items: readonly T[], weights?: readonly number[]): T => {
  if (!weights) return items[Math.floor(r() * items.length)];
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
  return items[items.length - 1];
};
const yes = (r: () => number, p = 0.5) => r() < p;

// ── realistic data pools ───────────────────────────────────────────────
const FIRST = ["José", "María", "Juan Carlos", "Ana Sofía", "Luis", "Gabriela", "Andrés", "Valentina", "Diego", "Camila", "Fernando", "Lucía"];
const LAST = ["González", "Rodríguez", "Pérez", "Martínez", "Sánchez", "Ramírez", "Torres", "Núñez", "Ibáñez", "De la Cruz", "Muñoz-Rivera", "O'Connor"];
const COMPANY = ["PIRAGUA", "SOL & MAR", "INVERSIONES ANDINAS", "CAFÉ DEL VALLE", "GRUPO NORTE 21", "BLUE HORIZON HOLDINGS", "LA ESQUINA", "TECH LATAM SOLUTIONS"];
const HOLDING = ["Inversiones Pacífico S.A.", "Grupo Alfa Holdings Ltd.", "Desarrollos Ñandú S.A.S."];
const SCOPES = ["Estado de Florida", "Miami-Dade County, Florida", "the State of Florida", "United States"];

// Standard splits; one decimal case ([33.33, 33.33, 33.34]) is enough to prove decimals render.
export const SPLITS: Record<number, number[][]> = {
  1: [[100]],
  2: [[50, 50], [60, 40], [70, 30], [51, 49], [80, 20]],
  3: [[34, 33, 33], [50, 25, 25], [40, 30, 30], [60, 20, 20], [33.33, 33.33, 33.34]],
  4: [[25, 25, 25, 25], [40, 30, 20, 10]],
  5: [[20, 20, 20, 20, 20], [30, 25, 20, 15, 10]],
  6: [[30, 25, 15, 12, 10, 8], [20, 20, 15, 15, 15, 15]],
};
const SPLIT_W: Record<number, number[]> = { 1: [1], 2: [40, 25, 15, 10, 10], 3: [30, 30, 15, 15, 10], 4: [1, 1], 5: [1, 1], 6: [1, 1] };

export function makeOwners(r: () => number, n: number, split: number[], opts: { holdingP?: number; ssnP?: number } = {}): Owner[] {
  const ssnIdx = yes(r, opts.ssnP ?? 0.35) ? Math.floor(r() * n) : -1; // at most ONE owner with SSN
  const used = new Set<string>();
  return split.map((pct, i) => {
    let first = "", last = "";
    do { first = pick(r, FIRST); last = pick(r, LAST); } while (used.has(first + last));
    used.add(first + last);
    const holding = yes(r, opts.holdingP ?? 0.05) && HOLDING.some((h) => !used.has(h));
    return {
      first, last, pct, capital: pick(r, [1000, 5000, 10000, 25000, 50000], [2, 3, 4, 2, 1]) * (i + 1),
      type: holding ? "empresa" : "persona",
      usCitizen: !holding && i === ssnIdx,
      companyName: holding ? (() => { let h = ""; do { h = pick(r, HOLDING); } while (used.has(h)); used.add(h); return h; })() : undefined,
    };
  });
}

/** Layer 2: draw one realistic submission. */
export function sampleRealistic(r: () => number, i: number): Case {
  const entity: Entity = pick(r, ["LLC", "C-Corp"] as const, [50, 50]);
  const n = pick(r, [1, 2, 3, 4, 5, 6], [35, 40, 20, 2, 2, 1]);
  const split = pick(r, SPLITS[n], SPLIT_W[n]);
  const owners = makeOwners(r, n, split);
  const keys = entity === "LLC" ? LLC_VOTE_KEYS : CORP_VOTE_KEYS;
  const uniform = yes(r, 0.6);
  const profile = pick(r, ["majority", "unanimous", "supermajority"] as const, [45, 35, 20]);
  const votes: Record<string, VoteKey> = {};
  for (const k of keys) votes[k] = uniform ? profile : pick(r, ["majority", "unanimous", "supermajority"] as const, [45, 35, 20]);
  const nc = yes(r);
  return {
    id: `R${String(i).padStart(4, "0")}`, layer: "realistic", entity,
    companyBase: pick(r, COMPANY), owners, votes,
    rofr: yes(r), rofrDays: pick(r, [30, 60, 90], [2, 1, 1]),
    dragTag: yes(r, 0.4), nonCompete: nc, ncYears: pick(r, [1, 2, 3], [1, 3, 1]), ncScope: pick(r, SCOPES, [4, 2, 2, 1]),
    nonSolicitation: nc ? false : yes(r), heirsForced: yes(r), divorce: yes(r),
    xfer: pick(r, ["free", "majority", "unanimous"] as const, [2, 1, 2]),
    bankTwoSigners: n > 1 && yes(r, 0.7), loans: yes(r, 0.4), proRata: yes(r, 0.7),
    managingMembers: yes(r, 0.85), specificRoles: yes(r, 0.15),
    distribution: pick(r, ["Trimestral", "Anual", "Semestral"], [3, 2, 1]),
    spending: yes(r, 0.9) ? 10000 : pick(r, [5000, 25000]),
    taxPartnerIdx: Math.floor(r() * n),
    majority: 50.01, supermajority: 75,
  };
}

// ── payload ────────────────────────────────────────────────────────────
const LLC_BASE = JSON.parse(fs.readFileSync("scripts/fixtures/llc-base.payload.json", "utf8"));
const CORP_BASE = JSON.parse(fs.readFileSync("scripts/fixtures/corp-base.payload.json", "utf8"));
const OFFICERS = ["President", "Vice-President", "Secretary", "Treasurer", "Assistant Vice-President", "Assistant Secretary"];

export const ownerName = (o: Owner) => o.type === "empresa" ? o.companyName! : `${o.first} ${o.last}`;

/** Exact payload shape the questionnaire submits. Every agreement key is set
 *  explicitly so no fixture default (e.g. the fixture's tax partner) leaks in. */
export function toPayload(c: Case): any {
  const isCorp = c.entity !== "LLC";
  const d = JSON.parse(JSON.stringify(isCorp ? CORP_BASE : LLC_BASE));
  d.company = {
    ...d.company, entityType: c.entity, formationState: "Florida",
    companyNameBase: c.companyBase, entitySuffix: isCorp ? "Corp" : "LLC",
    companyName: `${c.companyBase} ${isCorp ? "Corp" : "LLC"}`,
    businessPurpose: "Distribución de productos", hasUsaAddress: "No", hasUsPhone: "No",
  };
  d.owners = c.owners.map((o) => ({
    ownerType: o.type,
    ...(o.type === "empresa" ? { companyName: o.companyName, fullName: o.companyName } : { firstName: o.first, lastName: o.last, fullName: `${o.first} ${o.last}` }),
    ownership: o.pct, ownershipPercentage: o.pct,
    isUsCitizen: o.usCitizen ? "Yes" : "No",
    ...(o.usCitizen ? { tin: "123456789" } : {}),
  }));
  d.ownersCount = c.owners.length;
  const a: any = { wants: "Yes", majorityThreshold: c.majority, supermajorityThreshold: c.supermajority, distributionFrequency: c.distribution };
  for (const [k, v] of Object.entries(c.votes)) a[k] = VOTE[v];
  const p = isCorp ? "corp_" : "llc_";
  a[`${p}rofr`] = c.rofr ? "Yes" : "No"; a[`${p}rofrOfferPeriod`] = c.rofrDays;
  a[`${p}tagDragRights`] = c.dragTag ? "Yes" : "No";
  a[`${p}nonCompete`] = c.nonCompete ? "Yes" : "No";
  if (c.nonCompete) { a[`${p}nonCompeteDuration`] = c.ncYears; a[`${p}nonCompeteScope`] = c.ncScope; }
  a[`${p}nonSolicitation`] = c.nonSolicitation ? "Yes" : "No";
  a[`${p}heirsForcedToSell`] = c.heirsForced ? "Yes" : "No";
  a[`${p}divorceBuyoutPolicy`] = c.divorce ? "Yes" : "No";
  a[`${p}transferToRelatives`] = (isCorp ? CORP_XFER : LLC_XFER)[c.xfer];
  a[`${p}bankSigners`] = c.bankTwoSigners ? "Dos firmantes" : "Un firmante";
  a[`${p}majorSpendingThreshold`] = String(c.spending);
  if (isCorp) {
    a.corp_shareholderLoans = c.loans ? "Yes" : "No";
    a.corp_moreCapitalProcess = c.proRata ? "Sí, Pro-Rata" : "No";
    a.corp_hasSpecificResponsibilities = c.specificRoles ? "Yes" : "No";
    a.corp_taxOwner = ownerName(c.owners[c.taxPartnerIdx]);
    c.owners.forEach((o, k) => (a[`corp_capitalPerOwner_${k}`] = String(o.capital)));
    d.admin = { officersAllOwners: "Yes", directorsAllOwners: "Yes" };
    c.owners.forEach((_, k) => (d.admin[`shareholderOfficer${k + 1}Role`] = OFFICERS[k]));
  } else {
    a.llc_memberLoans = c.loans ? "Yes" : "No";
    a.llc_additionalContributions = c.proRata ? "Sí, Pro-Rata" : "No";
    a.llc_managingMembers = c.managingMembers ? "Yes" : "No";
    a.llc_hasSpecificRoles = c.specificRoles ? "Yes" : "No";
    a.llc_taxPartner = ownerName(c.owners[c.taxPartnerIdx]);
    c.owners.forEach((o, k) => (a[`llc_capitalContributions_${k}`] = String(o.capital)));
    d.admin = { managersAllOwners: "Yes" };
  }
  d.agreement = a;
  return d;
}
