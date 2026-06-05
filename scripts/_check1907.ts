// Focused check: §19.7/§19.8 definitions glossary across voting choices (LLC).
import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
const splitName = (f: string) => ({ firstName: f.split(" ")[0], lastName: f.split(" ").slice(1).join(" "), fullName: f });
const votingProfile = (v: string): any => (({
  unanimous:{sale:"Decisión Unánime",major:"Decisión Unánime",newMember:"Decisión Unánime",dissolution:"Decisión Unánime",removal:"Decisión Unánime",loans:"Decisión Unánime",capital:"Decisión Unánime"},
  majority:{sale:"Mayoría",major:"Mayoría",newMember:"Mayoría",dissolution:"Mayoría",removal:"Mayoría",loans:"Mayoría",capital:"Mayoría"},
  supermajority:{sale:"Supermayoría",major:"Supermayoría",newMember:"Supermayoría",dissolution:"Supermayoría",removal:"Supermayoría",loans:"Supermayoría",capital:"Supermayoría"},
} as any)[v]);
const ownerArray = (n: number) => { const pct=Math.floor(100/n); return Array.from({length:n},(_,i)=>({fullName:NAMES[i],firstName:NAMES[i].split(" ")[0],lastName:NAMES[i].split(" ").slice(1).join(" "),ownership:i===n-1?100-pct*(n-1):pct})); };
function makeAgreementData(v:any):any{const p=votingProfile(v.voting);const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral"};
  Object.assign(a,{llc_companySaleDecision:p.sale,llc_bankSigners:"Dos firmantes",llc_majorDecisions:p.major,llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:p.removal,llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:NAMES[0],llc_minTaxDistribution:30,llc_rofr:"No",llc_rofrOfferPeriod:180,llc_tagDragRights:"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:p.dissolution,llc_newMembersAdmission:p.newMember,llc_newPartnersAdmission:p.newMember,llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:p.capital,llc_memberLoans:"Yes",llc_memberLoansVoting:p.loans});
  for(let i=0;i<v.ownerCount;i++)a[`llc_capitalContributions_${i}`]="50000";return a;}
function buildFormData(v:any){const owners=ownerArray(v.ownerCount);return{company:{entityType:"LLC",companyName:`${v.label} LLC`,companyNameBase:`${v.label} LLC`,entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:v.ownerCount,owners:Object.fromEntries(owners.map((o,i)=>[String(i),{...o,ownershipPercentage:o.ownership,ownerType:"persona",isUsCitizen:"No"}])),admin:{managersAllOwners:"Yes"},agreement:makeAgreementData(v)};}
function docXml(buf:Buffer):string{const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?zlib.inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
function paraTexts(xml:string):string[]{return xml.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").replace(/\s+/g," ").trim()).filter(Boolean);}

async function main(){
  for(const voting of ["majority","supermajority","unanimous"]){
    const v={entity:"LLC",ownerCount:3,voting,label:`CHK_${voting}`};
    const ans:any=await mapFormToDocgenAnswers(buildFormData(v) as any);
    const xml=docXml((await generateDocument(ans)).buffer);
    const ps=paraTexts(xml);
    console.log(`\n========== voting=${voting} ==========`);
    // print §19.x block
    const idx=ps.findIndex(t=>/19\.7/.test(t)||/Defined\.?$/.test(t)&&/Defined/.test(t));
    const region=ps.filter(t=>/\b(19\.[6-9]|Defined|of the Managers|of Members|Super Majority|Unanimous of)\b/.test(t)).slice(0,8);
    region.forEach(t=>console.log("  | "+t.slice(0,120)));
    // dup-title + grammar checks
    const defTitles=ps.filter(t=>/Defined\.?\s*$/.test(t)||/^(19\.7|19\.8)/.test(t)).map(t=>t.slice(0,60));
    const supDefCount=ps.filter(t=>/Super Majority Defined/.test(t)).length;
    const badGrammar=ps.filter(t=>/\b(Unanimous|Super Majority) of (the Managers|Members)\b/.test(t)&&voting!=="majority"&&voting!=="supermajority"?/\bUnanimous of\b/.test(t):false);
    console.log(`  -- "Super Majority Defined" count = ${supDefCount} (expect 1)`);
    console.log(`  -- has "Unanimous of the/Members" (broken) = ${ps.some(t=>/\bUnanimous of (the Managers|Members)\b/.test(t))}`);
    console.log(`  -- has duplicate-title "Super Majority Defined" at both 19.7 & 19.8 = ${supDefCount>1}`);
  }
  // 6-owner LLC: manager designation join (§11.1.D)
  {
    const v={entity:"LLC",ownerCount:6,voting:"unanimous",label:"CHK6"};
    const ans:any=await mapFormToDocgenAnswers(buildFormData(v) as any);
    const ps=paraTexts(docXml((await generateDocument(ans)).buffer));
    const desig=ps.find(t=>/designate .* to serve as the Managers/.test(t))||"";
    console.log(`\n========== 6-owner LLC §11.1.D manager designation ==========`);
    console.log("  | "+desig.slice(0,260));
    console.log(`  -- has "and X and Y and" run = ${/ and \S+ \S+ and /.test(desig)}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
