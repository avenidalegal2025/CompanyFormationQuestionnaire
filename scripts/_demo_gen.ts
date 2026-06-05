import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";
import { generateDocument } from "../src/lib/agreement-docgen";
const env=readFileSync(".env.local","utf8");const c=(k:string)=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].replace(/\r$/,"").trim().replace(/^["']|["']$/g,""):"";};
const ddb=DynamoDBDocumentClient.from(new DynamoDBClient({region:c("AWS_REGION")||"us-west-1",credentials:{accessKeyId:c("AWS_ACCESS_KEY_ID"),secretAccessKey:c("AWS_SECRET_ACCESS_KEY")}}));
const TABLE=c("DYNAMO_TABLE");
const DIR="Downloads/avenida-demo-2026-05-26/";mkdirSync(DIR,{recursive:true});
const DOCS=[
 {label:"A_LLC_6owner_WITH_rofr_da_ta", email:"trimaran.llc+pfx9u524b@gmail.com"},
 {label:"B_LLC_1owner_WITHOUT",         email:"trimaran.llc+pfx6u524d@gmail.com"},
 {label:"C_Corp_2owner_WITH_rofr_da_ta",email:"trimaran.llc+pfx20u524c@gmail.com"},
 {label:"D_Corp_3owner_WITHOUT",        email:"trimaran.llc+pfx18u524b@gmail.com"},
];
(async()=>{
 for(const d of DOCS){
  const r=await ddb.send(new GetCommand({TableName:TABLE,Key:{pk:d.email.toLowerCase(),sk:"DOMAINS"},ProjectionExpression:"formData"}));
  const fd:any=r.Item?.formData;
  if(!fd){console.log(d.label,"NO PAYLOAD");continue;}
  // write the full payload JSON (the demo "input")
  writeFileSync(DIR+d.label+".payload.json", JSON.stringify(fd,null,2));
  // generate the doc via the real prod transform (current HEAD)
  const ans:any=await mapFormToDocgenAnswers(fd as any);
  const buf=(await generateDocument(ans)).buffer;
  writeFileSync(DIR+d.label+".docx", buf);
  const ag=fd.agreement||{};const isCorp=/Corp/.test(fd.company?.entityType||"");
  const owners=Object.keys(fd.owners||{}).sort((a,b)=>+a-+b).map(k=>fd.owners[k]);
  console.log(`\n### ${d.label} (${fd.company?.companyName}) — ${buf.length}b`);
  console.log(`  entity=${fd.company?.entityType} owners=${owners.length} [${owners.map((o:any)=>o.ownershipPercentage).join(",")}]`);
  console.log(`  voting(major)=${isCorp?ag.corp_majorDecisionThreshold:ag.llc_majorDecisions} | NC=${isCorp?ag.corp_nonCompete:ag.llc_nonCompete} NS=${isCorp?ag.corp_nonSolicitation:ag.llc_nonSolicitation} Conf=${isCorp?ag.corp_confidentiality:ag.llc_confidentiality}`);
  console.log(`  RoFR=${isCorp?ag.corp_rofr:ag.llc_rofr} | tagDrag=${isCorp?ag.corp_tagDragRights:ag.llc_tagDragRights}`);
  console.log(`  owners: ${owners.map((o:any)=>o.fullName).join(", ")}`);
 }
 console.log("\nSaved payloads+docx to "+DIR);
})();
