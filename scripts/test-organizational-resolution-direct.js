#!/usr/bin/env node
/**
 * Test Organizational Resolution Generation - Direct Lambda Call
 * Bypasses the API and calls Lambda directly with Airtable data
 */

const Airtable = require('airtable');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app8Ggz2miYds1F38';
const AIRTABLE_TABLE_NAME = 'Formations';
const LAMBDA_URL = process.env.LAMBDA_ORGANIZATIONAL_RESOLUTION_URL || 'https://yo54tsr37rcs3kjqsxt2ecvi2y0zjnli.lambda-url.us-west-1.on.aws/';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Map Airtable to Organizational Resolution format (same as Membership Registry)
function mapAirtableToOrganizationalResolution(record) {
  const fields = record.fields || record;
  
  const companyAddress = fields['Company Address'] || '';
  const companyName = fields['Company Name'] || '';
  const formationState = fields['Formation State'] || '';
  
  const paymentDate = fields['Payment Date'];
  let formationDate = '';
  if (paymentDate) {
    const date = new Date(paymentDate);
    if (!isNaN(date.getTime())) {
      formationDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
  }
  if (!formationDate) {
    const now = new Date();
    formationDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  const members = [];
  const ownerCount = fields['Owner Count'] || 0;
  
  for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
    const ownerName = fields[`Owner ${i} Name`] || '';
    if (!ownerName || ownerName.trim() === '') continue;
    
    const ownerAddress = (fields[`Owner ${i} Address`] || '').trim();
    
    members.push({
      name: ownerName.trim(),
      address: ownerAddress,
    });
  }
  
  const managers = [];
  const managerCount = fields['Managers Count'] || 0;
  
  for (let i = 1; i <= Math.min(managerCount, 6); i++) {
    const managerName = fields[`Manager ${i} Name`] || '';
    if (!managerName || managerName.trim() === '') continue;
    
    const managerAddress = (fields[`Manager ${i} Address`] || '').trim();
    
    managers.push({
      name: managerName.trim(),
      address: managerAddress,
    });
  }
  
  return {
    companyName: companyName,
    companyAddress: companyAddress,
    formationState: formationState,
    formationDate: formationDate,
    members: members,
    managers: managers,
    memberCount: members.length,
    managerCount: managers.length,
  };
}

// Get template name
function getOrganizationalResolutionTemplateName(memberCount, managerCount) {
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  const folderName = members === 1
    ? 'Template Organization Resolution_1 Member'
    : `Template Organization Resolution_${members} Members`;
  
  const memberWord = members === 1 ? 'Member' : 'Members';
  const managerWord = managers === 1 ? 'Manager' : 'Managers';
  const fileName = `Template Organization Resolution_${members} ${memberWord}_${managers} ${managerWord}.docx`;
  
  return `llc-formation-templates/organizational-resolution-all-templates/${folderName}/${fileName}`;
}

async function findLLCRecord(recordId) {
  if (recordId) {
    console.log(`🔍 Looking for record: ${recordId}`);
    try {
      const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
      return record;
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return null;
    }
  }

  console.log('🔍 Searching for LLC records...');
  const records = await base(AIRTABLE_TABLE_NAME)
    .select({
      filterByFormula: "{Entity Type} = 'LLC'",
      maxRecords: 5,
      sort: [{ field: 'Payment Date', direction: 'desc' }],
    })
    .all();

  if (records.length === 0) {
    console.error('❌ No LLC records found');
    return null;
  }

  for (const record of records) {
    const owner1Name = record.fields['Owner 1 Name'] || '';
    if (owner1Name) {
      console.log(`✅ Found: ${record.fields['Company Name']} (${record.id})`);
      return record;
    }
  }

  return records[0];
}

async function generateOrganizationalResolution(record) {
  console.log(`\n📋 Company: ${record.fields['Company Name']}`);
  
  const orgResolutionData = mapAirtableToOrganizationalResolution(record);
  console.log(`   Members: ${orgResolutionData.memberCount}, Managers: ${orgResolutionData.managerCount}`);
  
  const templatePath = getOrganizationalResolutionTemplateName(
    orgResolutionData.memberCount,
    orgResolutionData.managerCount
  );
  const templateUrl = `https://company-formation-template-llc-and-inc.s3.us-west-1.amazonaws.com/${templatePath}`;
  
  console.log(`\n📄 Template: ${templatePath}`);
  console.log(`🔗 Template URL: ${templateUrl}`);
  
  const vaultPath = record.fields['Vault Path'] || 
                   (record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const fileName = `organizational-resolution-${(record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-')}.docx`;
  const s3Key = `${vaultPath}/formation/${fileName}`;
  
  console.log(`📁 Destination: s3://avenida-legal-documents/${s3Key}`);
  
  const payload = {
    form_data: orgResolutionData,
    s3_bucket: 'avenida-legal-documents',
    s3_key: s3Key,
    templateUrl: templateUrl,
    return_docx: true,
  };
  
  console.log(`\n📞 Calling Lambda: ${LAMBDA_URL}`);
  
  try {
    const response = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log(`📡 Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      console.log(`✅ Organizational Resolution generated! (${buffer.length} bytes)`);
      console.log(`📁 S3 Key: ${s3Key}`);
      
      // Save document locally
      const fs = require('fs');
      const outputFile = `/tmp/organizational-resolution-${record.id}.docx`;
      fs.writeFileSync(outputFile, buffer);
      console.log(`💾 Saved to: ${outputFile}`);
      console.log(`\n✅ Success! Document generated and saved.`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Error: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  const recordId = process.argv[2];
  
  console.log('🚀 Organizational Resolution Generator (Direct Lambda)\n');
  console.log(`📊 Airtable Base: ${AIRTABLE_BASE_ID}`);
  console.log(`🔗 Lambda URL: ${LAMBDA_URL}\n`);

  const record = await findLLCRecord(recordId);
  
  if (!record) {
    console.error('❌ No record found');
    process.exit(1);
  }

  const success = await generateOrganizationalResolution(record);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
