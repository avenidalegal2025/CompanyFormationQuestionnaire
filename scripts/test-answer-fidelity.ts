/**
 * "What the customer answered is what the document says" regression test.
 *
 * Covers the two defects found on 2026-09-17:
 *   A. The capital-contributions vote only reached the first sentence of LLC
 *      §5.1; the second sentence was rewritten by the major-decisions sweep.
 *   B. The voting thresholds (50.01 / 75) were shown in the questionnaire but
 *      never saved, so the agreement fell back to 50% and — worse — dropped the
 *      "Super Majority Defined" clause while still deciding things by Super
 *      Majority.
 *
 *   npx tsx scripts/test-answer-fidelity.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper.js";
import { generateDocument } from "../src/lib/agreement-docgen.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const LLC = JSON.parse(fs.readFileSync(path.join(FIX, "llc-base.payload.json"), "utf8"));
const CORP = JSON.parse(fs.readFileSync(path.join(FIX, "corp-base.payload.json"), "utf8"));

function payload(base: any, overrides: Record<string, unknown>, drop: string[] = []) {
  const d = JSON.parse(JSON.stringify(base));
  d.agreement = { ...(d.agreement || {}), ...overrides };
  for (const k of drop) delete d.agreement[k];
  return d;
}

function docText(buf: Buffer): string {
  let off = 0;
  while (off < buf.length - 4) {
    if (buf.readUInt32LE(off) === 0x04034b50) {
      const cmp = buf.readUInt16LE(off + 8);
      const csize = buf.readUInt32LE(off + 18);
      const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const fn = buf.toString("utf8", off + 30, off + 30 + buf.readUInt16LE(off + 26));
      if (fn === "word/document.xml") {
        const raw = buf.subarray(ds, ds + csize);
        return (cmp === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw))
          .toString("utf8")
          .replace(/<\/w:p>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
          .replace(/[ \t ]+/g, " ");
      }
      off = ds + csize;
    } else off++;
  }
  return "";
}

const text = async (data: any) => docText((await generateDocument(await mapFormToDocgenAnswers(data))).buffer);

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "🔴"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(label);
}

const VOTES: Array<[string, string]> = [
  ["Mayoría", "Majority"],
  ["Supermayoría", "Super Majority"],
  ["Decisión Unánime", "Unanimous"],
];

(async () => {
  console.log("Answer-fidelity test — the document must repeat the customer's answer\n");

  // A. Capital-contributions vote — LLC §5.1 says it twice; both must agree.
  console.log("LLC §5.1 additional capital (both sentences):");
  for (const [answer, expected] of VOTES) {
    const t = await text(payload(LLC, { llc_additionalContributionsDecision: answer, llc_majorDecisions: "Supermayoría" }));
    const first = t.match(/have agreed by ([A-Za-z ]+?) to the incurrence/)?.[1]?.trim();
    const second = t.match(/shall be made solely upon the ([A-Za-z ]+?) vote of the Members/)?.[1]?.trim();
    const norm = (s?: string) => (s || "").replace(/ vote$/, "");
    check(`${answer} → "${expected}" in both sentences`,
      norm(first) === expected && norm(second) === expected,
      `first="${first}" second="${second}"`);
  }

  // Corp equivalent (§4.5) — same answer, different clause wording.
  console.log("\nCorp §4.5 additional capital:");
  for (const [answer, expected] of VOTES) {
    const t = await text(payload(CORP, { corp_moreCapitalDecision: answer, corp_majorDecisionThreshold: "Supermayoría" }));
    const got = t.match(/raise additional capital shall be made with the ([A-Za-z ]+?) approval of the Shareholders/)?.[1]?.trim();
    check(`${answer} → "${expected}"`, (got || "").replace(/ vote$/, "") === expected, `got="${got}"`);
  }

  // B. Thresholds absent (old drafts, or a customer who never touched the box):
  //    the agreement must still define every term it uses.
  console.log("\nThresholds left untouched:");
  const DROP = ["majorityThreshold", "supermajorityThreshold"];
  const llcSuper = await text(payload(LLC, { llc_majorDecisions: "Supermayoría" }, DROP));
  check("LLC defines Super Majority when it decides by Super Majority",
    llcSuper.includes("Super Majority") && /Super Majority Defined/.test(llcSuper));
  check("LLC majority percentage is the 50.01% shown in the questionnaire",
    llcSuper.includes("50.01%"), llcSuper.match(/\d{2}\.?\d*%/g)?.slice(0, 5).join(" ") || "no % found");

  const corpSuper = await text(payload(CORP, { corp_majorDecisionThreshold: "Supermayoría" }, DROP));
  check("Corp defines Super Majority when it decides by Super Majority",
    /Super Majority\. Shareholders collectively holding greater than/.test(corpSuper));
  check("Corp majority percentage is 50.01%", corpSuper.includes("50.01%"));

  // The percentages written into the text follow the threshold the customer set
  // (LLC drag-along §12.9, Corp Approved Sale §13.3).
  console.log("\nMajority percentage at a non-default 60%:");
  for (const [base, label] of [[LLC, "LLC"], [CORP, "Corp"]] as const) {
    const t = await text(payload(base, { majorityThreshold: 60 }));
    check(`${label} keeps no stale 50.1% anywhere`, !t.includes("50.1%"),
      t.split("\n").filter((l) => l.includes("50.1%"))[0]?.slice(0, 120) || "");
  }

  // An agreement that never uses Super Majority must not define the term.
  const llcNoSuper = await text(payload(LLC, {
    llc_majorDecisions: "Mayoría", llc_companySaleDecision: "Mayoría", llc_dissolutionDecision: "Mayoría",
    llc_newMembersAdmission: "Mayoría", llc_officerRemovalVoting: "Mayoría",
    llc_memberLoansVoting: "Mayoría", llc_additionalContributionsDecision: "Mayoría",
  }, DROP));
  check("No unused Super Majority definition when nothing uses it",
    !/Super Majority Defined/.test(llcNoSuper));

  // D. Additional-capital pro-rata toggle. Answering "No" must rewrite the
  //    templates' mandatory pro-rata clauses (LLC §5.1 + Article 7, Corp §4.5)
  //    into voluntary-contribution wording; "Sí, Pro-Rata" keeps them.
  console.log("\nAdditional-capital pro-rata (LLC §5.1 / Art. 7, Corp §4.5):");
  {
    const llcYes = await text(payload(LLC, { llc_additionalContributions: "Sí, Pro-Rata" }));
    check('LLC "Sí, Pro-Rata" keeps the pro-rata basis clause',
      llcYes.includes("all future capital contributions shall be made on a pro-rata basis"));
    check('LLC "Sí, Pro-Rata" keeps the MPI dilution penalty',
      llcYes.includes("MPI reduced in pro-rata proportion to their ownership interest"));

    const llcNo = await text(payload(LLC, { llc_additionalContributions: "No" }));
    check('LLC "No" drops the pro-rata basis clause',
      !llcNo.includes("pro-rata basis"));
    check('LLC "No" makes additional contributions voluntary',
      llcNo.includes("shall be voluntary; no Member shall be obligated"));
    check('LLC "No" drops the MPI dilution penalty',
      !llcNo.includes("MPI reduced in pro-rata proportion"));
    check('LLC "No" rewrites Article 7 to opt-in contributions',
      llcNo.includes("may, but shall not be obligated to, contribute"));

    const corpYes = await text(payload(CORP, { corp_moreCapitalProcess: "Sí, Pro-Rata" }));
    check('Corp "Sí, Pro-Rata" keeps the pro-rata expense clause',
      corpYes.includes("pro-rata proportion equal to their percentage interest"));

    const corpNo = await text(payload(CORP, { corp_moreCapitalProcess: "No" }));
    check('Corp "No" drops the pro-rata expense clause',
      !corpNo.includes("pro-rata proportion equal to their percentage interest"));
    check('Corp "No" makes additional capital opt-in',
      corpNo.includes("no Shareholder shall be obligated to contribute additional capital"));
  }

  // E. LLC §7.6 distribution frequency — the same answer the Corp already
  //    honored must cadence the LLC distribution clause.
  console.log("\nLLC §7.6 distribution frequency:");
  {
    const FREQ: Array<[string, string]> = [
      ["Trimestral", "on a quarterly basis, at such times within each quarter"],
      ["Semestral", "on a semi-annual basis, at such times within each six-month period"],
      ["Anual", "on an annual basis, at such times within each year"],
    ];
    for (const [answer, phrase] of FREQ) {
      const t = await text(payload(LLC, { distributionFrequency: answer }));
      check(`LLC ${answer} → "${phrase}"`,
        t.includes(phrase) && !t.includes("from time to time at such times"));
    }
    const llcDisc = await text(payload(LLC, { distributionFrequency: "Discreción de los Miembros" }));
    check("LLC Discreción de los Miembros → template cadence retained",
      llcDisc.includes("from time to time at such times as the Members shall determine"));
    // The inserted bare "Majority" must be swept with the rest of §7.6 when
    // the major-decisions vote is elevated (pass runs before the sweep).
    const llcSuperFreq = await text(payload(LLC, {
      distributionFrequency: "Anual", llc_majorDecisions: "Supermayoría",
    }));
    check("LLC Anual + Supermayoría → cadence clause swept to Super Majority",
      llcSuperFreq.includes("within each year as the Members shall determine by Super Majority"));
  }

  // F. LLC §11.4(ii) minor decisions — the same voting answer that drives the
  //    major-decisions clause must also set the regime for below-threshold
  //    decisions; the template ships no minor-decisions clause without it.
  console.log("\nLLC §11.4 minor decisions:");
  {
    const MINOR = /The ([A-Za-z ]+?) Approval of the Members shall be required for all other decisions of the Company not listed in this Section 11\.4/;
    for (const [answer, expected] of VOTES) {
      // The base fixture answers major=Decisión Unánime, so the Majority case
      // also proves the major-decisions sweep cannot elevate a lower
      // minor-decisions vote to the major term.
      const t = await text(payload(LLC, { llc_minorDecisions: answer }));
      const got = t.match(MINOR)?.[1]?.trim();
      check(`${answer} → "${expected}" for minor decisions`, got === expected, `got="${got}"`);
    }
    // "Mayoría" with a custom % renders that % (same majority_threshold
    // mechanism the major-decisions "Majority" definition uses).
    const t60 = await text(payload(LLC, { llc_minorDecisions: "Mayoría", majorityThreshold: 66.67 }));
    check('Mayoría at a custom 66.67% renders the custom %',
      t60.match(MINOR)?.[1]?.trim() === "Majority" && t60.includes("66.67%") && !t60.includes("50.1%"));
    // Minor-only Supermayoría must still DEFINE the term it uses.
    const tSup = await text(payload(LLC, {
      llc_minorDecisions: "Supermayoría",
      llc_majorDecisions: "Mayoría", llc_companySaleDecision: "Mayoría", llc_dissolutionDecision: "Mayoría",
      llc_newMembersAdmission: "Mayoría", llc_officerRemovalVoting: "Mayoría",
      llc_memberLoansVoting: "Mayoría", llc_additionalContributionsDecision: "Mayoría",
    }, DROP));
    check("minor-only Supermayoría still defines Super Majority",
      /Super Majority Defined/.test(tSup) && tSup.match(MINOR)?.[1]?.trim() === "Super Majority");
  }

  // C. The effective date. The Corp template used to supply the ordinal and the
  //    year itself ("{{effective_date}}th, 2026"), so the generator filled in
  //    only "September 17": every 1st/2nd/3rd/21st/22nd/23rd/31st came out as
  //    "1th", and every agreement signed after 2026 was dated 2026.
  console.log("\nEffective date:");
  const today = new Date();
  const day = today.getUTCDate();
  const suffix = [1, 21, 31].includes(day) ? "st" : [2, 22].includes(day) ? "nd" : [3, 23].includes(day) ? "rd" : "th";
  const expectedDate = `${today.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${day}${suffix}, ${today.getUTCFullYear()}`;
  for (const [base, label] of [[LLC, "LLC"], [CORP, "Corp"]] as const) {
    const t = await text(payload(base, {}));
    const dates = [...t.matchAll(/([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th), \d{4})/g)].map((m) => m[1]);
    check(`${label} dates itself "${expectedDate}"`, dates.includes(expectedDate), dates.slice(0, 3).join(" | ") || "no date found");
    check(`${label} has no malformed ordinal`, !/\b(1th|2th|3th|21th|22th|23th|31th|\d+st,|\d+nd,)\b/.test(t.replace(/\b(1st|21st|31st|2nd|22nd|3rd|23rd),/g, "")),
      t.match(/\b\d+(?:th|st|nd|rd),? \d{4}/g)?.slice(0, 3).join(" | ") || "");
  }

  // The document is dated "today", so today's run only exercises one ordinal.
  // Freeze the clock on the days that used to come out wrong, and on a year
  // after the one the template hardcoded.
  console.log("\nEffective date on the days that used to break:");
  const RealDate = Date;
  const freeze = (iso: string) => {
    class Frozen extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-expect-error — passthrough for `new Date(x)`, frozen for `new Date()`
        super(...(args.length ? args : [iso]));
      }
      static now() { return new RealDate(iso).getTime(); }
    }
    (globalThis as { Date: DateConstructor }).Date = Frozen as unknown as DateConstructor;
  };
  const CASES: Array<[string, string]> = [
    ["2027-01-01T12:00:00.000Z", "January 1st, 2027"],
    ["2026-11-02T12:00:00.000Z", "November 2nd, 2026"],
    ["2026-11-03T12:00:00.000Z", "November 3rd, 2026"],
    ["2026-12-21T12:00:00.000Z", "December 21st, 2026"],
    ["2026-12-31T12:00:00.000Z", "December 31st, 2026"],
  ];
  try {
    for (const [iso, expected] of CASES) {
      for (const [base, label] of [[LLC, "LLC"], [CORP, "Corp"]] as const) {
        freeze(iso);
        const t = await text(payload(base, {}));
        (globalThis as { Date: DateConstructor }).Date = RealDate;
        // …and nothing left over from the template after it: the Corp template
        // used to supply ", 2026" itself, which produced "January 1st, 2027, 2026".
        const dates = [...t.matchAll(/([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4}(?:, \d{4})?)/g)].map((m) => m[1]);
        check(`${label} ${expected}`, t.includes(expected) && !/\d{4}, \d{4}/.test(t),
          dates.slice(0, 3).join(" | ") || "no date found");
      }
    }
  } finally {
    (globalThis as { Date: DateConstructor }).Date = RealDate;
  }

  console.log(failures.length ? `\n🔴 FAIL: ${failures.length} check(s) failed.` : "\n✅ PASS");
  process.exit(failures.length ? 1 : 0);
})();
