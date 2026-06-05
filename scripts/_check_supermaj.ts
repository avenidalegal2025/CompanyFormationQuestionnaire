import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
import { inflateRawSync } from "node:zlib";
const SP:any={majority:"Mayoría",supermajority:"Supermayoría",unanimous:"Decisión Unánime"};
function llcFD(v:any){const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",
  llc_companySaleDecision:SP[v.sale],llc_bankSigners:"Dos firmantes",llc_majorDecisions:SP[v.major],llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:SP[v.removal],llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:"Roberto Mendez",llc_minTaxDistribution:30,llc_rofr:"No",llc_rofrOfferPeriod:180,llc_tagDragRights:"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:SP[v.dissolution],llc_newMembersAdmission:SP[v.newMember],llc_newPartnersAdmission:SP[v.newMember],llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:SP[v.capital],llc_memberLoans:"Yes",llc_memberLoansVoting:SP[v.loans],llc_capitalContributions_0:"50000",llc_capitalContributions_1:"50000"};
  return {company:{entityType:"LLC",companyName:"SM LLC",companyNameBase:"SM LLC",entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:2,owners:{"0":{fullName:"Roberto Mendez",firstName:"Roberto",lastName:"Mendez",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"},"1":{fullName:"Ana Garcia",firstName:"Ana",lastName:"Garcia",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"}},admin:{managersAllOwners:"Yes"},agreement:a};}
function corpFD(v:any){const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",corp_saleDecisionThreshold:SP[v.sale],corp_bankSigners:"Dos firmantes",corp_majorDecisionThreshold:SP[v.major],corp_majorSpendingThreshold:"7500",corp_officerRemovalVoting:SP[v.removal],corp_nonCompete:"No",corp_nonSolicitation:"No",corp_confidentiality:"No",corp_taxOwner:"Roberto Mendez",corp_rofr:"No",corp_rofrOfferPeriod:90,corp_incapacityHeirsPolicy:"Yes",corp_divorceBuyoutPolicy:"Yes",corp_tagDragRights:"No",corp_newShareholdersAdmission:SP[v.newMember],corp_moreCapitalProcess:"Sí, Pro-Rata",corp_moreCapitalDecision:SP[v.capital],corp_shareholderLoans:"Yes",corp_shareholderLoansVoting:SP[v.loans]};const admin:any={directorsAllOwners:"Yes",officersAllOwners:"Yes",shareholderOfficer1Role:"President",shareholderOfficer2Role:"Treasurer"};
  return {company:{entityType:"C-Corp",companyName:"SM Corp",companyNameBase:"SM Corp",entitySuffix:"Inc.",hasUsAddress:"No",hasUsPhone:"No",state:"Florida",corpType:"Corp"},ownersCount:2,owners:{"0":{fullName:"Roberto Mendez",firstName:"Roberto",lastName:"Mendez",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"},"1":{fullName:"Ana Garcia",firstName:"Ana",lastName:"Garcia",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"}},admin,agreement:a};}
function dx(buf:Buffer){const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ds=lho+30+buf.readUInt16LE(lho+26)+buf.readUInt16LE(lho+28);const csz=buf.readUInt32LE(o+20),cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
function paras(xml:string){return xml.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").replace(/\s+/g," ").trim()).filter(Boolean);}
function contiguous(ps:string[],art:number){const subs:number[]=[];for(const p of ps){const m=p.match(new RegExp("^"+art+"\\.(\\d{1,2})(?!\\d)(?!\\s*%)"));if(m)subs.push(+m[1]);}const u=[...new Set(subs)].sort((a,b)=>a-b);let issue="";for(let i=1;i<u.length;i++)if(u[i]!==u[i-1]+1)issue+=`gap ${art}.${u[i-1]}->${art}.${u[i]} `;if(u.length!==subs.length)issue+="DUP ";return issue||"ok ["+u.join(",")+"]";}
const all=(x:string)=>({sale:x,major:x,newMember:x,dissolution:x,removal:x,loans:x,capital:x});
(async()=>{
 const cases:[string,any,string][]=[
   ["LLC all-unanimous (SM should be ABSENT)", llcFD(all("unanimous")),"19"],
   ["LLC all-majority  (SM ABSENT)", llcFD(all("majority")),"19"],
   ["LLC all-supermajority (SM PRESENT)", llcFD(all("supermajority")),"19"],
   ["LLC mixed w/ sale=supermaj (SM PRESENT)", llcFD({...all("majority"),sale:"supermajority"}),"19"],
   ["LLC mixed no supermaj (SM ABSENT)", llcFD({sale:"majority",major:"unanimous",newMember:"unanimous",dissolution:"majority",removal:"unanimous",loans:"majority",capital:"majority"}),"19"],
   ["Corp all-unanimous (SM ABSENT)", corpFD(all("unanimous")),"1"],
   ["Corp all-supermajority (SM PRESENT)", corpFD(all("supermajority")),"1"],
   ["Corp mixed no supermaj (SM ABSENT)", corpFD({sale:"majority",major:"unanimous",newMember:"unanimous",dissolution:"majority",removal:"majority",loans:"majority",capital:"unanimous"}),"1"],
 ];
 for(const [label,fd,art] of cases){
   const ps=paras(dx((await generateDocument(await mapFormToDocgenAnswers(fd as any))).buffer));
   const sm=ps.some(p=>/Super Majority Defined|1\.7 Super Majority|Super Majority\. Shareholders/.test(p));
   const maj=ps.some(p=>/Majority Defined|1\.6 Majority|Majority\. Shareholders/.test(p));
   console.log(`${label}\n   SuperMajority-def=${sm} | Majority-def=${maj} | §${art} numbering=${contiguous(ps,+art)}`);
 }
})();
