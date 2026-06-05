import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
import { writeFileSync } from "fs";
// minimal: build two formData (no-rofr/da/ta vs rofr+dragTag) and inspect headings
const owners3=[{fullName:"Roberto Mendez",firstName:"Roberto",lastName:"Mendez",ownership:33},{fullName:"Ana Garcia",firstName:"Ana",lastName:"Garcia",ownership:33},{fullName:"Carlos Lopez",firstName:"Carlos",lastName:"Lopez",ownership:34}];
function fd(rofr:boolean,dragTag:boolean){return{company:{entityType:"LLC",companyName:"SAN LLC",companyNameBase:"SAN",entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:3,owners:Object.fromEntries(owners3.map((o,i)=>[String(i),{...o,ownershipPercentage:o.ownership,ownerType:"persona",isUsCitizen:"No"}])),admin:{managersAllOwners:"Yes"},agreement:{wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",llc_companySaleDecision:"Mayoría",llc_bankSigners:"Dos firmantes",llc_majorDecisions:"Mayoría",llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:"Mayoría",llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:"Roberto Mendez",llc_minTaxDistribution:30,llc_rofr:rofr?"Yes":"No",llc_rofrOfferPeriod:180,llc_tagDragRights:dragTag?"Yes":"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:"Mayoría",llc_newMembersAdmission:"Mayoría",llc_newPartnersAdmission:"Mayoría",llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:"Mayoría",llc_memberLoans:"Yes",llc_memberLoansVoting:"Mayoría",llc_capitalContributions_0:"50000",llc_capitalContributions_1:"50000",llc_capitalContributions_2:"50000"}};}
function xml(buf:Buffer){const e=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(e+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?zlib.inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
function heads(x:string){return x.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").trim()).filter(t=>/^\s*(1[12])\.\d/.test(t)).map(t=>t.slice(0,40));}
(async()=>{
  for(const[lbl,r,d]of[["NO rofr/da/ta",false,false],["WITH rofr+dragTag",true,true]] as any){
    const buf=(await generateDocument(await mapFormToDocgenAnswers(fd(r,d) as any) as any)).buffer;
    const h=heads(xml(buf));
    console.log(`\n### ${lbl} — §11-12 headings (${h.length}) ###`); h.forEach(x=>console.log("  ",x));
    writeFileSync(`/mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire/Downloads/fidelity/SAN_${r?"R":"x"}${d?"D":"x"}.docx`,buf);
  }
})().catch(e=>{console.error(e);process.exit(1);});
