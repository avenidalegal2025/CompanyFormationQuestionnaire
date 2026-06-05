import { writeFileSync } from "node:fs";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
const N=["Roberto Mendez","Ana Garcia","Carlos Lopez","Maria Torres","Pedro Ramirez","Sofia Flores"];
(async()=>{
const a:any={wants:"Yes",majorityThreshold:50.01,supermajorityThreshold:75,distributionFrequency:"Trimestral",llc_companySaleDecision:"Mayoría",llc_bankSigners:"Dos firmantes",llc_majorDecisions:"Mayoría",llc_majorSpendingThreshold:"15000",llc_officerRemovalVoting:"Mayoría",llc_nonCompete:"No",llc_nonSolicitation:"No",llc_confidentiality:"No",llc_nonDisparagement:"Yes",llc_taxPartner:N[0],llc_minTaxDistribution:30,llc_rofr:"No",llc_rofrOfferPeriod:180,llc_tagDragRights:"No",llc_incapacityHeirsPolicy:"Yes",llc_dissolutionDecision:"Mayoría",llc_newMembersAdmission:"Mayoría",llc_newPartnersAdmission:"Mayoría",llc_managingMembers:"Yes",llc_additionalContributions:"Sí, Pro-Rata",llc_additionalContributionsDecision:"Mayoría",llc_memberLoans:"Yes",llc_memberLoansVoting:"Mayoría"};
for(let i=0;i<6;i++)a[`llc_capitalContributions_${i}`]="50000";
const owners:any={};for(let i=0;i<6;i++)owners[String(i)]={fullName:N[i],firstName:N[i].split(" ")[0],lastName:N[i].split(" ").slice(1).join(" "),ownershipPercentage:i===5?20:16,ownerType:"persona",isUsCitizen:"No"};
const fd={company:{entityType:"LLC",companyName:"SIGSPACE LLC",companyNameBase:"SIGSPACE LLC",entitySuffix:"LLC",hasUsAddress:"No",hasUsPhone:"No",state:"Florida"},ownersCount:6,owners,admin:{managersAllOwners:"Yes"},agreement:a};
const buf=(await generateDocument(await mapFormToDocgenAnswers(fd as any))).buffer;
writeFileSync("/tmp/sigspace_llc6.docx",buf);console.log("saved",buf.length);
})();
