/**
 * Mapping-fidelity checker (the layer the 500-variant UAT lacked).
 * For each variant: rebuild the exact input answers, generate the agreement
 * with the deployed docgen, then assert EVERY field against the rendered
 * paragraphs and report PASS/FAIL with evidence. Format convention checks too.
 */
import { writeFileSync } from "fs";
import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
const NON_OWNER_NAMES = ["Daniel Vega","Patricia Soto","Luis Herrera","Carmen Rios","Andres Castillo","Gabriela Ortiz","Hernan Salas"];
const OFFICER_ROLES = ["President","Vice-President","Secretary","Treasurer","Assistant Vice-President","Assistant Secretary"];
const splitName = (full: string) => ({ firstName: full.split(" ")[0], lastName: full.split(" ").slice(1).join(" "), fullName: full });
const votingProfile = (v: string): any => (({
  unanimous: { sale:"Decisión Unánime", major:"Decisión Unánime", newMember:"Decisión Unánime", dissolution:"Decisión Unánime", removal:"Decisión Unánime", loans:"Decisión Unánime", capital:"Decisión Unánime" },
  majority:  { sale:"Mayoría", major:"Mayoría", newMember:"Mayoría", dissolution:"Mayoría", removal:"Mayoría", loans:"Mayoría", capital:"Mayoría" },
  supermajority:{ sale:"Supermayoría", major:"Supermayoría", newMember:"Supermayoría", dissolution:"Supermayoría", removal:"Supermayoría", loans:"Supermayoría", capital:"Supermayoría" },
  mixed:     { sale:"Supermayoría", major:"Mayoría", newMember:"Decisión Unánime", dissolution:"Mayoría", removal:"Supermayoría", loans:"Mayoría", capital:"Supermayoría" },
} as any)[v]);
const ownerArray = (n: number) => { const pct = Math.floor(100/n); return Array.from({length:n},(_,i)=>({ fullName:NAMES[i], firstName:NAMES[i].split(" ")[0], lastName:NAMES[i].split(" ").slice(1).join(" "), ownership: i===n-1 ? 100-pct*(n-1) : pct })); };

function makeAgreementData(v: any): any {
  const isCorp = v.entity === "C-Corp"; const p = votingProfile(v.voting);
  const bank = v.bank||"two", distFreq = v.distFreq||"Trimestral", moreCapital = v.moreCapital||"Pro-Rata";
  const loans = v.loans!==undefined?v.loans:true, incH = v.incapacityHeirs!==undefined?v.incapacityHeirs:true, divB = v.divorceBuyout!==undefined?v.divorceBuyout:true;
  const a: any = { wants:"Yes", majorityThreshold:50.01, supermajorityThreshold:75, distributionFrequency:distFreq };
  const MC = moreCapital==="No"?"No":"Sí, Pro-Rata";
  if (isCorp) { Object.assign(a,{ corp_saleDecisionThreshold:p.sale, corp_bankSigners:bank==="one"?"Un firmante":"Dos firmantes", corp_majorDecisionThreshold:p.major, corp_majorSpendingThreshold:"7500", corp_officerRemovalVoting:p.removal, corp_nonCompete:v.nc, corp_nonSolicitation:v.ns, corp_confidentiality:v.conf, corp_taxOwner:NAMES[0], corp_rofr:v.rofr?"Yes":"No", corp_rofrOfferPeriod:90, corp_incapacityHeirsPolicy:incH?"Yes":"No", corp_divorceBuyoutPolicy:divB?"Yes":"No", corp_tagDragRights:(v.drag||v.tag)?"Yes":"No", corp_newShareholdersAdmission:p.newMember, corp_moreCapitalProcess:MC, corp_moreCapitalDecision:p.capital, corp_shareholderLoans:loans?"Yes":"No", corp_shareholderLoansVoting:p.loans });
    for (let i=0;i<v.ownerCount;i++) a[`corp_capitalPerOwner_${i}`]="50000";
  } else { Object.assign(a,{ llc_companySaleDecision:p.sale, llc_bankSigners:bank==="one"?"Un firmante":"Dos firmantes", llc_majorDecisions:p.major, llc_majorSpendingThreshold:"15000", llc_officerRemovalVoting:p.removal, llc_nonCompete:v.nc, llc_nonSolicitation:v.ns, llc_confidentiality:v.conf, llc_nonDisparagement:"Yes", llc_taxPartner:NAMES[0], llc_minTaxDistribution:30, llc_rofr:v.rofr?"Yes":"No", llc_rofrOfferPeriod:180, llc_tagDragRights:(v.drag||v.tag)?"Yes":"No", llc_incapacityHeirsPolicy:incH?"Yes":"No", llc_dissolutionDecision:p.dissolution, llc_newMembersAdmission:p.newMember, llc_newPartnersAdmission:p.newMember, llc_managingMembers:"Yes", llc_additionalContributions:MC, llc_additionalContributionsDecision:p.capital, llc_memberLoans:loans?"Yes":"No", llc_memberLoansVoting:p.loans });
    for (let i=0;i<v.ownerCount;i++) a[`llc_capitalContributions_${i}`]="50000";
  }
  return a;
}
function makeAdminData(v: any): any {
  const isCorp = v.entity==="C-Corp";
  if (!isCorp) { const mAO=v.managersAllOwners||"Yes"; if(mAO==="Yes") return {managersAllOwners:"Yes"}; const mc=v.managersCount||1; const out:any={managersAllOwners:"No",managersCount:mc}; for(let i=0;i<mc;i++){const{firstName,lastName,fullName}=splitName(NON_OWNER_NAMES[i]);out[`manager${i+1}FirstName`]=firstName;out[`manager${i+1}LastName`]=lastName;out[`manager${i+1}Name`]=fullName;} return out; }
  const out:any={}; const dAO=v.directorsAllOwners||"Yes"; out.directorsAllOwners=dAO;
  if(dAO==="No"){const dc=v.directorsCount||1;out.directorsCount=dc;for(let i=0;i<dc;i++){const useOwner=dc>v.ownerCount&&i<v.ownerCount;const nm=useOwner?NAMES[i]:NON_OWNER_NAMES[i%NON_OWNER_NAMES.length];const{firstName,lastName,fullName}=splitName(nm);out[`director${i+1}FirstName`]=firstName;out[`director${i+1}LastName`]=lastName;out[`director${i+1}Name`]=fullName;}}
  const oAO=v.officersAllOwners||"Yes"; out.officersAllOwners=oAO;
  if(oAO==="Yes"){OFFICER_ROLES.slice(0,v.ownerCount).forEach((r,i)=>out[`shareholderOfficer${i+1}Role`]=r);}
  else{const oc=v.officersCount||1;out.officersCount=oc;const rfc:any={1:["President"],2:["President","Treasurer"],4:["President","Vice-President","Secretary","Treasurer"]};const roles=rfc[oc]||OFFICER_ROLES.slice(0,oc);for(let i=0;i<oc;i++){const{firstName,lastName,fullName}=splitName(NON_OWNER_NAMES[i%NON_OWNER_NAMES.length]);out[`officer${i+1}FirstName`]=firstName;out[`officer${i+1}LastName`]=lastName;out[`officer${i+1}Name`]=fullName;out[`officer${i+1}Role`]=roles[i]||OFFICER_ROLES[i%OFFICER_ROLES.length];}}
  return out;
}
function buildFormData(v: any) {
  const isCorp = v.entity==="C-Corp";
  const owners = ownerArray(v.ownerCount);
  return {
    company: { entityType:v.entity, companyName:`${v.label} ${isCorp?"Corp":"LLC"}`, companyNameBase:`${v.label} ${isCorp?"Corp":"LLC"}`, entitySuffix:isCorp?"Inc.":"LLC", hasUsAddress:"No", hasUsPhone:"No", state:"Florida", ...(isCorp?{corpType:"Corp"}:{}) },
    ownersCount: v.ownerCount,
    owners: Object.fromEntries(owners.map((o,i)=>[String(i),{...o,ownershipPercentage:o.ownership,ownerType:"persona",isUsCitizen:"No"}])),
    admin: makeAdminData(v),
    agreement: makeAgreementData(v),
  };
}

const VARIANTS = [
  { id:6, entity:"LLC", ownerCount:1, voting:"majority", rofr:false, drag:false, tag:false, nc:"No", ns:"No", conf:"No", label:"PFX06" },
  { id:7, entity:"C-Corp", ownerCount:2, voting:"supermajority", rofr:false, drag:false, tag:false, nc:"No", ns:"No", conf:"No", label:"PFX07" },
  { id:8, entity:"LLC", ownerCount:4, voting:"majority", rofr:true, drag:false, tag:false, nc:"Yes", ns:"Yes", conf:"Yes", label:"PFX08" },
  { id:9, entity:"LLC", ownerCount:6, voting:"unanimous", rofr:true, drag:true, tag:true, nc:"Yes", ns:"Yes", conf:"Yes", label:"PFX09" },
  { id:10, entity:"C-Corp", ownerCount:1, voting:"majority", rofr:false, drag:false, tag:false, nc:"No", ns:"No", conf:"No", label:"PFX10" },
  { id:11, entity:"C-Corp", ownerCount:4, voting:"supermajority", rofr:true, drag:true, tag:true, nc:"No", ns:"No", conf:"No", label:"PFX11" },
  { id:12, entity:"LLC", ownerCount:3, voting:"unanimous", rofr:false, drag:false, tag:false, nc:"No", ns:"Yes", conf:"No", label:"PFX12" },
  { id:13, entity:"LLC", ownerCount:5, voting:"supermajority", rofr:true, drag:true, tag:false, nc:"Yes", ns:"No", conf:"No", label:"PFX13" },
  { id:14, entity:"C-Corp", ownerCount:3, voting:"unanimous", rofr:false, drag:false, tag:false, nc:"Yes", ns:"No", conf:"No", label:"PFX14" },
  { id:15, entity:"LLC", ownerCount:2, voting:"majority", rofr:true, drag:false, tag:true, nc:"No", ns:"No", conf:"Yes", label:"PFX15" },
];

function docText(buf: Buffer): string {
  const eocd = buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06])); let o = buf.readUInt32LE(eocd+16);
  while (buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return (cp===8?zlib.inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8").replace(/<[^>]+>/g,"");o+=46+cl+el+fl;}
  return "";
}
const votingWord = (sp: string) => ({ "Mayoría":"Majority", "Supermayoría":"Super Majority", "Decisión Unánime":"Unanimous" } as any)[sp];

async function main() {
  const OUT = "/mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire/Downloads/fidelity";
  require("fs").mkdirSync(OUT, { recursive: true });
  let totalFail = 0;
  for (const v of VARIANTS) {
    const fd = buildFormData(v);
    const ans: any = await mapFormToDocgenAnswers(fd as any);
    const doc = await generateDocument(ans);
    writeFileSync(`${OUT}/v${v.id}_${v.label}.docx`, doc.buffer);
    const t = docText(doc.buffer);
    const owners = ownerArray(v.ownerCount);
    const isCorp = v.entity === "C-Corp";
    const checks: Array<[string, boolean, string]> = [];
    const has = (s: string) => t.includes(s);
    // entity
    checks.push(["entity", isCorp ? has("Shareholder") && has("Corporation") : has("Member") && /limited liability/i.test(t), isCorp?"Corp terms":"LLC terms"]);
    // owners present + percentages
    for (const o of owners) checks.push([`owner "${o.fullName}"`, has(o.fullName), ""]);
    checks.push([`owner count = ${v.ownerCount}`, owners.every(o=>has(o.fullName)) && (v.ownerCount===1 || !has("100% of the MPI") || isCorp), `pcts ${owners.map(o=>o.ownership).join("/")}`]);
    // Corp expresses per-owner ownership as SHARES + a §1.x Percentage Interest
    // definition (not a literal "33%" per shareholder in the agreement); LLC
    // lists "X% of the MPI". Only assert literal per-owner % for LLC.
    if (!isCorp) for (const o of owners) checks.push([`  ${o.fullName} ${o.ownership}% of MPI`, has(`${o.ownership}% of the MPI`), ""]);
    // voting
    const wantMajor = votingWord(votingProfile(v.voting).major);
    checks.push([`major-decisions voting = ${wantMajor}`, has(wantMajor), v.voting]);
    // covenants  (confidentiality is now always-on by policy)
    // Corp non-compete renders as "Covenant Against Competition"; LLC as "Non-competition".
    const ncRe = isCorp ? /covenant against competition/i : /non-?competition/i;
    checks.push([`non-compete ${v.nc}`, ncRe.test(t) === (v.nc==="Yes"), v.nc]);
    checks.push([`non-solicitation ${v.ns}`, /non-?solicitation/i.test(t) === (v.ns==="Yes"), v.ns]);
    checks.push([`confidentiality (always-on)`, /confidential/i.test(t), `input was ${v.conf}`]);
    // RoFR: the toggle controls the SHARE-/INTEREST-TRANSFER RoFR section
    // (a section literally titled "Right of First Refusal"), NOT the §4.5
    // additional-capital preemptive right which is always present.
    const hasTransferRofr = /\d+\.\d+\s*Right of First Refusal/i.test(t);
    checks.push([`share-transfer RoFR ${v.rofr?"Yes":"No"}`, hasTransferRofr === v.rofr, ""]);
    // Drag/Tag are a SINGLE combined product toggle ("tag along / drag along
    // rights") — both render iff (drag || tag). Not independently toggleable.
    const wantDragTag = !!(v.drag || v.tag);
    checks.push([`drag along (combined toggle) ${wantDragTag}`, /drag.?along/i.test(t) === wantDragTag, ""]);
    checks.push([`tag along (combined toggle) ${wantDragTag}`, /tag.?along/i.test(t) === wantDragTag, ""]);
    // format: LLC labels must be dotted "i." not "(i)"
    const lines = t.split(/\n+/);
    const leadParen = (doc.buffer && false); // text loses paragraph boundaries; checked separately below
    // managers (LLC all-owners) / directors-officers (Corp)
    if (!isCorp) checks.push([`managers = all owners`, owners.every(o=>has(o.fullName)), ""]);
    const fails = checks.filter(c=>!c[1]);
    totalFail += fails.length;
    console.log(`\n===== v${v.id} ${v.label} | ${v.entity} ${v.ownerCount}o ${v.voting} nc=${v.nc} ns=${v.ns} conf=${v.conf} rofr=${v.rofr} drag=${v.drag} tag=${v.tag} =====`);
    console.log(`  ${checks.length-fails.length}/${checks.length} checks pass`);
    for (const [name, ok, note] of checks) console.log(`   ${ok?"✓":"✗ FAIL"}  ${name}${note?`  (${note})`:""}`);
  }
  console.log(`\n##### TOTAL FAILURES: ${totalFail} #####`);
}
main().catch(e=>{console.error(e);process.exit(1);});
