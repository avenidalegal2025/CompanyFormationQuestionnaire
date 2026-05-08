/**
 * Pairwise (2-way) covering array generator for variant sampling.
 *
 * Given N axes with their possible values, generates the minimum (or
 * near-minimum) set of test cases such that every PAIR of axis-value
 * combinations is exercised at least once. For 10-15 axes with mostly
 * 2-3 values, this typically produces ~30-80 cases vs the full
 * cartesian product of thousands.
 *
 * Algorithm: greedy IPOG-like — start with all pairs from the first 2
 * axes, then for each subsequent axis pick values that cover the most
 * uncovered pairs. Deterministic given the same axis order.
 *
 * Usage:
 *   import { pairwise } from './pairwise.mjs';
 *   const cases = pairwise({
 *     entity: ['Corp', 'LLC'],
 *     owners: [1, 2, 3, 4, 5, 6],
 *     voting: ['majority', 'supermajority', 'unanimous'],
 *     rofr: [true, false],
 *     ...
 *   });
 *   // cases is an array of objects: [{entity:'Corp', owners:1, ...}, ...]
 */

/** All ordered pairs (axisI, axisJ) where I < J. */
function allPairs(axes) {
  const keys = Object.keys(axes);
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const vi of axes[keys[i]]) {
        for (const vj of axes[keys[j]]) {
          pairs.push({ aI: keys[i], vI: vi, aJ: keys[j], vJ: vj });
        }
      }
    }
  }
  return pairs;
}

function pairKey(p) {
  // Stable string key for a pair (axis-value, axis-value).
  return `${p.aI}=${JSON.stringify(p.vI)}|${p.aJ}=${JSON.stringify(p.vJ)}`;
}

function caseCoversPair(c, p) {
  // Note: JSON-stringify avoids type confusion (true vs "true").
  return JSON.stringify(c[p.aI]) === JSON.stringify(p.vI)
      && JSON.stringify(c[p.aJ]) === JSON.stringify(p.vJ);
}

export function pairwise(axes) {
  const keys = Object.keys(axes);
  const allPairsList = allPairs(axes);
  const uncovered = new Set(allPairsList.map(pairKey));
  const pairsByKey = new Map(allPairsList.map(p => [pairKey(p), p]));
  const cases = [];

  while (uncovered.size > 0) {
    // Greedy: build a new case that covers the most uncovered pairs.
    // Start with one uncovered pair (deterministic: pick first).
    const seedKey = uncovered.values().next().value;
    const seed = pairsByKey.get(seedKey);
    const tentative = { [seed.aI]: seed.vI, [seed.aJ]: seed.vJ };

    // For each remaining axis, pick the value that covers the most
    // uncovered pairs WHEN combined with values already chosen.
    for (const k of keys) {
      if (k in tentative) continue;
      let bestValue = axes[k][0];
      let bestCovered = -1;
      for (const candidate of axes[k]) {
        const tryCase = { ...tentative, [k]: candidate };
        let covers = 0;
        for (const upKey of uncovered) {
          const up = pairsByKey.get(upKey);
          if (up.aI in tryCase && up.aJ in tryCase && caseCoversPair(tryCase, up)) {
            covers++;
          }
        }
        if (covers > bestCovered) {
          bestCovered = covers;
          bestValue = candidate;
        }
      }
      tentative[k] = bestValue;
    }

    cases.push(tentative);
    // Mark all pairs this case covers as covered.
    for (const upKey of [...uncovered]) {
      const up = pairsByKey.get(upKey);
      if (caseCoversPair(tentative, up)) uncovered.delete(upKey);
    }
  }

  return cases;
}

/** Verify pairwise coverage — for tests/sanity. */
export function verifyCoverage(cases, axes) {
  const allPairsList = allPairs(axes);
  const missing = [];
  for (const p of allPairsList) {
    const covered = cases.some(c => caseCoversPair(c, p));
    if (!covered) missing.push(p);
  }
  return { totalPairs: allPairsList.length, missing };
}
