import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
const env=readFileSync(".env.local","utf8");const c=(k:string)=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].replace(/\r$/,"").trim().replace(/^["']|["']$/g,""):"";};
const ddb=DynamoDBDocumentClient.from(new DynamoDBClient({region:c("AWS_REGION")||"us-west-1",credentials:{accessKeyId:c("AWS_ACCESS_KEY_ID"),secretAccessKey:c("AWS_SECRET_ACCESS_KEY")}}));
const E="Downloads/e2e-uat-edge-variants/";
const DIRS=["Downloads/avenida-demo-2026-05-26/","/mnt/c/Users/neotr/Downloads/avenida-demo-2026-05-26/"];
DIRS.forEach(d=>mkdirSync(d,{recursive:true}));
const SET=[
 {label:"E_LLC_5owner_mixed_WITH", email:"trimaran.llc+pfx17u526b@gmail.com", prod:"v17_PFX17_LLC_-_Operating_Agreement.docx"},
 {label:"F_Corp_2owner_RoFRonly_NConly", email:"trimaran.llc+pfx25u526b@gmail.com", prod:"v25_PFX25_Corp_-_Shareholder_Agreement.docx"},
 {label:"G_Corp_6owner_DragTagonly", email:"trimaran.llc+pfx16u526b@gmail.com", prod:"v16_PFX16_Corp_-_Shareholder_Agreement.docx"},
];
(async()=>{
 for(const s of SET){
  const r=await ddb.send(new GetCommand({TableName:c("DYNAMO_TABLE"),Key:{pk:s.email.toLowerCase(),sk:"DOMAINS"},ProjectionExpression:"formData"}));
  const fd:any=r.Item?.formData;
  for(const d of DIRS){
    if(fd) writeFileSync(d+s.label+".payload.json", JSON.stringify(fd,null,2));
    copyFileSync(E+s.prod, d+s.label+".LIVE.docx");
  }
  const ag=fd?.agreement||{};const isCorp=/Corp/.test(fd?.company?.entityType||"");
  console.log(`${s.label}: ${fd?.company?.companyName} | rofr=${isCorp?ag.corp_rofr:ag.llc_rofr} dragTag=${isCorp?ag.corp_tagDragRights:ag.llc_tagDragRights} nc=${isCorp?ag.corp_nonCompete:ag.llc_nonCompete} ns=${isCorp?ag.corp_nonSolicitation:ag.llc_nonSolicitation}`);
 }
 console.log("copied + payloads saved to both demo dirs");
})();
