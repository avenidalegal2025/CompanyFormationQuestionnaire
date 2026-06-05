import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
const t=readFileSync(".env.local","utf8");const c=(k:string)=>{const m=t.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].replace(/\r$/,"").trim().replace(/^["']|["']$/g,""):"";};
const ddb=DynamoDBDocumentClient.from(new DynamoDBClient({region:c("AWS_REGION")||"us-west-1",credentials:{accessKeyId:c("AWS_ACCESS_KEY_ID"),secretAccessKey:c("AWS_SECRET_ACCESS_KEY")}}));
const TABLE=c("DYNAMO_TABLE");
function paras(path:string):string[]{const b=readFileSync(path);let e=-1;for(let i=b.length-22;i>=0;i--){if(b.readUInt32LE(i)===0x06054b50){e=i;break;}}let cd=b.readUInt32LE(e+16);const tot=b.readUInt16LE(e+10);let xml="";for(let k=0;k<tot;k++){const nl=b.readUInt16LE(cd+28),el=b.readUInt16LE(cd+32),cl=b.readUInt16LE(cd+34),lho=b.readUInt32LE(cd+42),m=b.readUInt16LE(cd+10),cs=b.readUInt32LE(cd+20);const nm=b.toString("utf8",cd+46,cd+46+nl);if(nm==="word/document.xml"){const ds=lho+30+b.readUInt16LE(lho+26)+b.readUInt16LE(lho+28);const z=b.subarray(ds,ds+cs);xml=m===0?z.toString("utf8"):inflateRawSync(z).toString("utf8");break;}cd+=46+nl+el+cl;}return xml.split(/<w:p[ >]/).slice(1).map(p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x=>x[1]).join("").replace(/\s+/g," ").trim()).filter(Boolean);}
const DIR="Downloads/e2e-uat-edge-variants/";
const cases=[
 {label:"v9 LLC (payload rofr+dragtag=Yes)",email:"trimaran.llc+pfx9u524b@gmail.com",docx:DIR+"v9_PFX09_LLC_-_Operating_Agreement.docx",rofrKey:"llc_rofr",dtKey:"llc_tagDragRights",sec:12},
 {label:"v6 LLC (payload rofr+dragtag=No)",email:"trimaran.llc+pfx6u524d@gmail.com",docx:DIR+"v6_PFX06_LLC_-_Operating_Agreement.docx",rofrKey:"llc_rofr",dtKey:"llc_tagDragRights",sec:12},
 {label:"v20 Corp (payload rofr+dragtag=Yes)",email:"trimaran.llc+pfx20u524c@gmail.com",docx:DIR+"v20_PFX20_Corp_-_Shareholder_Agreement.docx",rofrKey:"corp_rofr",dtKey:"corp_tagDragRights",sec:13},
 {label:"v18 Corp (payload rofr+dragtag=No)",email:"trimaran.llc+pfx18u524b@gmail.com",docx:DIR+"v18_PFX18_Corp_-_Shareholder_Agreement.docx",rofrKey:"corp_rofr",dtKey:"corp_tagDragRights",sec:13},
];
function contiguous(ps:string[],art:number){const subs:number[]=[];for(const p of ps){const m=p.match(new RegExp("^"+art+"\\.(\\d{1,2})(?!\\d)"));if(m)subs.push(+m[1]);}const u=[...new Set(subs)].sort((a,b)=>a-b);let gap="",dup=subs.length!==u.length;for(let i=1;i<u.length;i++)if(u[i]!==u[i-1]+1)gap+=`${art}.${u[i-1]}->${art}.${u[i]} `;return{list:u,dup,gap};}
(async()=>{
 let fails=0;
 for(const k of cases){
  const r=await ddb.send(new GetCommand({TableName:TABLE,Key:{pk:k.email.toLowerCase(),sk:"DOMAINS"},ProjectionExpression:"formData"}));
  const ag=(r.Item?.formData?.agreement)||{};
  const pRofr=(ag[k.rofrKey]==="Yes"), pDT=(ag[k.dtKey]==="Yes");
  const ps=paras(k.docx);
  const blob=ps.join("\n");
  const oRofr=/Right of First Refusal/.test(blob);
  const oDrag=/Drag Along/.test(blob), oTag=/Tag Along/.test(blob), oApproved=/Approved Sale/.test(blob);
  const orphanApproved=/desire to sell their entire MPI to a third party.*Approved Sale.{0,4}$/m.test(blob)||ps.some(p=>/\(an .Approved Sale.\):?$/.test(p)&&!/Drag Along|Tag Along/.test(p));
  const ct=contiguous(ps,k.sec);
  const a1=pRofr===oRofr, a2=pDT===(oDrag||oTag||oApproved);
  const numOK=!ct.dup&&!ct.gap;
  if(!a1||!a2||!numOK)fails++;
  console.log(`\n=== ${k.label} ===`);
  console.log(`  PAYLOAD: rofr=${pRofr} dragTag=${pDT}`);
  console.log(`  OUTPUT : RoFR-section=${oRofr} | DragAlong=${oDrag} TagAlong=${oTag} ApprovedSale=${oApproved}`);
  console.log(`  §${k.sec}.x = [${ct.list.join(",")}] dup=${ct.dup} gap='${ct.gap}'`);
  console.log(`  ASSERT rofr(payload==output)=${a1?"PASS":"FAIL"} | dragTag(payload==output)=${a2?"PASS":"FAIL"} | numbering=${numOK?"PASS":"FAIL"}`);
 }
 console.log(`\n==== ${fails===0?"ALL PASS":fails+" FAIL"} ====`);
})();
