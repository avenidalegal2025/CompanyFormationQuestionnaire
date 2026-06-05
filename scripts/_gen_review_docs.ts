import { readFileSync, writeFileSync } from 'fs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
const OUT='/mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire/Downloads/review-regen';
async function main(){
  for(const f of process.argv.slice(2)){
    const p=JSON.parse(readFileSync(f,'utf8')); const fd=p.formData;
    const ans:any=await mapFormToDocgenAnswers(fd);
    const doc=await generateDocument(ans);
    const id=f.split('/').pop()!.replace('_payload.json','');
    writeFileSync(`${OUT}/${id}.docx`, doc.buffer);
    console.log(`${id}: ${ans.entity_type} owners=${ans.owners_list.length} [${ans.owners_list.map((o:any)=>o.shares_or_percentage+'%').join('/')}] vote=${ans.major_decisions_voting} nc=${ans.include_noncompete} conf=${ans.include_confidentiality} drag=${ans.drag_along} tag=${ans.tag_along} -> ${(doc.buffer.length/1024|0)}KB`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
