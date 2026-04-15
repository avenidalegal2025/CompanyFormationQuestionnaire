const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

['DEMO_LLC_Operating_Agreement.docx', 'DEMO_Corp_Shareholder_Agreement.docx'].forEach(file => {
  const content = fs.readFileSync(path.join(process.env.USERPROFILE, 'Downloads', file));
  const zip = new PizZip(content);
  const xml = zip.file('word/document.xml').asText();

  console.log('\n=== ' + file + ' ===');

  // Find orphaned text between closing and opening XML tags
  let idx = 0;
  let issues = 0;
  while (true) {
    const closeP = xml.indexOf('</w:p>', idx);
    if (closeP < 0) break;
    const afterClose = closeP + 6;
    const nextTag = xml.indexOf('<', afterClose);
    if (nextTag > afterClose) {
      const between = xml.substring(afterClose, nextTag).trim();
      if (between.length > 0) {
        issues++;
        console.log('ORPHAN at ' + afterClose + ': "' + between.substring(0, 80) + '"');
      }
    }
    idx = afterClose;
  }

  // Also check </w:r> to next tag
  idx = 0;
  while (true) {
    const closeR = xml.indexOf('</w:r>', idx);
    if (closeR < 0) break;
    const afterClose = closeR + 6;
    const nextTag = xml.indexOf('<', afterClose);
    if (nextTag > afterClose) {
      const between = xml.substring(afterClose, nextTag).trim();
      if (between.length > 0 && !between.startsWith('\n') && !between.startsWith('\r')) {
        issues++;
        console.log('ORPHAN after </w:r> at ' + afterClose + ': "' + between.substring(0, 80) + '"');
      }
    }
    idx = afterClose;
  }

  console.log('Total orphaned text issues:', issues);
});
