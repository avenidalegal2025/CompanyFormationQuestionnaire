/* Checks run on every generated agreement.
 *
 * expectations(): does the document say what THIS submission answered?
 * invariants():   rules every correct agreement obeys, whatever the answers
 *                 (cross-references resolve to the right topic, numbering is
 *                 continuous, percentages add up, one font, no leftovers…).
 *
 * Each finding has a stable `rule` id so results aggregate across thousands
 * of documents, and a severity: FAIL (wrong document) or WARN (needs a legal
 * decision / cosmetic).
 */
import PizZip from "pizzip";
import { DOMParser } from "@xmldom/xmldom";
import { Case, ownerName } from "./model.js";

export type Finding = { rule: string; sev: "FAIL" | "WARN"; msg: string };
export type Doc = { xml: string; paras: string[]; text: string };

export function readDoc(buf: Buffer): Doc {
  const xml = new PizZip(buf).file("word/document.xml")!.asText();
  const paras = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|(<w:tab\/>)/g)]
      .map((m) => (m[2] ? "\t" : m[1]))
      .join("")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/[  ]+/g, " ")
      .trim(),
  );
  return { xml, paras, text: paras.join("\n") };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE"];

export function expectations(c: Case, d: Doc): Finding[] {
  const f: Finding[] = [];
  const fail = (rule: string, msg: string) => f.push({ rule, sev: "FAIL", msg });
  const isCorp = c.entity !== "LLC";
  const t = d.text;

  if (!t.toUpperCase().includes(c.companyBase.toUpperCase())) fail("X-company-name", `company "${c.companyBase}" not found`);
  for (const o of c.owners) {
    const nm = ownerName(o);
    if (!t.includes(nm)) fail("X-owner-name", `owner "${nm}" missing`);
  }
  for (const o of c.owners) if (!t.includes(money(o.capital))) fail("X-capital", `capital ${money(o.capital)} for ${ownerName(o)} missing`);

  // Ownership per owner, read from the owner's row. Corp: 1,000 shares split
  // by largest remainder, so the expected % is shares/10.
  const exact = c.owners.map((o) => o.pct * 10);
  const fl = exact.map((x) => Math.floor(x + 1e-9));
  let left = 1000 - fl.reduce((s, x) => s + x, 0);
  [...exact.keys()].sort((i, j) => (exact[j]! - fl[j]!) - (exact[i]! - fl[i]!)).forEach((i) => { if (left > 0) { fl[i]!++; left--; } });
  for (const [oi, o] of c.owners.entries()) {
    const nm = ownerName(o);
    // The name heads a row in several tables; take the first row whose
    // following cells carry the ownership figure.
    const want = isCorp ? fl[oi]! / 10 : o.pct;
    const re = isCorp ? /^([\d.]+)%$/ : /([\d.]+)% of the MPI/;
    let m: RegExpExecArray | null = null;
    d.paras.forEach((p, k) => {
      if (m || !(p === nm || p.startsWith(nm + "\t"))) return;
      for (const q of [p, ...d.paras.slice(k + 1, k + 5)]) { const x = re.exec(q.replace(/^.*\t/, "")); if (x) { m = x; break; } }
    });
    if (!m) { f.push({ rule: "X-ownership-pct", sev: "WARN", msg: `no % found next to ${nm}` }); continue; }
    if (Math.abs(parseFloat(m[1]) - want) > 0.005) fail("X-ownership-pct", `${nm}: document says ${m[1]}%, answered ${o.pct}%`);
  }

  const taxName = ownerName(c.owners[c.taxPartnerIdx]);
  if (!isCorp) {
    const tp = d.paras.find((p) => /tax matters partner/i.test(p)) || "";
    if (!tp.includes(taxName)) fail("X-tax-partner", `tax partner should be ${taxName}: "${tp.slice(tp.indexOf("tax matters"), tp.indexOf("tax matters") + 70)}"`);
  }

  const has = (re: RegExp) => re.test(t);
  const presence = (rule: string, want: boolean, re: RegExp, label: string) => {
    if (want !== has(re)) fail(rule, `${label} ${want ? "missing" : "present but not chosen"}`);
  };
  presence("X-rofr", c.rofr, /Right of First Refusal/, "Right of First Refusal");
  presence("X-dragtag", c.dragTag, /Drag Along/, "Drag Along");
  presence("X-dragtag", c.dragTag, /Tag Along/, "Tag Along");
  presence("X-noncompete", c.nonCompete, isCorp ? /Covenant Against Competition/ : /Non-competition/i, "non-compete");
  presence("X-nonsolicit", c.nonSolicitation, /Non-Solicitation/, "non-solicitation");
  // LLC §8: the tender-offer sentence points at the drag-along section, so it
  // exists exactly when that section does.
  if (!isCorp) presence("X-tender-offer", c.dragTag, /tender offer to acquire/, "§8 tender-offer sentence");
  presence("X-heirs", c.heirsForced, /required to sell the (interest|Shares)/, "heirs forced sale");
  // The BUYOUT clause — not the generic transfer restriction (Corp §9.1.C),
  // which mentions divorce whatever the answer.
  presence("X-divorce", c.divorce, isCorp ? /option to purchase the Shares from a divorcing/i : /petition for dissolution of marriage/i, "divorce buyout");
  if (c.rofr && !has(new RegExp(`\\b${c.rofrDays} (calendar )?days`))) fail("X-rofr-days", `RoFR offer period ${c.rofrDays} days not found`);
  if (c.nonCompete) {
    const nc = d.paras.find((p) => /Territory/.test(p)) || "";
    if (!nc.includes(c.ncScope)) fail("X-nc-scope", `territory "${c.ncScope}" not in non-compete`);
    if (!has(new RegExp(`${WORDS[c.ncYears]} \\(${c.ncYears}\\) years`, "i"))) fail("X-nc-years", `${c.ncYears}-year duration not found`);
  }
  if (!t.includes(money(c.spending))) fail("X-spending", `spending threshold ${money(c.spending)} not found`);
  const bank = d.paras.find((p) => /signature of/i.test(p) && /bank|Withdrawals/i.test(p)) || "";
  if (bank && c.owners.length > 1) {   // one member can only have one signer
    const two = /\btwo\b/i.test(bank);
    if (two !== c.bankTwoSigners) fail("X-bank-signers", `answered ${c.bankTwoSigners ? "two" : "one"} signer(s): "${bank.slice(bank.search(/signature/i), bank.search(/signature/i) + 70)}"`);
  }
  // Antonio's decisions (2026-10-01) — each one a regression guard.
  const TERM: Record<string, string> = { majority: "Majority", supermajority: "Super Majority", unanimous: "Unanimous" };
  if (!isCorp) {
    const major = TERM[c.votes.llc_majorDecisions!]!;
    const succ = d.paras.find((p) => /decision to purchase a Successor's interest/.test(p)) || "";
    const sv = /within the discretion of (?:a |the )?(Super Majority|Majority|Unanimous)/.exec(succ.slice(succ.indexOf("decision to purchase a Successor")));
    if (succ && sv?.[1] !== major) fail("A-successor-vote", `§14.4 successor buyout reads "${sv?.[1]}", major decisions are "${major}"`);
    if (c.divorce) {
      const dv = /exercise this option shall be within the discretion of (?:a |the )?(Super Majority|Majority|Unanimous)/.exec(t);
      if (dv?.[1] !== major) fail("A-divorce-vote", `divorce buyout reads "${dv?.[1]}", major decisions are "${major}"`);
    }
    if (/Involuntary/.test(t)) fail("A-llc-involuntary", "LLC uses the undefined term Involuntary Assignee/Transfer");
    const rm = TERM[c.votes.llc_officerRemovalVoting!]!;
    const wv = /by the written (Super Majority|Majority|Unanimous) consent of the Members excluding/.exec(t);
    if (wv && wv[1] !== rm) fail("A-removal-written", `written-consent removal reads "${wv[1]}", removal vote is "${rm}"`);
    if (/rights and obligations of the deceased Member\. The Successor’s interest shall be subject to the options described in Section 14\.4 below\. To be clear, the incapacity/.test(t))
      fail("A-incapacity-deceased", "§14.3 incapacity still says \"deceased Member\"");
  } else {
    if (/greater than [A-Z ]+PERCENT \(50\.01%\)/.test(t)) fail("A-majority-def", "§1.6 still says greater than ... (50.01%)");
    if (!/Sections 14\.2 and 14\.3/.test(t)) fail("A-successor-ref", "§1.11 Successor should point to Sections 14.2 and 14.3");
    if (/Subject to Article 4\.3/.test(t)) fail("A-article-4.3", "13.1.A still says Article 4.3");
    if (/(?:entire|assets of the) Company\b/.test(t)) fail("A-corp-company", "corporation agreement says \"Company\"");
    if (c.dragTag && /Majority Shareholders/.test(t) && !/\(the “Majority Shareholders”\)/.test(t)) fail("A-majority-shareholders", "\"Majority Shareholders\" used but never defined");
  }

  // signature blocks: one per owner (+ the corporation's own block)
  const names = d.paras.filter((p) => /^Name:/.test(p)).length;
  const wantNames = c.owners.length + (isCorp ? 1 : 0);
  if (names !== wantNames) fail("X-signatures", `${names} "Name:" lines, expected ${wantNames}`);
  return f;
}

// ── invariants ─────────────────────────────────────────────────────────
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20 };

export function invariants(c: Case, d: Doc): Finding[] {
  const f: Finding[] = [];
  const fail = (rule: string, msg: string) => f.push({ rule, sev: "FAIL", msg });
  const warn = (rule: string, msg: string) => f.push({ rule, sev: "WARN", msg });
  const isCorp = c.entity !== "LLC";

  // The file must be well-formed XML — Word refuses to open it otherwise
  // (a signature-table rewrite once cut a nested </w:tblGrid> in half).
  const xmlErrors: string[] = [];
  new DOMParser({ onError: (level: string, msg: string) => { if (level !== "warning") xmlErrors.push(String(msg)); } } as any)
    .parseFromString(d.xml, "text/xml");
  if (xmlErrors.length) fail("I-invalid-xml", xmlErrors[0]!.slice(0, 160));

  // Leftovers and foreign template text.
  const left = /\{\{|\}\}|@VK|Owner of the Company|\bundefined\b|\bNaN\b|\[object |\$0\.00\b/.exec(d.text);
  if (left) fail("I-leftover", `"${d.text.slice(Math.max(0, left.index - 30), left.index + 30)}"`);
  if (/patient/i.test(d.text)) fail("I-foreign-template-text", `"${(/[^.]*patient[^.]*/i.exec(d.text) || [""])[0].trim().slice(0, 100)}"`);
  // Text repeated with no separator ("Estado de FloridaEstado de Florida");
  // a list of similar names ("Ana Núñez, Gabriela Núñez, Gabriela Pérez") is fine.
  const dup = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,.'-]{7,60}[A-Za-zÀ-ÿ.])\1/.exec(d.text);
  if (dup) fail("I-duplicated-text", `"${dup[0].slice(0, 90)}"`);
  const es = /\b(Mayoría|Supermayoría|Decisión Unánime|Trimestral|Semestral|Dos firmantes|Un firmante|Sí, )\b/.exec(d.text);
  if (es) fail("I-spanish-form-value", `form value leaked: "${d.text.slice(Math.max(0, es.index - 30), es.index + 40)}"`);

  // Section headings: "N.M" at the start of a paragraph.
  const secs = new Map<string, string>();            // "12.4" -> paragraph text
  const order: string[] = [];
  for (const p of d.paras) {
    const m = /^(\d{1,2})\.(\d{1,2})(?=[\s\t.A-Z])/.exec(p);
    if (m) { const k = `${+m[1]}.${+m[2]}`; if (secs.has(k)) fail("I-numbering-duplicate", `section ${k} appears twice`); secs.set(k, p); order.push(k); }
  }
  const byArt = new Map<number, number[]>();
  for (const k of order) { const [a, s] = k.split(".").map(Number); (byArt.get(a) || byArt.set(a, []).get(a)!).push(s); }
  for (const [a, list] of byArt) list.forEach((s, i) => { if (i > 0 && s !== list[i - 1] + 1) fail("I-numbering-gap", `§${a}.${list[i - 1]} followed by §${a}.${s}`); });

  // Articles: LLC "12. Title" headings, Corp "ARTICLE XIV: TITLE".
  const arts = new Map<number, string>();
  for (const p of d.paras) {
    const m = isCorp ? /^ARTICLE ([IVX]+)\s*[:.]\s*(.*)$/.exec(p) : /^(\d{1,2})\.\s+([A-Z][A-Za-z ,&;'’-]{2,60})$/.exec(p);
    if (m) arts.set(isCorp ? ROMAN[m[1]] : +m[1], m[2]);
  }
  const artNums = [...arts.keys()];
  artNums.forEach((n, i) => { if (i > 0 && n !== artNums[i - 1] + 1) fail("I-article-sequence", `article ${artNums[i - 1]} followed by ${n}`); });

  // Cross-references must resolve.
  const title = (ref: string) => (ref.includes(".") ? secs.get(ref) : arts.get(+ref)) ?? null;
  for (const p of d.paras) {
    for (const m of p.matchAll(/\b(Sections?|Paragraphs?|paragraphs?|Article)\s+(\d{1,2}(?:\.\d{1,2})?)(?:\s*[-–]\s*(\d{1,2}\.\d{1,2}))?/g)) {
      // Not ours: Internal Revenue Code / Treasury Regulation sections
      // ("Section 704(b)", "Section 6222 through 6232", "Reg. Section 1.704-1").
      const after = p.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      if (/^[\d(.\-]/.test(after) || /^\s*(of the (Internal Revenue )?Code|through \d)/i.test(after) || /Reg(ulation)?s?\.?\s*$/i.test(p.slice(Math.max(0, m.index! - 25), m.index!))) continue;
      for (const ref of [m[2], m[3]].filter(Boolean) as string[]) {
        if (!title(ref)) fail("I-xref-missing", `"${m[0]}" → no such section (in: "${p.slice(0, 70)}…")`);
      }
    }
  }
  // Cross-references whose TOPIC is known.
  const topicRef = (re: RegExp, topic: RegExp, rule: string, label: string) => {
    for (const p of d.paras) {
      const m = re.exec(p); if (!m) continue;
      const tt = title(m[1]);
      if (tt && !topic.test(tt)) fail(rule, `${label} → ${m[1]} is "${tt.slice(0, 60)}"`);
    }
  };
  topicRef(/tender offer[^.]*?(?:Paragraph|Section) (\d+\.\d+)/i, /Majority Selling|Approved Sale|Drag|desire to sell/i, "I-xref-topic", "tender-offer clause");
  topicRef(/shall not trigger Paragraph (\d+\.\d+)/i, /Deadlock|Purchasing Member/i, "I-xref-topic", "forfeiture 'shall not trigger'");
  topicRef(/option described in Section (\d+)\b(?!\.)/i, /DEATH|INCAPACITY|DIVORCE/i, "I-xref-topic", "involuntary-assignee option");
  if (isCorp) for (const p of d.paras) {
    const own = /^(\d+)\.\d+/.exec(p); const m = /pursuant to Section (\d+) above/.exec(p);
    if (own && m && own[1] === m[1]) fail("I-xref-self", `§${own[0]} refers to its own article ("${m[0]}")`);
  }
  // Severability range must cover every restrictive covenant present.
  const sev = /covenants included in Section (\d+\.\d+)\s*[-–]\s*(\d+\.\d+)/.exec(d.text);
  if (sev) {
    const hi = +sev[2].split(".")[1];
    for (const [k, p] of secs) if (/^\d+\.\d+\s*(Non-competition|Non-Solicitation|Non-Disparagement|Non-disclosure)/i.test(p) && k.startsWith(sev[2].split(".")[0] + ".") && +k.split(".")[1] > hi)
      fail("I-severability-range", `"${sev[0]}" does not cover §${k} ${p.slice(5, 30)}`);
  }

  // Ownership adds up.
  const pcts = isCorp
    ? d.paras.filter((p) => /\t[\d,]+\t\$[\d,.]+\t[\d.]+%$/.test(p) || /^[\d.]+%$/.test(p)).map((p) => parseFloat(/([\d.]+)%$/.exec(p)![1]))
    : [...d.text.matchAll(/([\d.]+)% of the MPI/g)].map((m) => parseFloat(m[1]));
  if (pcts.length) { const s = pcts.reduce((a, b) => a + b, 0); if (Math.abs(s - 100) > 0.05) fail("I-ownership-sum", `ownership adds up to ${s.toFixed(2)}%`); }

  // Sentences that restate the SAME decision must use the same threshold.
  const W = String.raw`(Super Majority|Majority|Unanimous)`;
  const groups: Array<[string, RegExp[]]> = isCorp
    ? [
        ["officer removal", [new RegExp(`removed[^.]*?by the ${W} vote of the Shareholders at a meeting`), new RegExp(`removed[^.]*?written consent of (?:a |the )?${W}`)]],
      ]
    : [
        ["new-member admission", [
          new RegExp(`added to the Company upon the ${W} approval`),
          new RegExp(`admitted to the Company as a Member with the ${W} vote`),
          new RegExp(`by the ${W} vote or consent of the existing Members`),
        ]],
        ["sale of the company", [
          new RegExp(`requires the ${W} consent of the Members`),
          new RegExp(`such sale has been approved by the ${W} vote`),
          new RegExp(`substantially all of the assets of the Company as determined by (?:a |the )?${W}`),
        ]],
      ];
  for (const [label, res] of groups) {
    const seen = new Map<string, string>();
    for (const re of res) { const m = re.exec(d.text); if (m) seen.set(m[1]!, m[0].slice(0, 90)); }
    if (seen.size > 1) fail("I-decision-two-thresholds", `${label}: ${[...seen.entries()].map(([w, s]) => `${w} ("${s}…")`).join(" vs ")}`);
  }

  // One threshold per decision inside a sentence.
  for (const p of d.paras) for (const sentence of p.split(/(?<=\.)\s/)) {
    if (!/removed/i.test(sentence)) continue;
    const words = new Set([...sentence.matchAll(/\b(Super Majority|Majority|Unanimous)\b/g)].map((m) => m[1]));
    if (words.size > 1) warn("W-two-thresholds-one-decision", `"${sentence.slice(0, 160)}"`);
  }

  // Labels glued to their text ("D.The", "12.4Notwithstanding").
  for (const p of d.paras) {
    const m = /^(\d{1,2}\.\d{1,2}|[A-Z]\.|(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.)(?=[A-Za-z])/.exec(p);
    if (m && !/^[A-Za-z]\./.test(p.slice(m[0].length))) fail("I-label-glued", `"${p.slice(0, 40)}"`);
  }

  // One font family.
  const fonts = new Map<string, number>();
  for (const m of d.xml.matchAll(/<w:rFonts [^>]*w:ascii="([^"]+)"/g)) fonts.set(m[1], (fonts.get(m[1]) || 0) + 1);
  for (const [font, n] of fonts) if (font !== "Times New Roman") fail("I-font", `${n} run(s) in "${font}"`);

  // A paragraph introducing a table must stay on the table's page.
  // Walk back from each table to the nearest paragraph that has text.
  let from = 0;
  for (;;) {
    const tbl = d.xml.indexOf("<w:tbl>", from); if (tbl < 0) break; from = tbl + 7;
    let end = tbl;
    for (let hops = 0; hops < 4; hops++) {
      const close = d.xml.lastIndexOf("</w:p>", end); if (close < 0) break;
      const open = Math.max(d.xml.lastIndexOf("<w:p>", close), d.xml.lastIndexOf("<w:p ", close));
      const p = d.xml.slice(open, close);
      const txt = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join("").trim();
      if (txt) {
        if (!/<w:keepNext(?: w:val="(?:1|true|on)")?\/>/.test(p)) fail("I-table-intro-not-kept", `"${txt.slice(0, 70)}" can be stranded from its table`);
        break;
      }
      end = open;
    }
  }
  return f;
}
