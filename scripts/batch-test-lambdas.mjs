#!/usr/bin/env node
/**
 * Batch Test: Document Generation Variants
 *
 * Invokes each Lambda with synthetic data for various owner/member/director/officer
 * counts, then inspects the resulting DOCX XML to verify:
 *   - OrgRes Corp: signature block normalization (single SHAREHOLDERS header, no % Owner, etc.)
 *   - Shareholder Registry: table spacing (Pt(6)) and column widths
 *   - Membership Registry: table spacing (Pt(6)) and column widths
 *   - Bylaws: basic structure (spot-check)
 *
 * Usage:
 *   node scripts/batch-test-lambdas.mjs              # run all tests
 *   node scripts/batch-test-lambdas.mjs --save-docx   # also save DOCX files locally
 */

import { inflateRawSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const LAMBDA_URLS = {
  orgRes: 'https://yo54tsr37rcs3kjqsxt2ecvi2y0zjnli.lambda-url.us-west-1.on.aws/',
  shReg: 'https://gfwa6pqqesmrdfnm23snygybyq0gguah.lambda-url.us-west-1.on.aws/',
  memReg: 'https://rbkwy3w6jltg47gr5q7v543wci0mwxcw.lambda-url.us-west-1.on.aws/',
  bylaws: 'https://5jzjjp7fgbcsa24vnaxkkngwlm0jnfkz.lambda-url.us-west-1.on.aws/',
};

const TEMPLATE_BASES = {
  orgResCorpBase: 'https://company-formation-template-llc-and-inc.s3.us-west-1.amazonaws.com/templates/organizational-resolution-inc-216/',
  shRegBase: 'https://avenida-legal-documents.s3.us-west-1.amazonaws.com/templates/shareholder-registry/',
  memRegBase: 'https://company-formation-template-llc-and-inc.s3.us-west-1.amazonaws.com/llc-formation-templates/membership-registry-all-templates/',
  bylawsBase: 'https://avenida-legal-documents.s3.us-west-1.amazonaws.com/templates/bylaws/',
};

const SAVE_DOCX = process.argv.includes('--save-docx');
const SAVE_DIR = join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads', 'batch-test');

const NAMES = ['John Smith', 'Jane Doe', 'Carlos Garcia', 'Maria Rodriguez', 'Wei Chen', 'Priya Patel'];
const ADDRESSES = [
  '123 Main St, Miami, FL 33101',
  '456 Oak Ave, Tampa, FL 33601',
  '789 Pine Rd, Orlando, FL 32801',
  '321 Elm St, Jacksonville, FL 32099',
  '654 Maple Dr, Fort Lauderdale, FL 33301',
  '987 Cedar Ln, Naples, FL 34101',
];
const ROLES = ['President', 'Secretary', 'Treasurer', 'Vice President', 'Assistant Secretary', 'CFO'];

// ═══════════════════════════════════════════════════════════════
// DOCX (ZIP) EXTRACTION — zero dependencies
// ═══════════════════════════════════════════════════════════════

function extractDocumentXml(buf) {
  // DOCX is a ZIP. Scan for local file headers (PK\x03\x04) to find word/document.xml
  let offset = 0;
  while (offset < buf.length - 30) {
    // Local file header signature
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B ||
        buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) {
      offset++;
      continue;
    }
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;

    if (name === 'word/document.xml') {
      const compData = buf.subarray(dataStart, dataStart + compSize);
      if (compMethod === 0) return compData.toString('utf8'); // stored (no compression)
      return inflateRawSync(compData).toString('utf8'); // deflated
    }
    offset = dataStart + compSize;
  }
  throw new Error('word/document.xml not found in DOCX');
}

// ═══════════════════════════════════════════════════════════════
// LAMBDA INVOCATION
// ═══════════════════════════════════════════════════════════════

async function callLambda(url, payload) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000), // 2 min timeout for cold starts
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Lambda ${resp.status}: ${text.slice(0, 300)}`);
  }

  const contentType = resp.headers.get('content-type') || '';

  // JSON response (Shareholder Registry, Bylaws)
  if (contentType.includes('application/json')) {
    const json = await resp.json();
    if (json.docx_base64) {
      return Buffer.from(json.docx_base64, 'base64');
    }
    // Some Lambdas nest the body as a JSON string
    if (typeof json.body === 'string') {
      try {
        const inner = JSON.parse(json.body);
        if (inner.docx_base64) return Buffer.from(inner.docx_base64, 'base64');
      } catch { /* not nested JSON */ }
    }
    throw new Error(`No docx_base64 in JSON response: ${JSON.stringify(json).slice(0, 300)}`);
  }

  // Binary response (OrgRes, Membership Registry) — Function URL auto-decodes isBase64Encoded
  const arrayBuf = await resp.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // If the body looks like base64 text (all ASCII, no binary), decode it
  if (buf.length > 0 && buf[0] !== 0x50) { // PK signature = 0x50 0x4B
    const text = buf.toString('utf8');
    // Try base64 decode
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length > 4 && decoded[0] === 0x50 && decoded[1] === 0x4B) {
      return decoded;
    }
  }
  return buf;
}

// ═══════════════════════════════════════════════════════════════
// SYNTHETIC DATA GENERATORS
// ═══════════════════════════════════════════════════════════════

function splitOwnership(count) {
  // Split 100% evenly, last owner gets remainder
  const base = Math.floor(100 / count);
  const pcts = Array(count).fill(base);
  pcts[count - 1] = 100 - base * (count - 1);
  return pcts;
}

function generateMembers(count, totalShares = 1000) {
  const pcts = splitOwnership(count);
  return pcts.map((pct, i) => ({
    name: NAMES[i],
    address: ADDRESSES[i],
    ownershipPercent: pct,
    shares: Math.round(totalShares * pct / 100),
  }));
}

function generateManagers(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: NAMES[i],
    role: ROLES[i],
    address: ADDRESSES[i],
  }));
}

function generateDirectors(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: NAMES[i],
    address: ADDRESSES[i],
  }));
}

// ═══════════════════════════════════════════════════════════════
// PAYLOAD BUILDERS
// ═══════════════════════════════════════════════════════════════

function orgResCorpTemplateUrl(s, d, o) {
  const sp = s === 1 ? 'Owner' : 'Owners';
  const dp = d === 1 ? 'Director' : 'Directors';
  const op = o === 1 ? 'Officer' : 'Officers';
  const filename = `Org_Resolution_${s} ${sp}_${d} ${dp}_${o} ${op}.docx`;
  // Do NOT encodeURIComponent — Lambda parses URL to extract S3 key with raw spaces
  return TEMPLATE_BASES.orgResCorpBase + filename;
}

function buildOrgResCorpPayload(shareholderCount, directorCount, officerCount) {
  const members = generateMembers(shareholderCount);
  const managers = generateManagers(officerCount);
  const directors = generateDirectors(directorCount);
  return {
    form_data: {
      companyName: 'BATCH TEST CORP INC',
      companyAddress: '123 Test Blvd, Miami, FL 33101',
      formationState: 'Florida',
      formationDate: '13th day of March, 2026',
      paymentDateRaw: '03/13/2026',
      totalShares: 1000,
      members,
      managers,
      directors,
      memberCount: shareholderCount,
      managerCount: officerCount,
      directorCount,
    },
    s3_bucket: 'avenida-legal-documents',
    s3_key: `test/batch-test/orgres-corp-${shareholderCount}-${directorCount}-${officerCount}.docx`,
    templateUrl: orgResCorpTemplateUrl(shareholderCount, directorCount, officerCount),
    return_docx: true,
  };
}

function shRegTemplateUrl(n) {
  return `${TEMPLATE_BASES.shRegBase}shareholder-registry-${n}.docx`;
}

function buildShRegPayload(shareholderCount) {
  const members = generateMembers(shareholderCount, 1000);
  const shareholders = members.map(m => ({
    date: '03/13/2026',
    name: m.name,
    transaction: 'Allotted',
    shares: String(m.shares),
    class: 'Common Stock',
    percent: m.ownershipPercent.toFixed(2) + '%',
  }));
  return {
    form_data: {
      companyName: 'BATCH TEST CORP INC',
      formationState: 'Florida',
      companyAddress: '123 Test Blvd, Miami, FL 33101',
      paymentDate: 'March 13th, 2026',
      authorizedShares: '1,000',
      outstandingShares: '1,000',
      officer1Name: 'John Smith',
      officer1Role: 'PRESIDENT',
      shareholders,
    },
    s3_bucket: 'avenida-legal-documents',
    s3_key: `test/batch-test/shreg-${shareholderCount}.docx`,
    templateUrl: shRegTemplateUrl(shareholderCount),
    return_docx: true,
  };
}

function memRegTemplateUrl(members, managers) {
  const mPlural = members === 1 ? 'member' : 'members';
  const folder = `membership-registry-${members}-${mPlural}`;
  const file = `Template Membership Registry_${members} Members_${managers} Manager.docx`;
  // Do NOT encodeURIComponent — Lambda parses URL to extract S3 key with raw spaces
  return `${TEMPLATE_BASES.memRegBase}${folder}/${file}`;
}

function buildMemRegPayload(memberCount, managerCount) {
  const members = generateMembers(memberCount);
  const managers = generateManagers(managerCount);
  return {
    form_data: {
      companyName: 'BATCH TEST LLC',
      companyAddress: '123 Test Blvd, Miami, FL 33101',
      formationState: 'Florida',
      formationDate: '13th day of March, 2026',
      formationDateNumeric: '03/13/2026',
      members: members.map(m => ({
        name: m.name,
        address: m.address,
        ownershipPercent: m.ownershipPercent,
      })),
      managers: managers.map(m => ({
        name: m.name,
        address: m.address,
      })),
      memberCount,
      managerCount,
    },
    s3_bucket: 'avenida-legal-documents',
    s3_key: `test/batch-test/memreg-${memberCount}-${managerCount}.docx`,
    templateUrl: memRegTemplateUrl(memberCount, managerCount),
    return_docx: true,
  };
}

function bylawsTemplateUrl(n) {
  const suffix = n === 1 ? 'owner' : 'owners';
  return `${TEMPLATE_BASES.bylawsBase}bylaws-${n}-${suffix}.docx`;
}

function buildBylawsPayload(ownerCount) {
  const data = {
    companyName: 'BATCH TEST CORP INC',
    formationState: 'Florida',
    paymentDate: '13th day of March, 2026',
    numberOfShares: '1,000',
    officer1Name: 'John Smith',
    officer1Role: 'PRESIDENT',
    ownersCount: ownerCount,
  };
  for (let i = 1; i <= 6; i++) {
    data[`owner${i}Name`] = i <= ownerCount ? NAMES[i - 1] : '';
  }
  return {
    form_data: data,
    s3_bucket: 'avenida-legal-documents',
    s3_key: `test/batch-test/bylaws-${ownerCount}.docx`,
    templateUrl: bylawsTemplateUrl(ownerCount),
    return_docx: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// XML HELPER: find paragraph XML containing text
// ═══════════════════════════════════════════════════════════════

function findParagraphContaining(xml, text) {
  // Find all <w:p ...>...</w:p> paragraphs and return the one containing the text
  const paraRegex = /<w:p[ >].*?<\/w:p>/gs;
  let match;
  while ((match = paraRegex.exec(xml)) !== null) {
    // Extract text from w:t elements
    const textContent = [...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map(m => m[1]).join('');
    if (textContent.includes(text)) {
      return match[0];
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ASSERTIONS
// ═══════════════════════════════════════════════════════════════

function assertOrgResSignature(xml, shareholderCount) {
  const errors = [];
  const witnessIdx = xml.indexOf('IN WITNESS WHEREOF');
  if (witnessIdx === -1) {
    errors.push('No "IN WITNESS WHEREOF" found');
    return errors;
  }
  const sig = xml.substring(witnessIdx);

  // 1. Count SHAREHOLDERS text occurrences (as w:t content)
  const shareholdersInText = [...sig.matchAll(/<w:t[^>]*>[^<]*SHAREHOLDERS[^<]*<\/w:t>/g)];
  if (shareholdersInText.length < 1) {
    errors.push('No SHAREHOLDERS header found in signature section');
  }

  // 2. No standalone SHAREHOLDER (singular) as full-text paragraph header
  //    Look for w:t elements that contain exactly "SHAREHOLDER" (not SHAREHOLDERS)
  const singularHeaders = [...sig.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .filter(m => m[1].trim() === 'SHAREHOLDER');
  if (singularHeaders.length > 0) {
    errors.push(`Found ${singularHeaders.length} standalone SHAREHOLDER (singular) header(s)`);
  }

  // 3. No "XX% Owner" lines
  const pctOwnerTexts = [...sig.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .filter(m => /\d+%?\s*Owner/.test(m[1]));
  if (pctOwnerTexts.length > 0) {
    errors.push(`Found ${pctOwnerTexts.length} "% Owner" line(s): ${pctOwnerTexts.map(m => m[1].trim()).join(', ')}`);
  }

  // 4. No "Owner of the Company"
  if (sig.includes('Owner of the Company')) {
    errors.push('Found "Owner of the Company" text');
  }

  // 5. SHAREHOLDERS header should have bold + underline
  //    Find the paragraph containing SHAREHOLDERS and check run properties
  const shareholdersPara = findParagraphContaining(sig, 'SHAREHOLDERS');
  if (shareholdersPara) {
    const hasBold = shareholdersPara.includes('<w:b/>') || shareholdersPara.includes('<w:b ');
    const hasUnderline = shareholdersPara.includes('<w:u ');
    if (!hasBold) errors.push('SHAREHOLDERS header missing bold formatting');
    if (!hasUnderline) errors.push('SHAREHOLDERS header missing underline formatting');
  }

  // 6. Name: lines should not be bold
  //    Find paragraphs with "Name:" and check they don't have <w:b/> active
  const nameParas = [];
  const paraRegex = /<w:p[ >].*?<\/w:p>/gs;
  let match;
  while ((match = paraRegex.exec(sig)) !== null) {
    const textContent = [...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map(m => m[1]).join('');
    if (textContent.includes('Name:') && !textContent.includes('Company Name')) {
      nameParas.push(match[0]);
    }
  }

  for (const np of nameParas) {
    // Check runs containing the actual name value (not the "Name:" label)
    // If bold is on without val="0", it's a problem
    const runs = [...np.matchAll(/<w:r>.*?<\/w:r>/gs)];
    for (const run of runs) {
      const runText = [...run[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map(m => m[1]).join('');
      // Skip runs that are just "Name:" or empty
      if (!runText.trim() || runText.trim() === 'Name:' || runText.trim().startsWith('Name:')) continue;
      // This run contains a person's name — check it's not bold
      const hasBoldOn = (run[0].includes('<w:b/>') || run[0].match(/<w:b w:val="true"/)) &&
                        !run[0].includes('<w:b w:val="0"') && !run[0].includes('<w:b w:val="false"');
      if (hasBoldOn) {
        errors.push(`Name "${runText.trim()}" is bold (should not be)`);
        break; // one error per Name: line is enough
      }
    }
  }

  // 7. Verify correct number of "Name:" lines (should match shareholderCount)
  if (nameParas.length < shareholderCount) {
    errors.push(`Expected ${shareholderCount} Name: lines, found ${nameParas.length}`);
  }

  return errors;
}

function assertShRegFormatting(xml) {
  const errors = [];

  // 1. "Common Stock" paragraph has w:after="120"
  const csPara = findParagraphContaining(xml, 'Common Stock');
  if (!csPara) {
    errors.push('No "Common Stock" paragraph found');
  } else {
    // Check w:spacing in pPr
    const spacingMatch = csPara.match(/<w:spacing[^/]*\/>/);
    if (!spacingMatch || !spacingMatch[0].includes('w:after="120"')) {
      errors.push(`"Common Stock" missing w:after="120" spacing (found: ${spacingMatch ? spacingMatch[0] : 'none'})`);
    }
  }

  // 2. "I hereby certify" paragraph has w:before="120"
  const certPara = findParagraphContaining(xml, 'I hereby certify');
  if (!certPara) {
    errors.push('No "I hereby certify" paragraph found');
  } else {
    const spacingMatch = certPara.match(/<w:spacing[^/]*\/>/);
    if (!spacingMatch || !spacingMatch[0].includes('w:before="120"')) {
      errors.push(`"I hereby certify" missing w:before="120" spacing (found: ${spacingMatch ? spacingMatch[0] : 'none'})`);
    }
  }

  // 3. Fixed table layout
  if (!xml.includes('w:type="fixed"')) {
    errors.push('No fixed table layout found');
  }

  // 4. Column widths in tblGrid
  const expectedWidths = [1368, 2592, 1224, 1152, 1152, 1512];
  const gridMatch = xml.match(/<w:tblGrid>.*?<\/w:tblGrid>/s);
  if (!gridMatch) {
    errors.push('No <w:tblGrid> found');
  } else {
    const gridCols = [...gridMatch[0].matchAll(/w:w="(\d+)"/g)].map(m => parseInt(m[1]));
    if (gridCols.length !== 6) {
      errors.push(`Expected 6 gridCol widths, found ${gridCols.length}: [${gridCols.join(', ')}]`);
    } else {
      for (let i = 0; i < 6; i++) {
        if (gridCols[i] !== expectedWidths[i]) {
          errors.push(`Column ${i} width: expected ${expectedWidths[i]}, got ${gridCols[i]}`);
        }
      }
    }
  }

  return errors;
}

function assertMemRegFormatting(xml) {
  const errors = [];

  // 1. Paragraph containing "MEMBERSHIP INTEREST" (heading above table) has w:after="120"
  //    The actual text is "REGISTRY OF MEMBERSHIP INTEREST FOR ..." not just "Membership Interest"
  const miPara = findParagraphContaining(xml, 'MEMBERSHIP INTEREST') ||
                 findParagraphContaining(xml, 'Membership Interest');
  if (!miPara) {
    errors.push('No "Membership Interest" paragraph found');
  } else {
    const spacingMatch = miPara.match(/<w:spacing[^/]*\/>/);
    if (!spacingMatch || !spacingMatch[0].includes('w:after="120"')) {
      errors.push(`"Membership Interest" missing w:after="120" (found: ${spacingMatch ? spacingMatch[0] : 'none'})`);
    }
  }

  // 2. "I hereby certify" paragraph has w:before="120"
  const certPara = findParagraphContaining(xml, 'I hereby certify');
  if (!certPara) {
    errors.push('No "I hereby certify" paragraph found');
  } else {
    const spacingMatch = certPara.match(/<w:spacing[^/]*\/>/);
    if (!spacingMatch || !spacingMatch[0].includes('w:before="120"')) {
      errors.push(`"I hereby certify" missing w:before="120" (found: ${spacingMatch ? spacingMatch[0] : 'none'})`);
    }
  }

  // 3. Fixed table layout
  if (!xml.includes('w:type="fixed"')) {
    errors.push('No fixed table layout found');
  }

  // 4. tblGrid exists with gridCol elements
  const gridMatch = xml.match(/<w:tblGrid>.*?<\/w:tblGrid>/s);
  if (!gridMatch) {
    errors.push('No <w:tblGrid> found');
  } else {
    const gridCols = [...gridMatch[0].matchAll(/w:w="(\d+)"/g)].map(m => parseInt(m[1]));
    if (gridCols.length < 3) {
      errors.push(`Expected ≥3 gridCol widths, found ${gridCols.length}`);
    }
    // All widths should be positive
    const zeros = gridCols.filter(w => w <= 0);
    if (zeros.length > 0) {
      errors.push(`Found ${zeros.length} zero/negative column widths`);
    }
  }

  return errors;
}

function assertBylawsBasic(xml) {
  const errors = [];

  // 1. Document contains text (basic validity)
  if (!xml || xml.length < 100) {
    errors.push('Document XML is empty or too short');
    return errors;
  }

  // 2. [SIGNATURE PAGE BELOW] present
  if (!xml.includes('SIGNATURE PAGE BELOW')) {
    errors.push('Missing [SIGNATURE PAGE BELOW] text');
  }

  // 3. pageBreakBefore on witness paragraph
  const witnessPara = findParagraphContaining(xml, 'IN WITNESS WHEREOF');
  if (!witnessPara) {
    errors.push('No "IN WITNESS WHEREOF" paragraph found');
  } else {
    if (!witnessPara.includes('w:pageBreakBefore')) {
      errors.push('IN WITNESS WHEREOF paragraph missing pageBreakBefore');
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// TEST DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const tests = [
  // A. OrgRes Corp — 8 cases
  { id: 'orgres-1-1-1', group: 'OrgRes Corp', desc: '1 owner, 1 dir, 1 off',
    build: () => buildOrgResCorpPayload(1, 1, 1), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 1) },
  { id: 'orgres-2-1-1', group: 'OrgRes Corp', desc: '2 owners, 1 dir, 1 off',
    build: () => buildOrgResCorpPayload(2, 1, 1), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 2) },
  { id: 'orgres-3-2-2', group: 'OrgRes Corp', desc: '3 owners, 2 dirs, 2 offs',
    build: () => buildOrgResCorpPayload(3, 2, 2), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 3) },
  { id: 'orgres-4-2-3', group: 'OrgRes Corp', desc: '4 owners, 2 dirs, 3 offs',
    build: () => buildOrgResCorpPayload(4, 2, 3), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 4) },
  { id: 'orgres-5-3-3', group: 'OrgRes Corp', desc: '5 owners, 3 dirs, 3 offs',
    build: () => buildOrgResCorpPayload(5, 3, 3), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 5) },
  { id: 'orgres-6-6-6', group: 'OrgRes Corp', desc: '6 owners, 6 dirs, 6 offs',
    build: () => buildOrgResCorpPayload(6, 6, 6), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 6) },
  { id: 'orgres-1-3-2', group: 'OrgRes Corp', desc: '1 owner, 3 dirs, 2 offs',
    build: () => buildOrgResCorpPayload(1, 3, 2), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 1) },
  { id: 'orgres-2-2-2', group: 'OrgRes Corp', desc: '2 owners, 2 dirs, 2 offs',
    build: () => buildOrgResCorpPayload(2, 2, 2), url: LAMBDA_URLS.orgRes,
    assert: (xml) => assertOrgResSignature(xml, 2) },

  // B. Shareholder Registry — 6 cases
  { id: 'shreg-1', group: 'Shareholder Registry', desc: '1 shareholder',
    build: () => buildShRegPayload(1), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },
  { id: 'shreg-2', group: 'Shareholder Registry', desc: '2 shareholders',
    build: () => buildShRegPayload(2), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },
  { id: 'shreg-3', group: 'Shareholder Registry', desc: '3 shareholders',
    build: () => buildShRegPayload(3), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },
  { id: 'shreg-4', group: 'Shareholder Registry', desc: '4 shareholders',
    build: () => buildShRegPayload(4), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },
  { id: 'shreg-5', group: 'Shareholder Registry', desc: '5 shareholders',
    build: () => buildShRegPayload(5), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },
  { id: 'shreg-6', group: 'Shareholder Registry', desc: '6 shareholders',
    build: () => buildShRegPayload(6), url: LAMBDA_URLS.shReg,
    assert: assertShRegFormatting },

  // C. Membership Registry — 4 cases
  { id: 'memreg-1-1', group: 'Membership Registry', desc: '1 member, 1 manager',
    build: () => buildMemRegPayload(1, 1), url: LAMBDA_URLS.memReg,
    assert: assertMemRegFormatting },
  { id: 'memreg-2-2', group: 'Membership Registry', desc: '2 members, 2 managers',
    build: () => buildMemRegPayload(2, 2), url: LAMBDA_URLS.memReg,
    assert: assertMemRegFormatting },
  { id: 'memreg-3-3', group: 'Membership Registry', desc: '3 members, 3 managers',
    build: () => buildMemRegPayload(3, 3), url: LAMBDA_URLS.memReg,
    assert: assertMemRegFormatting },
  { id: 'memreg-6-6', group: 'Membership Registry', desc: '6 members, 6 managers',
    build: () => buildMemRegPayload(6, 6), url: LAMBDA_URLS.memReg,
    assert: assertMemRegFormatting },

  // D. Bylaws — 2 cases
  { id: 'bylaws-1', group: 'Bylaws', desc: '1 owner',
    build: () => buildBylawsPayload(1), url: LAMBDA_URLS.bylaws,
    assert: assertBylawsBasic },
  { id: 'bylaws-3', group: 'Bylaws', desc: '3 owners',
    build: () => buildBylawsPayload(3), url: LAMBDA_URLS.bylaws,
    assert: assertBylawsBasic },
];

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════

async function run() {
  console.log('');
  console.log('🧪 Batch Test: Document Generation Variants');
  console.log('============================================');
  console.log(`Total test cases: ${tests.length}`);
  if (SAVE_DOCX) {
    mkdirSync(SAVE_DIR, { recursive: true });
    console.log(`Saving DOCX files to: ${SAVE_DIR}`);
  }
  console.log('');

  let passed = 0;
  let failed = 0;
  const failures = [];
  let currentGroup = '';

  for (const test of tests) {
    if (test.group !== currentGroup) {
      currentGroup = test.group;
      console.log(`${currentGroup}:`);
    }

    const start = Date.now();
    const pad = `  ${test.id}`.padEnd(22);
    const descPad = `(${test.desc})`.padEnd(36);

    try {
      // Build payload
      const payload = test.build();

      // Call Lambda
      const docxBuf = await callLambda(test.url, payload);

      // Save DOCX if requested
      if (SAVE_DOCX) {
        const savePath = join(SAVE_DIR, `${test.id}.docx`);
        writeFileSync(savePath, docxBuf);
      }

      // Extract XML
      const xml = extractDocumentXml(docxBuf);

      // Run assertions
      const errors = test.assert(xml);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (errors.length === 0) {
        console.log(`  ✅ ${pad} ${descPad} ${elapsed}s`);
        passed++;
      } else {
        console.log(`  ❌ ${pad} ${descPad} ${elapsed}s`);
        for (const e of errors) {
          console.log(`     └─ ${e}`);
        }
        failed++;
        failures.push({ id: test.id, errors });
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ❌ ${pad} ${descPad} ${elapsed}s`);
      console.log(`     └─ ERROR: ${err.message}`);
      failed++;
      failures.push({ id: test.id, errors: [err.message] });
    }
  }

  // Summary
  console.log('');
  console.log('============================================');
  if (failed === 0) {
    console.log(`RESULTS: ${passed}/${tests.length} passed ✅`);
  } else {
    console.log(`RESULTS: ${passed}/${tests.length} passed, ${failed} FAILED ❌`);
    console.log('');
    console.log('Failed tests:');
    for (const f of failures) {
      console.log(`  ${f.id}:`);
      for (const e of f.errors) {
        console.log(`    - ${e}`);
      }
    }
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
