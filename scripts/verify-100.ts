/**
 * 100-variant format + mapping + Antonio-transcript-rule checker.
 * Generates ids 101-200 with the deployed docgen and asserts:
 *   - mapping: owners(+%), voting, covenants, rofr, drag/tag, mgrs/dirs/officers
 *   - numbering contiguity: per article §N.M is 1..k with NO gap and NO dup
 *   - conditional removal (Antonio): rofr=No && drag/tag=No → the transfer-RoFR
 *     AND drag/tag content gone, numbering still contiguous (no orphan §X.X)
 *   - grammar: no bare "by Unanimous"/"The Unanimous of"/"Unanimous Selling"
 *   - labels: no paragraph-leading "(i)" (must be dotted "i.")
 */
import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
const NON_OWNER_NAMES = ["Daniel Vega","Patricia Soto","Luis Herrera","Carmen Rios","Andres Castillo","Gabriela Ortiz","Hernan Salas"];
const OFFICER_ROLES = ["President","Vice-President","Secretary","Treasurer","Assistant Vice-President","Assistant Secretary"];
const splitName = (f: string) => ({ firstName: f.split(" ")[0], lastName: f.split(" ").slice(1).join(" "), fullName: f });
const votingProfile = (v: string): any => (({
  unanimous:{sale:"Decisión Unánime",major:"Decisión Unánime",newMember:"Decisión Unánime",dissolution:"Decisión Unánime",removal:"Decisión Unánime",loans:"Decisión Unánime",capital:"Decisión Unánime"},
  majority:{sale:"Mayoría",major:"Mayoría",newMember:"Mayoría",dissolution:"Mayoría",removal:"Mayoría",loans:"Mayoría",capital:"Mayoría"},
  supermajority:{sale:"Supermayoría",major:"Supermayoría",newMember:"Supermayoría",dissolution:"Supermayoría",removal:"Supermayoría",loans:"Supermayoría",capital:"Supermayoría"},
  mixed:{sale:"Supermayoría",major:"Mayoría",newMember:"Decisión Unánime",dissolution:"Mayoría",removal:"Supermayoría",loans:"Mayoría",capital:"Supermayoría"},
} as any)[v]);
const ownerArray = (n: number) => { const pct=Math.floor(100/n); return Array.from({length:n},(_,i)=>({fullName:NAMES[i],firstName:NAMES[i].split(" ")[0],lastName:NAMES[i].split(" ").slice(1).join(" "),ownership:i===n-1?100-pct*(n-1):pct})); };

// ── generateMoreVariants (verbatim port from e2e-uat-edge-variants.mjs) ──
function variantRng(id: number){let s=(id^0x9E3779B9)>>>0;return()=>{s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function weightedPick(rand:()=>number,pairs:[any,number][]){const total=pairs.reduce((s,p)=>s+p[1],0);let r=rand()*total;for(const[val,w]of pairs){r-=w;if(r<=0)return val;}return pairs[pairs.length-1][0];}
function generateMoreVariants(){
  const cov8=[["No","No","No"],["No","No","Yes"],["No","Yes","No"],["No","Yes","Yes"],["Yes","No","No"],["Yes","No","Yes"],["Yes","Yes","No"],["Yes","Yes","Yes"]];
  const banks=["two","one"],dists=["Trimestral","Anual","Semestral","Discreción de la Junta"],moreCaps=["Pro-Rata","No"];
  const out:any[]=[];let id=101;
  for(let i=0;i<400;i++){const rand=variantRng(id);
    const own=weightedPick(rand,[[1,30],[2,30],[3,20],[4,10],[5,5],[6,5]]);
    const entity=weightedPick(rand,[["LLC",55],["C-Corp",45]]);const isCorp=entity==="C-Corp";
    const voting=weightedPick(rand,[["majority",40],["unanimous",25],["supermajority",20],["mixed",15]]);
    const[nc,ns,conf]=cov8[Math.floor(rand()*8)];const rofr=rand()<0.55;const dragTag=rand()<0.45;
    const bank=banks[Math.floor(rand()*2)];const distFreq=dists[Math.floor(rand()*4)];const moreCapital=moreCaps[Math.floor(rand()*2)];
    const loans=rand()<0.7,incapacityHeirs=rand()<0.7,divorceBuyout=rand()<0.75;
    let directorsAllOwners="Yes",directorsCount;
    if(isCorp){const m=weightedPick(rand,[["allOwners",50],["soleDirector",25],["extraDirectors",15],["twoDirectors",10]]);if(m==="allOwners")directorsAllOwners="Yes";else if(m==="soleDirector"){directorsAllOwners="No";directorsCount=1;}else if(m==="twoDirectors"){directorsAllOwners="No";directorsCount=2;}else{directorsAllOwners="No";directorsCount=Math.min(own+1,7);}}
    let officersAllOwners="Yes",officersCount;
    if(isCorp){const o=weightedPick(rand,[["allOwners",50],["singleFounder",20],["twoOfficers",15],["externalTeam",15]]);if(o==="allOwners")officersAllOwners="Yes";else if(o==="singleFounder"){officersAllOwners="No";officersCount=1;}else if(o==="twoOfficers"){officersAllOwners="No";officersCount=2;}else{officersAllOwners="No";officersCount=4;}}
    let managersAllOwners="Yes",managersCount;
    if(!isCorp){const m=weightedPick(rand,[["memberManaged",70],["singleManager",18],["twoManagers",12]]);if(m==="memberManaged")managersAllOwners="Yes";else if(m==="singleManager"){managersAllOwners="No";managersCount=1;}else{managersAllOwners="No";managersCount=2;}}
    out.push({id,entity,ownerCount:own,voting,rofr,drag:dragTag,tag:dragTag,nc,ns,conf,bank,distFreq,moreCapital,loans,incapacityHeirs,divorceBuyout,directorsAllOwners,directorsCount,officersAllOwners,officersCount,managersAllOwners,managersCount,label:`PF${String(id).padStart(3,"0")}`});
    id+=1;}
  return out;
}

function makeAgreementData(v:any):any{const isCorp=v.entity==="C-Corp";const p=votingProfile(v.voting);const bank=v.bank||"two",distFreq=v.distFreq||"Trimestral",moreCapital=v.moreCapital||"Pro-Rata";const loans=v.loans!==undefined?v.loans:true,incH=v.incapacityHeirs!==undefined?v.incapacityHeirs:true,divB=v.divorceBuyout!==undefined?v.divorceBuyout:true;const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:distFreq};const MC=moreCapital==="No"?"No":"Sí, Pro-Rata";
  if(isCorp){Object.assign(a,{corp_saleDecisionThreshold:p.sale,corp_bankSigners:bank==="one"?"Un firmante":"Dos firmantes",corp_majorDecisionThreshold:p.major,corp_majorSpendingThreshold:"7500",corp_officerRemovalVoting:p.removal,corp_nonCompete:v.nc,corp_nonSolicitation:v.ns,corp_confidentiality:v.conf,corp_taxOwner:NAMES[0],corp_rofr:v.rofr?"Yes":"No",corp_rofrOfferPeriod:90,corp_incapacityHeirsPolicy:incH?"Yes":"No",corp_divorceBuyoutPolicy:divB?"Yes":"No",corp_tagDragRights:(v.drag||v.tag)?"Yes":"No",corp_newShareholdersAdmission:p.newMember,corp_moreCapitalProcess:MC,corp_moreCapitalDecision:p.capital,corp_shareholderLoans:loans?"Yes":"No",corp_shareholderLoansVoting:p.loans});for(let i=0;i<v.ownerCount;i++)a[`corp_capitalPerOwner_${i}`]="50000";}
  else{Object.assign(a,{llc_companySaleDecision:p.sale,llc_bankSigners:bank==="one"?"Un firmante":"Dos firmantes",llc_majorDecisions:p.major,llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:p.removal,llc_nonCompete:v.nc,llc_nonSolicitation:v.ns,llc_confidentiality:v.conf,llc_nonDisparagement:"Yes",llc_taxPartner:NAMES[0],llc_minTaxDistribution:30,llc_rofr:v.rofr?"Yes":"No",llc_rofrOfferPeriod:180,llc_tagDragRights:(v.drag||v.tag)?"Yes":"No",llc_incapacityHeirsPolicy:incH?"Yes":"No",llc_dissolutionDecision:p.dissolution,llc_newMembersAdmission:p.newMember,llc_newPartnersAdmission:p.newMember,llc_managingMembers:"Yes",llc_additionalContributions:MC,llc_additionalContributionsDecision:p.capital,llc_memberLoans:loans?"Yes":"No",llc_memberLoansVoting:p.loans});for(let i=0;i<v.ownerCount;i++)a[`llc_capitalContributions_${i}`]="50000";}
  return a;}
function makeAdminData(v:any):any{const isCorp=v.entity==="C-Corp";
  if(!isCorp){const mAO=v.managersAllOwners||"Yes";if(mAO==="Yes")return{managersAllOwners:"Yes"};const mc=v.managersCount||1;const out:any={managersAllOwners:"No",managersCount:mc};for(let i=0;i<mc;i++){const{firstName,lastName,fullName}=splitName(NON_OWNER_NAMES[i]);out[`manager${i+1}FirstName`]=firstName;out[`manager${i+1}LastName`]=lastName;out[`manager${i+1}Name`]=fullName;}return out;}
  const out:any={};const dAO=v.directorsAllOwners||"Yes";out.directorsAllOwners=dAO;
  if(dAO==="No"){const dc=v.directorsCount||1;out.directorsCount=dc;for(let i=0;i<dc;i++){const useOwner=dc>v.ownerCount&&i<v.ownerCount;const nm=useOwner?NAMES[i]:NON_OWNER_NAMES[i%NON_OWNER_NAMES.length];const{firstName,lastName,fullName}=splitName(nm);out[`director${i+1}FirstName`]=firstName;out[`director${i+1}LastName`]=lastName;out[`director${i+1}Name`]=fullName;}}
  const oAO=v.officersAllOwners||"Yes";out.officersAllOwners=oAO;
  if(oAO==="Yes"){OFFICER_ROLES.slice(0,v.ownerCount).forEach((r,i)=>out[`shareholderOfficer${i+1}Role`]=r);}
  else{const oc=v.officersCount||1;out.officersCount=oc;const rfc:any={1:["President"],2:["President","Treasurer"],4:["President","Vice-President","Secretary","Treasurer"]};const roles=rfc[oc]||OFFICER_ROLES.slice(0,oc);for(let i=0;i<oc;i++){const{firstName,lastName,fullName}=splitName(NON_OWNER_NAMES[i%NON_OWNER_NAMES.length]);out[`officer${i+1}FirstName`]=firstName;out[`officer${i+1}LastName`]=lastName;out[`officer${i+1}Name`]=fullName;out[`officer${i+1}Role`]=roles[i]||OFFICER_ROLES[i%OFFICER_ROLES.length];}}
  return out;}
function buildFormData(v:any){const isCorp=v.entity==="C-Corp";const owners=ownerArray(v.ownerCount);return{company:{entityType:v.entity,companyName:`${v.label} ${isCorp?"Corp":"LLC"}`,companyNameBase:`${v.label} ${isCorp?"Corp":"LLC"}`,entitySuffix:isCorp?"Inc.":"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida",...(isCorp?{corpType:"Corp"}:{})},ownersCount:v.ownerCount,owners:Object.fromEntries(owners.map((o,i)=>[String(i),{...o,ownershipPercentage:o.ownership,ownerType:"persona",isUsCitizen:"No"}])),admin:makeAdminData(v),agreement:makeAgreementData(v)};}

function docXml(buf:Buffer):string{const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?zlib.inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
function paraTexts(xml:string):string[]{return xml.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").trim()).filter(Boolean);}
const votingWord=(sp:string)=>({Mayoría:"Majority",Supermayoría:"Super Majority","Decisión Unánime":"Unanimous"} as any)[sp];

// numbering contiguity from paragraph-leading §N.M headings
function numberingIssues(ps:string[]):string[]{
  const byArt:Record<number,number[]>={} as any;
  for(const t of ps){const m=t.match(/^\s*(\d{1,2})\.(\d{1,2})(?!\d)[\s. A-Z(]/);if(!m)continue;const art=+m[1],sub=+m[2];if(art<1||art>40)continue;(byArt[art]=byArt[art]||[]).push(sub);}
  const issues:string[]=[];
  for(const art of Object.keys(byArt).map(Number).sort((a,b)=>a-b)){
    const subs=byArt[art];const seen=new Set<number>();const dups=new Set<number>();
    for(const s of subs){if(seen.has(s))dups.add(s);seen.add(s);}
    if(dups.size)issues.push(`§${art}: DUP ${[...dups].map(d=>`${art}.${d}`).join(",")}`);
    const uniq=[...seen].sort((a,b)=>a-b);
    for(let i=1;i<uniq.length;i++){if(uniq[i]!==uniq[i-1]+1)issues.push(`§${art}: GAP ${art}.${uniq[i-1]}→${art}.${uniq[i]}`);}
  }
  return issues;
}

async function main(){
  const all=generateMoreVariants().filter(v=>v.id>=101&&v.id<=200);
  let mapFails=0,numFails=0,condFails=0,gramFails=0,labelFails=0;
  const failLog:string[]=[];
  for(const v of all){
    const ans:any=await mapFormToDocgenAnswers(buildFormData(v) as any);
    const buf=(await generateDocument(ans)).buffer;
    const xml=docXml(buf);const ps=paraTexts(xml);const t=ps.join("\n");const isCorp=v.entity==="C-Corp";
    const owners=ownerArray(v.ownerCount);const F:string[]=[];
    // mapping
    for(const o of owners) if(!t.includes(o.fullName)) F.push(`MAP owner missing ${o.fullName}`);
    if(!isCorp) for(const o of owners) if(!t.includes(`${o.ownership}% of the MPI`)) F.push(`MAP MPI% ${o.fullName}=${o.ownership}`);
    const wantMajor=votingWord(votingProfile(v.voting).major); if(!t.includes(wantMajor)) F.push(`MAP voting ${wantMajor}`);
    const ncRe=isCorp?/covenant against competition/i:/non-?competition/i; if(ncRe.test(t)!==(v.nc==="Yes")) F.push(`MAP non-compete want=${v.nc}`);
    if(/non-?solicitation/i.test(t)!==(v.ns==="Yes")) F.push(`MAP non-solicit want=${v.ns}`);
    if(!/confidential/i.test(t)) F.push(`MAP confidentiality (always-on) MISSING`);
    const wantDT=!!(v.drag||v.tag); if(/drag.?along/i.test(t)!==wantDT) F.push(`MAP drag want=${wantDT}`); if(/tag.?along/i.test(t)!==wantDT) F.push(`MAP tag want=${wantDT}`);
    const transferRofr=/\d+\.\d+\s*Right of First Refusal/i.test(t); if(transferRofr!==v.rofr) F.push(`MAP RoFR want=${v.rofr}`);
    const mapF=F.length; mapFails+=mapF;
    // numbering contiguity
    const ni=numberingIssues(ps); if(ni.length){numFails++;F.push(`NUM ${ni.join("; ")}`);}
    // conditional removal: no rofr & no drag/tag → no RoFR section, no drag/tag, contiguous
    if(!v.rofr&&!v.drag&&!v.tag){const bad=[];if(transferRofr)bad.push("RoFR present");if(/drag.?along/i.test(t))bad.push("drag present");if(/tag.?along/i.test(t))bad.push("tag present");if(ni.length)bad.push("numbering gap");if(bad.length){condFails++;F.push(`COND(no-rofr/da/ta) ${bad.join(",")}`);}}
    // Antonio rule: when drag/tag off, the WHOLE Approved-Sale section must go —
    // not leave a dangling "(an "Approved Sale"):" intro with no sub-items.
    if(!v.drag&&!v.tag){const orphan=[];if(/an .Approved Sale.\)\s*:/.test(t)||/desire to sell their entire MPI to a third party/i.test(t)) orphan.push("orphaned Approved-Sale intro");if(orphan.length){condFails++;F.push(`COND(orphan) ${orphan.join(",")}`);}}
    // grammar
    const g=[];if(/\bby Unanimous\b(?! (?:vote|consent|decision|approval|election))/.test(t))g.push("bare 'by Unanimous'");if(/\b[Tt]he Unanimous of\b/.test(t))g.push("'The Unanimous of'");if(/Unanimous Selling/.test(t))g.push("'Unanimous Selling'");if(g.length){gramFails++;F.push(`GRAM ${g.join(",")}`);}
    // labels: no paragraph-leading "(i)"
    const leadParen=ps.filter(x=>/^\s*\((?:i{1,3}|iv|v|vi{0,3})\)\s/.test(x)).length; if(leadParen){labelFails++;F.push(`LABEL ${leadParen}x paragraph-leading "(i)"`);}
    if(F.length) failLog.push(`v${v.id} ${v.entity} ${v.ownerCount}o ${v.voting} rofr=${v.rofr} dt=${v.drag} nc=${v.nc} ns=${v.ns}:\n   - ${F.join("\n   - ")}`);
    if(v.id%20===0) console.error(`...processed through v${v.id}`);
  }
  console.log(`\n##### 100-VARIANT RESULTS (ids 101-200) #####`);
  console.log(`mapping-field failures (variants): ${failLog.filter(l=>l.includes("MAP")).length}`);
  console.log(`numbering gap/dup failures: ${numFails}`);
  console.log(`conditional-removal (no rofr/da/ta) failures: ${condFails} / ${all.filter(v=>!v.rofr&&!v.drag&&!v.tag).length} applicable`);
  console.log(`grammar failures: ${gramFails}   label failures: ${labelFails}`);
  console.log(`\nVARIANTS WITH ANY ISSUE: ${failLog.length}/100`);
  for(const l of failLog) console.log("\n"+l);
  if(!failLog.length) console.log("\n✅ ALL 100 CLEAN — mapping, numbering, conditional-removal, grammar, labels.");
}
main().catch(e=>{console.error(e);process.exit(1);});
