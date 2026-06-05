// Corp §10.5 directors join + numbering integrity check.
import zlib from "node:zlib";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";

const NAMES = ["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
const NON_OWNER = ["Daniel Vega","Patricia Soto","Luis Herrera","Carmen Rios","Andres Castillo","Gabriela Ortiz"];
const OFFROLES = ["President","Vice-President","Secretary","Treasurer","Assistant Vice-President","Assistant Secretary"];
const split = (f:string)=>({firstName:f.split(" ")[0],lastName:f.split(" ").slice(1).join(" "),fullName:f});
const ownerArray=(n:number)=>{const pct=Math.floor(100/n);return Array.from({length:n},(_,i)=>({fullName:NAMES[i],firstName:NAMES[i].split(" ")[0],lastName:NAMES[i].split(" ").slice(1).join(" "),ownership:i===n-1?100-pct*(n-1):pct}));};
function corpAgreement(n:number){const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral"};Object.assign(a,{corp_saleDecisionThreshold:"Mayoría",corp_bankSigners:"Dos firmantes",corp_majorDecisionThreshold:"Mayoría",corp_majorSpendingThreshold:"7500",corp_officerRemovalVoting:"Mayoría",corp_nonCompete:"No",corp_nonSolicitation:"No",corp_confidentiality:"No",corp_taxOwner:NAMES[0],corp_rofr:"No",corp_rofrOfferPeriod:90,corp_incapacityHeirsPolicy:"Yes",corp_divorceBuyoutPolicy:"Yes",corp_tagDragRights:"No",corp_newShareholdersAdmission:"Mayoría",corp_moreCapitalProcess:"Sí, Pro-Rata",corp_moreCapitalDecision:"Mayoría",corp_shareholderLoans:"Yes",corp_shareholderLoansVoting:"Mayoría"});for(let i=0;i<n;i++)a[`corp_capitalPerOwner_${i}`]="50000";return a;}
function admin(n:number,mode:string){const out:any={};
  if(mode==="allOwners"){out.directorsAllOwners="Yes";}
  else if(mode==="soleDirector"){out.directorsAllOwners="No";out.directorsCount=1;const{firstName,lastName,fullName}=split(NON_OWNER[0]);out.director1FirstName=firstName;out.director1LastName=lastName;out.director1Name=fullName;}
  else if(mode==="threeNonOwner"){out.directorsAllOwners="No";out.directorsCount=3;for(let i=0;i<3;i++){const{firstName,lastName,fullName}=split(NON_OWNER[i]);out[`director${i+1}FirstName`]=firstName;out[`director${i+1}LastName`]=lastName;out[`director${i+1}Name`]=fullName;}}
  out.officersAllOwners="Yes";OFFROLES.slice(0,n).forEach((r,i)=>out[`shareholderOfficer${i+1}Role`]=r);
  return out;}
function buildFormData(n:number,mode:string){const owners=ownerArray(n);return{company:{entityType:"C-Corp",companyName:`DIRCHK Corp`,companyNameBase:"DIRCHK Corp",entitySuffix:"Inc.",hasUsAddress:"No",hasUsPhone:"No",state:"Florida",corpType:"Corp"},ownersCount:n,owners:Object.fromEntries(owners.map((o,i)=>[String(i),{...o,ownershipPercentage:o.ownership,ownerType:"persona",isUsCitizen:"No"}])),admin:admin(n,mode),agreement:corpAgreement(n)};}
function docXml(buf:Buffer):string{const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?zlib.inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
function paraTexts(xml:string):string[]{return xml.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").replace(/\s+/g," ").trim()).filter(Boolean);}

async function main(){
  for(const[n,mode]of[[2,"allOwners"],[3,"allOwners"],[6,"allOwners"],[3,"threeNonOwner"],[3,"soleDirector"]] as [number,string][]){
    const ps=paraTexts(docXml((await generateDocument(await mapFormToDocgenAnswers(buildFormData(n,mode) as any))).buffer));
    const dir=ps.find(t=>/initial Directors shall be/.test(t))||"(none)";
    const off=ps.find(t=>/Officers shall be appointed|10\.6/.test(t));
    // §10.x numbering
    const tens=ps.map(t=>t.match(/^10\.(\d{1,2})\b/)).filter(Boolean).map(m=>+m![1]);
    const seen=new Set<number>(),dups:number[]=[];for(const s of tens){if(seen.has(s))dups.push(s);seen.add(s);}
    console.log(`\n=== ${n}o ${mode} ===`);
    console.log("  §10.5 dir: "+dir.replace(/^.*initial Directors shall be/,"…shall be").slice(0,140));
    console.log("  §10.x subs: ["+[...seen].sort((a,b)=>a-b).join(",")+"]  dups="+JSON.stringify(dups));
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
