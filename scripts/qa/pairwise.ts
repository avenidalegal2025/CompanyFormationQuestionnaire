/* Layer 3: pairwise (all-pairs) coverage.
 *
 * Greedy covering array: every value of every question appears together with
 * every value of every other question in at least one case. Rare values the
 * realistic layer almost never draws (S-Corp, 6 owners, holding-company
 * owner, unusual threshold) are guaranteed a floor of coverage here.
 */
import { Case, Entity, VoteKey, LLC_VOTE_KEYS, CORP_VOTE_KEYS, SPLITS, makeOwners, rng, Xfer } from "./model.js";

type Param = { name: string; values: readonly (string | number | boolean)[] };

function coveringArray(params: Param[], r: () => number): Record<string, any>[] {
  const uncovered = new Set<string>();
  const key = (i: number, a: any, j: number, b: any) => `${i}=${a}|${j}=${b}`;
  for (let i = 0; i < params.length; i++)
    for (let j = i + 1; j < params.length; j++)
      for (const a of params[i].values) for (const b of params[j].values) uncovered.add(key(i, a, j, b));
  const rows: any[][] = [];
  while (uncovered.size) {
    // Start from an uncovered pair, then fill remaining params greedily.
    const [first] = uncovered;
    const m = /^(\d+)=(.*)\|(\d+)=(.*)$/.exec(first)!;
    const row: any[] = new Array(params.length).fill(undefined);
    const parse = (idx: number, s: string) => params[idx].values.find((v) => String(v) === s);
    row[+m[1]] = parse(+m[1], m[2]); row[+m[3]] = parse(+m[3], m[4]);
    const order = params.map((_, i) => i).filter((i) => row[i] === undefined).sort(() => r() - 0.5);
    for (const i of order) {
      let best: any = params[i].values[0], bestGain = -1;
      for (const v of params[i].values) {
        let gain = 0;
        for (let j = 0; j < params.length; j++) {
          if (j === i || row[j] === undefined) continue;
          const k = i < j ? key(i, v, j, row[j]) : key(j, row[j], i, v);
          if (uncovered.has(k)) gain++;
        }
        if (gain > bestGain || (gain === bestGain && r() < 0.3)) { best = v; bestGain = gain; }
      }
      row[i] = best;
    }
    for (let i = 0; i < params.length; i++)
      for (let j = i + 1; j < params.length; j++) uncovered.delete(key(i, row[i], j, row[j]));
    rows.push(row);
  }
  return rows.map((row) => Object.fromEntries(params.map((p, i) => [p.name, row[i]])));
}

const VOTES = ["majority", "supermajority", "unanimous"] as const;

export function pairwiseCases(seed = 7): Case[] {
  const out: Case[] = [];
  for (const entity of ["LLC", "C-Corp", "S-Corp"] as Entity[]) {
    const r = rng(seed + entity.length);
    const voteKeys = entity === "LLC" ? LLC_VOTE_KEYS : CORP_VOTE_KEYS;
    const params: Param[] = [
      { name: "n", values: [1, 2, 3, 4, 5, 6] },
      ...voteKeys.map((k) => ({ name: k, values: VOTES })),
      { name: "rofr", values: [true, false] }, { name: "dragTag", values: [true, false] },
      { name: "nonCompete", values: [true, false] }, { name: "nonSolicitation", values: [true, false] },
      { name: "heirsForced", values: [true, false] }, { name: "divorce", values: [true, false] },
      { name: "xfer", values: ["free", "majority", "unanimous"] },
      { name: "bankTwo", values: [true, false] }, { name: "loans", values: [true, false] },
      { name: "proRata", values: [true, false] }, { name: "specificRoles", values: [true, false] },
      { name: "distribution", values: ["Trimestral", "Anual", "Semestral"] },
      { name: "spending", values: [10000, 7500] },
      { name: "holding", values: entity === "S-Corp" ? [false] : [false, true] },
      { name: "ssn", values: [false, true] },
      { name: "decimalSplit", values: [false, true] },
      ...(entity === "LLC" ? [{ name: "managingMembers", values: [true, false] }] : []),
    ];
    const rows = coveringArray(params, r);
    rows.forEach((row, i) => {
      const n = row.n as number;
      const split = row.decimalSplit && n === 3 ? [33.33, 33.33, 33.34] : row.decimalSplit && n === 2 ? [50.5, 49.5] : SPLITS[n][0];
      // S-Corp requires every shareholder to have an SSN.
      const owners = makeOwners(r, n, split, { holdingP: row.holding ? 1 : 0, ssnP: row.ssn ? 1 : 0 });
      if (row.holding) owners.forEach((o, k) => { if (k > 0) { o.type = "persona"; o.companyName = undefined; } });
      if (entity === "S-Corp") owners.forEach((o) => { o.type = "persona"; o.companyName = undefined; o.usCitizen = true; });
      const votes: Record<string, VoteKey> = {};
      for (const k of voteKeys) votes[k] = row[k];
      out.push({
        id: `P-${entity}-${String(i).padStart(3, "0")}`, layer: "pairwise", entity,
        companyBase: "PAIRWISE TEST", owners, votes,
        rofr: row.rofr, rofrDays: 60, dragTag: row.dragTag,
        nonCompete: row.nonCompete, ncYears: 2, ncScope: "Estado de Florida",
        nonSolicitation: row.nonSolicitation, heirsForced: row.heirsForced, divorce: row.divorce,
        xfer: row.xfer as Xfer, bankTwoSigners: row.bankTwo, loans: row.loans, proRata: row.proRata,
        managingMembers: row.managingMembers ?? true, specificRoles: row.specificRoles,
        distribution: row.distribution, spending: row.spending,
        taxPartnerIdx: n - 1, majority: 50.01, supermajority: 75,
      });
    });
  }
  return out;
}
