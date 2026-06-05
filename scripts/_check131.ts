import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
import { inflateRawSync } from "node:zlib";
const SP:any={majority:"Mayoría",supermajority:"Supermayoría",unanimous:"Decisión Unánime"};
function fd(newMember:string,major:string){const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",
  llc_companySaleDecision:SP[major],llc_bankSigners:"Dos firmantes",llc_majorDecisions:SP[major],llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:SP[major],llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:"Roberto Mendez",llc_minTaxDistribution:30,llc_rofr:"No",llc_rofrOfferPeriod:180,llc_tagDragRights:"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:SP[major],llc_newMembersAdmission:SP[newMember],llc_newPartnersAdmission:SP[newMember],llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:SP[major],llc_memberLoans:"Yes",llc_memberLoansVoting:SP[major],llc_capitalContributions_0:"50000",llc_capitalContributions_1:"50000"};
  return {company:{entityType:"LLC",companyName:"NM LLC",companyNameBase:"NM LLC",entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:2,owners:{"0":{fullName:"Roberto Mendez",firstName:"Roberto",lastName:"Mendez",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"},"1":{fullName:"Ana Garcia",firstName:"Ana",lastName:"Garcia",ownershipPercentage:50,ownerType:"persona",isUsCitizen:"No"}},admin:{managersAllOwners:"Yes"},agreement:a};}
function dx(buf:Buffer){const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ds=lho+30+buf.readUInt16LE(lho+26)+buf.readUInt16LE(lho+28);const csz=buf.readUInt32LE(o+20),cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
(async()=>{
  for(const [nm,mj] of [["unanimous","majority"],["majority","unanimous"],["unanimous","unanimous"],["majority","majority"],["supermajority","majority"]] as [string,string][]){
    const xml=dx((await generateDocument(await mapFormToDocgenAnswers(fd(nm,mj) as any))).buffer);
    const ps=xml.replace(/<w:p\b[^>]*>/g,"\n").replace(/<w:tab\b[^>]*\/>/g," ").replace(/<[^>]+>/g,"").split("\n").map(s=>s.trim()).filter(Boolean);
    const p131=ps.find(p=>/^13\.1\b/.test(p))||"";
    const term=(p131.match(/by the (Majority|Super Majority|Unanimous) vote or consent of the existing/)||[])[1]||"??";
    const want=({majority:"Majority",supermajority:"Super Majority",unanimous:"Unanimous"} as any)[nm];
    console.log(`newMember=${nm.padEnd(13)} major=${mj.padEnd(13)} → §13.1 term="${term}"  expect="${want}"  ${term===want?"✅":"❌"}`);
  }
})();
