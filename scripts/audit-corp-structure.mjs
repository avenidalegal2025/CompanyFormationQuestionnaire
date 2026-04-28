#!/usr/bin/env node
/**
 * Comprehensive structural auditor for the Corp Shareholder Agreement
 * rendered DOCX. Catches every bug pattern we found manually in the
 * 2026-04-27/28 session.
 *
 * Usage:
 *   node scripts/audit-corp-structure.mjs <path/to/document.xml>
 *   node scripts/audit-corp-structure.mjs <path/to/output.docx>   (extracts xml automatically)
 *
 * Exit code 0 = clean, 1 = issues found.
 *
 * Layers (see docs/AGREEMENT_QA_STRATEGY.md):
 *   L1 — Hierarchy / labels / orphan-title
 *   L2 — Run / formatting smells (underline placement, tabs, periods)
 *   L3 — Section completeness (empty headings, combined paragraphs)
 *   L4 — Layout sanity (pre-table page break, sig-block alignment)
 */
import fs from "node:fs";
import zlib from "node:zlib";

function loadXml(path) {
  if (path.endsWith(".xml")) return fs.readFileSync(path, "utf8");
  // .docx: ZIP file. Use minimal zip extraction via node:zlib + central
  // directory scan. Avoid pulling in a zip dep so this is portable.
  const buf = fs.readFileSync(path);
  // Find "word/document.xml" entry by scanning for the local file header
  // signature 0x04034b50 followed by the filename.
  const target = Buffer.from("word/document.xml");
  for (let i = 0; i < buf.length - 30; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const compMethod = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen);
    if (!name.equals(target)) continue;
    const dataStart = i + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    if (compMethod === 0) return data.toString("utf8");
    if (compMethod === 8) return zlib.inflateRawSync(data).toString("utf8");
    throw new Error(`unsupported zip compression method ${compMethod}`);
  }
  throw new Error("word/document.xml not found in docx");
}

const XML = loadXml(process.argv[2] || "/tmp/corp_rendered.xml");

// ─── Paragraph parsing ───────────────────────────────────────────────
const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
const paras = [];
let m;
while ((m = paraRe.exec(XML))) {
  const body = m[1];
  const ppr = (body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
  const text = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
  const ind = ppr.match(/<w:ind\b([^/]*)\/>/);
  let left = 0, hanging = 0, firstLine = 0;
  if (ind) {
    const a = ind[1];
    const li = a.match(/w:left="(\d+)"/);
    const hg = a.match(/w:hanging="(\d+)"/);
    const fl = a.match(/w:firstLine="([\d.]+)"/);
    if (li) left = parseInt(li[1], 10);
    if (hg) hanging = parseInt(hg[1], 10);
    if (fl) firstLine = Math.round(parseFloat(fl[1]));
  }
  const styleM = ppr.match(/<w:pStyle w:val="([^"]+)"/);
  paras.push({
    body,
    full: m[0],
    text,
    pPrText: ppr,
    left, hanging, firstLine,
    style: styleM ? styleM[1] : "",
    offset: m.index,
  });
}

const issues = [];
const push = (layer, msg) => issues.push({ layer, msg });

// ─── Patterns ────────────────────────────────────────────────────────
const SEC_RE = /^(\d+)\.(\d+)(?:\s|$)/;
// Letter/roman labels: the post-canonicalize XML uses <w:tab/> between label
// and body so concatenated text reads "A.body" with no whitespace. Match
// label as "X." optionally followed by space, then any non-period char.
const LETTER_RE = /^([A-Z])\.(?:\s|[^.])/;
const ROMAN_RE = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\.(?:\s|[^.])/;
const ROMAN_VALS = new Set(["i","ii","iii","iv","v","vi","vii","viii","ix","x"]);

// ─── L1: hierarchy / labels / orphan-title ───────────────────────────
let curArticle = null, curLetter = null, lastLetter = null, lastRoman = null;
for (const p of paras) {
  const t = p.text.trim();
  if (!t) continue;

  // Article reset
  const artM = t.match(/^ARTICLE\s+([IVXLCDM]+)/i);
  if (artM) { curArticle = artM[1]; curLetter = null; lastLetter = null; lastRoman = null; continue; }

  // Section heading
  const secM = t.match(SEC_RE);
  if (secM) {
    curLetter = null; lastLetter = null; lastRoman = null;
    // L1: pre-table heading must have keepNext (covered below)
    // L1: orphan-title — Heading-style paragraph must have keepNext
    const isShortTitled = t.length < 50;
    const hasH3 = /<w:pStyle w:val="Heading3"\/>/.test(p.body);
    if ((isShortTitled || hasH3) && !/<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(p.body)) {
      push("L1", `§${secM[1]}.${secM[2]} title without keepNext: ${t.slice(0,60)!==undefined?t.slice(0,60):t}`);
    }
    continue;
  }

  // Letter label
  const letM = t.match(LETTER_RE);
  if (letM) {
    const letter = letM[1].toLowerCase();
    if (p.left !== 2160 || p.hanging !== 720) {
      push("L1", `letter ${letM[1]}. has non-canonical indent (left=${p.left} hanging=${p.hanging}, expected 2160/720): ${t.slice(0,60)}`);
    }
    if (lastLetter === null) {
      if (letter !== "a") push("L1", `first letter in §${curArticle} sequence is ${letM[1]}, expected A.`);
    } else {
      const expected = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
      if (letter !== expected) push("L1", `letter sequence: expected ${expected.toUpperCase()}., got ${letM[1]}.`);
    }
    lastLetter = letter; curLetter = letter; lastRoman = null;
    continue;
  }

  // Roman label
  const romM = t.match(ROMAN_RE);
  if (romM && ROMAN_VALS.has(romM[1])) {
    if (p.left !== 2880 || p.hanging !== 720) {
      push("L1", `roman ${romM[1]}. has non-canonical indent (left=${p.left} hanging=${p.hanging}, expected 2880/720): ${t.slice(0,60)}`);
    }
    if (curLetter === null) {
      push("L1", `roman ${romM[1]}. has no parent letter — should be a letter at this level: ${t.slice(0,60)}`);
    }
    const R2I = {i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10};
    const n = R2I[romM[1]];
    if (lastRoman === null) {
      if (n !== 1) push("L1", `first roman in ${curArticle}.${curLetter} is ${romM[1]}., expected i.`);
    } else if (n !== R2I[lastRoman] + 1) {
      push("L1", `roman sequence in ${curArticle}.${curLetter}: expected ${Object.keys(R2I).find(k => R2I[k] === R2I[lastRoman]+1)}., got ${romM[1]}.`);
    }
    lastRoman = romM[1];
    continue;
  }
}

// Pre-table keepNext (L1)
for (const tblM of XML.matchAll(/<w:tbl\b/g)) {
  const before = XML.substring(0, tblM.index);
  const pClose = before.lastIndexOf("</w:p>");
  if (pClose < 0) continue;
  const pStart = before.lastIndexOf("<w:p ", pClose);
  if (pStart < 0) continue;
  const para = XML.substring(pStart, pClose + 6);
  if (!/<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(para)) {
    const t = (para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t=>t.replace(/<[^>]+>/g,'')).join('').trim();
    push("L1", `pre-table paragraph without keepNext: ${t.slice(0,60)!==undefined?t.slice(0,60):t}`);
  }
}

// L1 — keepNext chain through empty separator paragraphs.
// Discovered by Haiku visual review: §10.3 Indemnification orphaned at
// bottom of page because heading→empty-separator→body chain broke at
// the empty paragraph (which lacked keepNext).
//
// Restrict to ORPHAN-RISK sources only — ARTICLE captions and
// title-only §X.Y headings. Inline-titled §X.Y ("1.1 Act.  Florida
// Business…") have heading + body in the same paragraph, so the
// trailing empty has nothing to orphan-protect, and demanding keepNext
// here would chain every §1.x → §1.x+1 into one unbreakable block
// (causes half-blank pages when ARTICLE I = 11 §1.x sections is too
// tall to fit at a page bottom).
const ARTICLE_RE = /^ARTICLE\s+[IVXLCDM]+[:.\s]/;
const INLINE_TITLED_RE = /^\d+\.\d+\s+[A-Z][\w\s'’,&-]+\.\s+\S/;
for (let pi = 0; pi < paras.length - 1; pi++) {
  const cur = paras[pi];
  if (!/<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(cur.body)) continue;
  const curText = cur.text.trim();
  if (INLINE_TITLED_RE.test(curText)) continue;
  const looksLikeCaption =
    ARTICLE_RE.test(curText) ||
    /^\d+\.\d+\s+[A-Z][\w\s'’,&-]*\.?\s*$/.test(curText) ||
    curText === "";
  if (!looksLikeCaption) continue;
  let j = pi + 1;
  while (j < paras.length && !paras[j].text.trim()) {
    const empty = paras[j];
    const emptyHasKN = /<w:keepNext(?:\s+w:val="1")?\s*\/>/.test(empty.body);
    if (!emptyHasKN) {
      let hasFollowingContent = false;
      for (let k = j + 1; k < paras.length; k++) {
        if (paras[k].text.trim()) { hasFollowingContent = true; break; }
      }
      if (hasFollowingContent) {
        const prevText = curText.slice(0, 60);
        push("L1", `empty separator after keepNext paragraph lacks keepNext (breaks orphan-title chain): after "${prevText}"`);
      }
    }
    j++;
  }
}

// L1 — sig-block paragraphs with non-"both" justification.
// Discovered by Haiku on 4+ owner variants: addExtraCorpShareholders
// inserts paragraphs with <w:jc w:val="center"/> which visually pushes
// them off-axis from the rest of the sig block (Maria Torres slot
// rendered ~700 twips to the right of Roberto Mendez slot).
{
  const sigStartIdx = paras.findIndex(p => p.text.includes("“SHAREHOLDERS”"));
  if (sigStartIdx >= 0) {
    for (let pi = sigStartIdx; pi < paras.length; pi++) {
      const p = paras[pi];
      if (!p.text.trim()) continue;
      const jcM = p.pPrText.match(/<w:jc\s+w:val="([^"]+)"/);
      if (jcM && jcM[1] !== "both") {
        push("L4", `sig-block para[${pi}] has <w:jc w:val="${jcM[1]}"/> — should be "both": ${p.text.slice(0,60)}`);
      }
    }
  }
}

// L1 — leftover "X.XX% Owner" ownership-tag paragraphs.
// Discovered by Haiku on 4+ owner variants: cleanup didn't strip these.
for (const p of paras) {
  if (/^\d+(?:\.\d+)?%\s+Owner\s*$/.test(p.text.trim())) {
    push("L3", `leftover ownership tag paragraph: ${p.text.trim()}`);
  }
}

// L1 — missing empty separator between two consecutive §X.Y headings.
// Discovered after manual review of the §1.6→§1.7 transition: the
// rest of Article I uses an empty paragraph between every two
// numbered headings, but insertSuperMajorityCorp inserted §1.7
// directly after §1.6 with no separator. Result: visibly tighter
// vertical spacing between those two definitions vs. all the others.
// Detect: walk consecutive paragraphs; if both are §X.Y headings,
// flag.
{
  for (let pi = 0; pi < paras.length - 1; pi++) {
    const cur = paras[pi];
    const nxt = paras[pi + 1];
    if (!cur.text.trim() || !nxt.text.trim()) continue;
    const curM = cur.text.trim().match(SEC_RE);
    const nxtM = nxt.text.trim().match(SEC_RE);
    if (!curM || !nxtM) continue;
    // Same article? Same major number.
    if (curM[1] !== nxtM[1]) continue;
    push(
      "L1",
      `no empty separator between §${curM[1]}.${curM[2]} and §${nxtM[1]}.${nxtM[2]} (visual spacing inconsistent)`,
    );
  }
}

// L1 — Article heading with no §X.Y subsections inside it.
// Discovered by Haiku: when rofr=F drag=F tag=F, ARTICLE XIII has no
// §13.x subsections left but still renders the heading + a stray body
// paragraph "In the event that Shareholders holding..." with no
// section number. Detect: walk paragraphs; for each ARTICLE heading,
// require at least one §N.M Heading3 paragraph before the next
// ARTICLE heading.
{
  let curArtIdx = -1;
  let curArtRoman = "";
  let foundSubsection = false;
  for (let pi = 0; pi < paras.length; pi++) {
    const t = paras[pi].text.trim();
    const am = t.match(/^ARTICLE\s+([IVXLCDM]+)\b/i);
    if (am) {
      // Closing previous article: did it have any subsections?
      if (curArtIdx >= 0 && !foundSubsection) {
        push("L3", `ARTICLE ${curArtRoman} has no §X.Y subsections (heading + orphan body without numbering)`);
      }
      curArtIdx = pi;
      curArtRoman = am[1].toUpperCase();
      foundSubsection = false;
      continue;
    }
    if (curArtIdx < 0) continue;
    if (SEC_RE.test(t)) foundSubsection = true;
  }
  // Final article check
  if (curArtIdx >= 0 && !foundSubsection) {
    push("L3", `ARTICLE ${curArtRoman} has no §X.Y subsections`);
  }
}

// L1 — empty signature blocks (caught by Haiku on 1-owner variant).
// In the sig block, every "By: ___" line should be followed by a
// "Name:  <actual name>" line. Empty "Name:" with no name = orphan
// shareholder slot the cleanup function missed.
const sigStartIdxAudit = paras.findIndex(p => p.text.includes("“SHAREHOLDERS”"));
if (sigStartIdxAudit >= 0) {
  for (let pi = sigStartIdxAudit; pi < paras.length; pi++) {
    const p = paras[pi];
    if (!/^By:\s*_+/.test(p.text.trim())) continue;
    // Find the next non-empty paragraph
    let j = pi + 1;
    while (j < paras.length && !paras[j].text.trim()) j++;
    if (j >= paras.length) break;
    const next = paras[j].text.trim();
    if (next.startsWith("Name:")) {
      const nameValue = next.replace(/^Name:\s*/, "").trim();
      if (!nameValue) {
        push("L1", `empty signature block: "By: ___" followed by blank "Name:" (cleanup missed an owner slot)`);
      }
    }
  }
}

// ─── L2: run / formatting smells on numbered headings ────────────────
for (const p of paras) {
  const t = p.text.trim();
  const secM = t.match(SEC_RE);
  if (!secM) continue;
  // Skip the cover-title-style paragraphs without Heading3
  if (!/<w:pStyle w:val="Heading3"\/>/.test(p.body) && p.left !== 1440) continue;

  // Extract first 3 runs
  const runs = [...p.body.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)].map(r => r[0]);
  const u = (r) => /<w:u w:val="single"\/>/.test(r);
  const text = (r) => (r.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(s=>s.replace(/<[^>]+>/g,'')).join('');
  const tabs = (r) => (r.match(/<w:tab\/>/g) || []).length;

  // Find the run with N.M, the run with the title, and the body run.
  // Skip any leading whitespace/tab-only runs.
  let numIdx = runs.findIndex(r => /^\d+\.\d+\s*$/.test(text(r)));
  if (numIdx < 0) {
    // Number might be combined with title in single underlined run (Shape B).
    // That's a smell.
    push("L2", `§${secM[1]}.${secM[2]}: number not in its own un-underlined run`);
    continue;
  }
  if (u(runs[numIdx])) {
    push("L2", `§${secM[1]}.${secM[2]}: number run is underlined (should be plain)`);
  }
  const titleRun = runs[numIdx + 1];
  if (!titleRun) continue;
  if (!u(titleRun)) {
    push("L2", `§${secM[1]}.${secM[2]}: title run not underlined`);
  }
  const titleText = text(titleRun);
  if (/\.$/.test(titleText)) {
    push("L2", `§${secM[1]}.${secM[2]}: title ends with "." — period belongs to body run, not title`);
  }
  const bodyRun = runs[numIdx + 2];
  if (bodyRun) {
    const bt = text(bodyRun);
    if (tabs(bodyRun) > 0 && !/^\.\s*$/.test(bt.split('<w:tab/>')[0] || '')) {
      // Allow trailing tab at end of body, but no leading-or-mid <w:tab/> as
      // separator.
      // Check: is there a <w:tab/> between period and body text?
      if (/<w:t[^>]*>\.<\/w:t><w:tab\/>/.test(bodyRun)) {
        push("L2", `§${secM[1]}.${secM[2]}: body run has period+<w:tab/>+body shape (should be ".  body" inline)`);
      }
    }
  }
}

// ─── L3: section completeness ─────────────────────────────────────────
// 3a. No empty Heading3 (heading paragraph with only "N.M Title." and nothing else)
for (const p of paras) {
  const t = p.text.trim();
  if (!t) continue;
  const secM = t.match(SEC_RE);
  if (!secM) continue;
  // Body is the text AFTER "N.M Title."
  const titleEnd = t.indexOf(".");
  if (titleEnd < 0) continue;
  const afterTitle = t.substring(titleEnd + 1).trim();
  if (afterTitle.length < 20) {
    // Heading with no/very short body content. Walk forward up to 4
    // non-empty paragraphs; if ANY is a labeled item OR substantive
    // body text (>30 chars) within the same section, this heading is
    // fine. Only flag truly empty headings (§13.1 RoFR pre-fix shape).
    const j = paras.indexOf(p);
    let foundContent = false;
    for (let k = j + 1, seen = 0; k < paras.length && seen < 4; k++) {
      const nt = paras[k].text.trim();
      if (!nt) continue;
      if (SEC_RE.test(nt) || /^ARTICLE\s/i.test(nt)) break;
      if (LETTER_RE.test(nt) || ROMAN_RE.test(nt) || nt.length > 30) {
        foundContent = true; break;
      }
      seen++;
    }
    if (!foundContent) {
      push("L3", `§${secM[1]}.${secM[2]} has no body and no labeled sub-items: ${t.slice(0,60)}`);
    }
  }
}

// 3b. Combined paragraphs (e.g. "Name:X Title:Y" in one para)
for (const p of paras) {
  if (/<w:t[^>]*>\s*Name:[^<]*<\/w:t>/.test(p.body) && /<w:t[^>]*>\s*Title:[^<]*<\/w:t>/.test(p.body)) {
    push("L3", `Combined Name+Title paragraph (should be split): ${p.text.slice(0,80)}`);
  }
}

// ─── L4: layout sanity ───────────────────────────────────────────────
// 4a. Empty paragraph immediately before <w:tbl> must NOT have pageBreakBefore=1
for (const tblM of XML.matchAll(/<w:tbl\b/g)) {
  const before = XML.substring(0, tblM.index);
  const pClose = before.lastIndexOf("</w:p>");
  if (pClose < 0) continue;
  const pStart = before.lastIndexOf("<w:p ", pClose);
  if (pStart < 0) continue;
  const para = XML.substring(pStart, pClose + 6);
  const t = (para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t=>t.replace(/<[^>]+>/g,'')).join('').trim();
  if (!t && /<w:pageBreakBefore w:val="1"\s*\/>/.test(para)) {
    push("L4", `Empty pre-table paragraph has pageBreakBefore=1 (will orphan the heading)`);
  }
}

// 4b. Sig block effective-left consistency
const sigStart = paras.findIndex(p => p.text.includes("“SHAREHOLDERS”"));
if (sigStart >= 0) {
  const positions = new Map();
  for (let j = sigStart; j < paras.length; j++) {
    const p = paras[j];
    if (!p.text.trim()) continue;
    const isSig = (p.text.includes("“SHAREHOLDERS”")
                   || p.text.includes("“CORPORATION”")
                   || p.text.includes("Florida corporation")
                   || p.text.startsWith("By:")
                   || p.text.startsWith("Name:")
                   || p.text.startsWith("Title:"));
    if (!isSig) continue;
    // Effective left: left + firstLine - hanging + leading-tab-count*720
    const bodyAfterPPr = p.body.replace(/^[\s\S]*?<\/w:pPr>/, "");
    const firstRunM = bodyAfterPPr.match(/^\s*<w:r\b[\s\S]*?<\/w:r>/);
    let leadTabs = 0;
    if (firstRunM) {
      const fr = firstRunM[0];
      const beforeFirstT = fr.split('<w:t')[0];
      leadTabs = (beforeFirstT.match(/<w:tab\/>/g) || []).length;
    }
    const eff = p.left + p.firstLine - p.hanging + leadTabs * 720;
    positions.set(j, eff);
  }
  const vals = [...positions.values()];
  if (vals.length > 1) {
    const first = vals[0];
    for (const [idx, v] of positions) {
      if (v !== first) {
        const t = paras[idx].text.slice(0, 50);
        push("L4", `Sig-block para[${idx}] effective_left=${v} ≠ first ${first}: ${t}`);
      }
    }
  }
}

// ─── Report ──────────────────────────────────────────────────────────
const byLayer = { L1: [], L2: [], L3: [], L4: [] };
for (const i of issues) byLayer[i.layer].push(i.msg);

if (issues.length === 0) {
  console.log("CLEAN — Layers 1–4 all pass.");
  console.log(`  Paragraphs scanned: ${paras.length}`);
  process.exit(0);
}

console.log(`${issues.length} issue(s):`);
for (const layer of ["L1","L2","L3","L4"]) {
  if (byLayer[layer].length === 0) continue;
  console.log(`\n${layer} (${byLayer[layer].length}):`);
  for (const m of byLayer[layer]) console.log(`  - ${m}`);
}
process.exit(1);
