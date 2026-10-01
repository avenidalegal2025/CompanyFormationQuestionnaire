/* Layer 4: structural edge cases.
 *
 * Every on/off combination of the six toggles that ADD or REMOVE sections
 * (RoFR, drag/tag, non-compete, non-solicitation, heirs, divorce) — 64 per
 * entity — because section removal triggers renumbering and cross-reference
 * rewriting. Values deliberately look like section numbers (15% owners,
 * $14,000 / $15,000) — ordinary amounts that a renumbering pass must never
 * touch (a 15% owner once printed as "14.00%").
 */
import { Case, Entity, VoteKey, LLC_VOTE_KEYS, CORP_VOTE_KEYS, Owner } from "./model.js";

export function edgeCases(): Case[] {
  const out: Case[] = [];
  const owners: Owner[] = [
    { first: "Laura", last: "Méndez", pct: 70, capital: 15000, type: "persona", usCitizen: true },
    { first: "Tomás", last: "Ibáñez", pct: 15, capital: 14000, type: "persona", usCitizen: false },
    { first: "Inés", last: "Quiroga", pct: 15, capital: 1415, type: "persona", usCitizen: false },
  ];
  const profiles: VoteKey[] = ["majority", "supermajority", "unanimous"];
  for (const entity of ["LLC", "C-Corp"] as Entity[]) {
    const keys = entity === "LLC" ? LLC_VOTE_KEYS : CORP_VOTE_KEYS;
    for (let mask = 0; mask < 64; mask++) {
      const bit = (b: number) => Boolean(mask & (1 << b));
      const profile = profiles[mask % 3];
      const votes: Record<string, VoteKey> = {};
      for (const k of keys) votes[k] = profile;
      out.push({
        id: `E-${entity}-${String(mask).padStart(2, "0")}`, layer: "edge", entity,
        companyBase: "EDGE 15", owners, votes,
        rofr: bit(0), rofrDays: 15, dragTag: bit(1), nonCompete: bit(2), ncYears: 2, ncScope: "Estado de Florida",
        nonSolicitation: bit(3), heirsForced: bit(4), divorce: bit(5),
        xfer: (["free", "majority", "unanimous"] as const)[mask % 3],
        bankTwoSigners: true, loans: true, proRata: true, managingMembers: true, specificRoles: false,
        distribution: "Trimestral", spending: 15000, taxPartnerIdx: 1, majority: 50.01, supermajority: 75,
      });
    }
  }
  return out;
}
