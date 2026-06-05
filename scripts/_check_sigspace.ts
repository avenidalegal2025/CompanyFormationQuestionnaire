import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
import { inflateRawSync } from "node:zlib";
const N=["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
function fd(n:number){const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",llc_companySaleDecision:"Mayoría",llc_bankSigners:"Dos firmantes",llc_majorDecisions:"Mayoría",llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:"Mayoría",llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:N[0],llc_minTaxDistribution:30,llc_rofr:"No",llc_rofrOfferPeriod:180,llc_tagDragRights:"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:"Mayoría",llc_newMembersAdmission:"Mayoría",llc_newPartnersAdmission:"Mayoría",llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:"Mayoría",llc_memberLoans:"Yes",llc_memberLoansVoting:"Mayoría"};for(let i=0;i<n;i++)a[`llc_capitalContributions_${i}`]="50000";
  const owners:any={};for(let i=0;i<n;i++)owners[String(i)]={fullName:N[i],firstName:N[i].split(" ")[0],lastName:N[i].split(" ").slice(1).join(" "),ownershipPercentage:Math.floor(100/n)+(i===n-1?100-Math.floor(100/n)*n:0),ownerType:"persona",isUsCitizen:"No"};
  return {company:{entityType:"LLC",companyName:"SS LLC",companyNameBase:"SS LLC",entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:n,owners,admin:{managersAllOwners:"Yes"},agreement:a};}
function dx(buf:Buffer){const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));let o=buf.readUInt32LE(eocd+16);while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const nm=buf.toString("utf8",o+46,o+46+cl);const ds=lho+30+buf.readUInt16LE(lho+26)+buf.readUInt16LE(lho+28);const csz=buf.readUInt32LE(o+20),cp=buf.readUInt16LE(o+10);if(nm==="word/document.xml")return(cp===8?inflateRawSync(buf.subarray(ds,ds+csz)):buf.subarray(ds,ds+csz)).toString("utf8");o+=46+cl+el+fl;}return"";}
(async()=>{const xml=dx((await generateDocument(await mapFormToDocgenAnswers(fd(6) as any))).buffer);
  const i=xml.indexOf("IN WITNESS WHEREOF");const seg=xml.substring(i,xml.indexOf("</w:body>",i));
  const ps=[...seg.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(x=>[...x[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join("").trim());
  ps.forEach((t,idx)=>console.log(`P${idx}: ${t?('"'+t.slice(0,38)+'"'):"(empty)"}`));
})();
// (append) also save a docx for visual render
