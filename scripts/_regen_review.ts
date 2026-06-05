import { readFileSync, writeFileSync } from 'fs';
import { mapFormToDocgenAnswers } from '../src/lib/agreement-mapper';
import { generateDocument } from '../src/lib/agreement-docgen';
import zlib from 'node:zlib';
function docText(buf:Buffer){
  // unzip word/document.xml
  const eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06])); const cdOff=buf.readUInt32LE(eocd+16); let o=cdOff;
  while(buf.readUInt32LE(o)===0x02014b50){const cl=buf.readUInt16LE(o+28),el=buf.readUInt16LE(o+30),fl=buf.readUInt16LE(o+32),lho=buf.readUInt32LE(o+42);const name=buf.toString('utf8',o+46,o+46+cl);const ml=buf.readUInt16LE(lho+28);const ds=lho+30+buf.readUInt16LE(lho+26)+ml;const csz=buf.readUInt32LE(o+20);const comp=buf.readUInt16LE(o+10);const raw=buf.subarray(ds,ds+csz);if(name==='word/document.xml'){const xml=(comp===8?zlib.inflateRawSync(raw):raw).toString('utf8');return xml.replace(/<w:t[^>]*>/g,'').replace(/<\/w:t>/g,'').replace(/<[^>]+>/g,'');}o+=46+cl+el+fl;}
  return '';
}
async function main(){
  const files = process.argv.slice(2);
  for(const f of files){
    const p = JSON.parse(readFileSync(f,'utf8')); const fd=p.formData; const a=fd.agreement||{};
    const ans:any = await mapFormToDocgenAnswers(fd);
    const doc = await generateDocument(ans); const t = docText(doc.buffer);
    const id = f.split('/').pop()!.split('_')[0];
    const names=['Roberto','Ana Garcia','Carlos Lopez','Maria','Pedro','Sofia'];
    const ownersShown = names.filter(n=>t.includes(n)).length;
    const dragWant = ans.drag_along, tagWant = ans.tag_along;
    const dragShown = /drag.?along/i.test(t), tagShown=/tag.?along/i.test(t);
    const ncWant = ans.include_noncompete, ncShown=/non-?compete|competition/i.test(t);
    const confWant = ans.include_confidentiality, confShown=/confidential/i.test(t);
    console.log(`\n=== ${id} (${ans.entity_type}) intended owners=${fd.ownersCount} voting(major)=${ans.major_decisions_voting} ===`);
    console.log(`  owners rendered: ${ownersShown}/${fd.ownersCount} ${ownersShown==Number(fd.ownersCount)?'OK':'<<< DROP'}`);
    console.log(`  drag-along: want=${dragWant} shown=${dragShown} ${!!dragWant===dragShown?'OK':'<<< MISMATCH'}`);
    console.log(`  tag-along:  want=${tagWant} shown=${tagShown} ${!!tagWant===tagShown?'OK':'<<< MISMATCH'}`);
    console.log(`  non-compete: want=${ncWant} shown=${ncShown} ${!!ncWant===ncShown?'OK':'<<< MISMATCH'}`);
    console.log(`  confidentiality: want=${confWant} shown=${confShown} ${!!confWant===confShown?'OK':'<<< MISMATCH'}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
