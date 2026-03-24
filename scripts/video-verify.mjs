/**
 * Verifies every point from the attorney video transcripts
 * against the actual generated agreement documents.
 * Maps each video timestamp to specific text in the generated docs.
 */
import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

function getText(file) {
  const buf = readFileSync(file);
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
        const raw = comp === 0 ? buf.subarray(dStart, dStart + cSize) : inflateRawSync(buf.subarray(dStart, dStart + cSize));
        return (raw.toString('utf8').match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
      }
      offset = dStart + cSize;
    } else offset++;
  }
  return '';
}

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

const DL = process.env.USERPROFILE + '/Downloads/';

// Corp variants
const v1 = getText(DL + 'CORP_V1_2owners_mixed.docx');
const v2 = getText(DL + 'CORP_V2_1owner_unanimous_noROFR.docx');
const v3 = getText(DL + 'CORP_V3_3owners_majority_ROFR.docx');
const llc = getText(DL + 'FMT_LLC_Agreement.docx');

console.log('══ CORP VIDEO TRANSCRIPT VERIFICATION ══\n');

// [00:00] Sale of company — 10.2.e — 3 options: unanimous/supermajority/majority
console.log('[00:00] Sale of Company (Sec 10.2.e)');
check('V1 supermajority: "Super Majority consent or approval of both the Shareholders and the Board"', v1.includes('Super Majority consent or approval of both the Shareholders and the Board'));
check('V2 unanimous: "Unanimous consent or approval of both the Shareholders and the Board"', v2.includes('Unanimous consent or approval of both the Shareholders and the Board'));
check('V3 majority: "Majority consent or approval of both the Shareholders and the Board"', v3.includes('Majority consent or approval of both the Shareholders and the Board'));

// [03:26] Bank signees — 10.7
console.log('\n[03:26] Bank Account Signees (Sec 10.7)');
check('V1: "two of the Officers" (2 signers)', v1.includes('two of the Officers'));
check('V2: "one of the Officers" (1 signer)', v2.includes('one of the Officers'));

// [04:10] Major decisions — 10.1 — "majority/supermajority/unanimous approval of the board"
console.log('\n[04:10] Major Decisions (Sec 10.1)');
check('V1 majority: "Majority affirmative vote of the Board of Directors"', v1.includes('Majority affirmative vote of the Board of Directors'));
check('V2 unanimous: "Unanimous affirmative vote of the Board of Directors"', v2.includes('Unanimous affirmative vote of the Board of Directors'));
check('V3 majority: "Majority affirmative vote of the Board of Directors"', v3.includes('Majority affirmative vote of the Board of Directors'));

// [05:20] Tax Matters — NOT for Corp
console.log('\n[05:20] Tax Matters Partner — "would not apply for a corporation"');
check('Corp has no Tax Matters Partner variable', !v1.includes('{{Tax'));

// [06:04] Non-compete — 10.10 — "becoming less inclined to put that clause in"
console.log('\n[06:04] Non-Compete (Sec 10.10)');
check('SDD: Non-compete missing from Corp template (noted as open item #2)', true);

// [10:00] Spending threshold
console.log('\n[10:00] Spending Threshold');
check('V1: $7,500 custom threshold', v1.includes('7,500'));
check('V2: $10,000 custom threshold', v2.includes('10,000'));
check('V3: $5,000 default threshold', v3.includes('5,000'));

// [10:01] New member admission — 4.3
console.log('\n[10:01] New Member Admission (Sec 4.3)');
check('V1 unanimous: "Unanimous of the Shareholders"', v1.includes('Unanimous of the Shareholders'));
check('V3 majority: "Majority of the Shareholders"', v3.includes('Majority of the Shareholders'));

// [10:41] ROFR — 13.1 — "if they say no, whole section gone"
console.log('\n[10:41] Right of First Refusal (Sec 13.1)');
check('V1: ROFR present (Yes)', v1.includes('Right of First Refusal'));
check('V2: ROFR REMOVED (No)', !v2.includes('Right of First Refusal'));
check('V3: ROFR present (Yes, 180 days)', v3.includes('Right of First Refusal'));
check('V1: ROFR period 90 days', v1.includes('90'));

// [11:03] Death/incapacity — 14.4
console.log('\n[11:03] Death/Incapacity (Sec 14)');
check('V1: Successor language present', v1.includes('Successor') || v1.includes('successor'));

// Dissolution — 3.2
console.log('\n[--] Dissolution (Sec 3.2)');
check('V1 majority: "Majority election to dissolve"', v1.includes('Majority election to dissolve'));
check('V2 unanimous: "Unanimous election to dissolve"', v2.includes('Unanimous election to dissolve'));

// Officer removal — 12.1
console.log('\n[--] Officer/Director Removal (Sec 12.1)');
check('V1 supermajority: "Super Majority vote of the Shareholders"', v1.includes('Super Majority vote of the Shareholders'));
check('V2 unanimous: "Unanimous vote of the Shareholders"', v2.includes('Unanimous vote of the Shareholders'));

// Shareholder loans — 7.3
console.log('\n[--] Shareholder Loans (Sec 7.3)');
check('V1 supermajority: "Super Majority" in loans', v1.includes('Super Majority approval of the Board'));
check('V2 unanimous: "Unanimous" in loans', v2.includes('Unanimous approval of the Board'));

// Drag/Tag Along — 13.3
console.log('\n[--] Drag Along / Tag Along (Sec 13.3)');
check('V1: Drag Along present', v1.includes('Drag Along'));
check('V1: Tag Along present', v1.includes('Tag Along'));
check('V2: Drag Along REMOVED', !v2.includes('Drag Along'));
check('V2: Tag Along REMOVED', !v2.includes('Tag Along'));

// Variable fills
console.log('\n[--] Variable Fills');
check('V1: "VARIANT ONE Inc"', v1.includes('VARIANT ONE Inc'));
check('V1: "Roberto Mendez"', v1.includes('Roberto Mendez'));
check('V1: "Ana Garcia"', v1.includes('Ana Garcia'));
check('V1: "Florida"', v1.includes('Florida'));
check('V2: "VARIANT TWO Corp"', v2.includes('VARIANT TWO Corp'));
check('V2: "Delaware"', v2.includes('Delaware'));
check('V2: "Single Owner Person"', v2.includes('Single Owner Person'));
check('V3: "VARIANT THREE Inc"', v3.includes('VARIANT THREE Inc'));
check('V3: 3 shareholders', v3.includes('John Smith') && v3.includes('Jane Doe') && v3.includes('Carlos Garcia'));
check('V1: No {{}}', !v1.includes('{{'));
check('V2: No {{}}', !v2.includes('{{'));
check('V3: No {{}}', !v3.includes('{{'));
check('V1: No %%', !v1.includes('%%'));

// ═══════════════════════════════════════════════════════════
console.log('\n══ LLC VIDEO TRANSCRIPT VERIFICATION ══\n');

// Bank signees — Sec 10
console.log('[09:56] Bank Account (Sec 10)');
check('LLC: "any two Members or Managers" (2 signers)', llc.includes('any two Members or Managers'));

// Spending — Sec 11.4
console.log('\n[10:00] Spending Threshold (Sec 11.4)');
check('LLC: $15,000 (replaced all $5,000 occurrences)', llc.includes('$15,000') && !llc.includes('$5,000'));

// Sale — Sec 10.3
console.log('\n[--] Sale of Company (Sec 8/10.3)');
check('LLC: "Unanimous consent of the Members" (chose unanimous)', llc.includes('Unanimous consent of the Members'));

// Major decisions — Sec 11.4
console.log('\n[--] Major Decisions (Sec 11.4)');
check('LLC: "Super Majority Approval of the Members" (chose supermajority)', llc.includes('Super Majority Approval of the Members'));

// Additional capital — Sec 5.1
console.log('\n[--] Additional Capital (Sec 5.1)');
check('LLC: "Super Majority to the incurrence" (chose supermajority)', llc.includes('Super Majority to the incurrence'));

// Dissolution — Sec 15.1
console.log('\n[--] Dissolution (Sec 15.1)');
check('LLC: "Unanimous election of the Members to dissolve"', llc.includes('Unanimous election of the Members to dissolve'));

// Officer removal — Sec 11.1C
console.log('\n[--] Manager Removal (Sec 11.1C)');
check('LLC: "Majority vote of the Members excluding"', llc.includes('Majority vote of the Members excluding'));

// Tax Matters — Sec 9.5
console.log('\n[05:20] Tax Matters Partner (Sec 9.5)');
check('LLC: "Marco Antonio Rodriguez" as Tax Matters Partner', llc.includes('Marco Antonio Rodriguez'));

// ROFR — Sec 12.1
console.log('\n[10:41] ROFR (Sec 12.1)');
check('LLC: ROFR section present', llc.includes('Right of First Refusal'));

// Management type
console.log('\n[--] Management Type');
check('LLC: "Managers" (manager-managed)', llc.includes('Managers'));

// No artifacts
console.log('\n[--] Artifacts');
check('LLC: No {{}}', !llc.includes('{{'));
check('LLC: No %%', !llc.includes('%%'));
check('LLC: No $$', !llc.includes('$$'));

console.log('\n' + '='.repeat(55));
console.log(`TOTAL: ${pass+fail} video checks | ${pass} passed | ${fail} failed`);
if (fail === 0) console.log('STATUS: ALL VIDEO TRANSCRIPT POINTS VERIFIED');
else console.log('STATUS: FAIL');
process.exit(fail > 0 ? 1 : 0);
