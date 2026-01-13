#!/usr/bin/env node
/**
 * Test Membership Registry Generation - Direct Lambda Call
 * Bypasses the API and calls Lambda directly with Airtable data
 */

const Airtable = require('airtable');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app8Ggz2miYds1F38';
const AIRTABLE_TABLE_NAME = 'Formations';
const LAMBDA_URL = process.env.LAMBDA_MEMBERSHIP_REGISTRY_URL || 'https://zyw2gv6oueycst2ditnylxw3ua0ekvrr.lambda-url.us-west-1.on.aws/';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Map Airtable to Membership Registry format
function mapAirtableToMembershipRegistry(record) {
  const fields = record.fields || record;
  
  // Parse company address
  const companyAddress = fields['Company Address'] || '';
  const companyName = fields['Company Name'] || '';
  const formationState = fields['Formation State'] || '';
  
  // Get formation date
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
  
  // Collect members
  const members = [];
  const ownerCount = fields['Owner Count'] || 0;
  
  for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
    const ownerName = fields[`Owner ${i} Name`] || '';
    if (!ownerName || ownerName.trim() === '') continue;
    
    let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
    if (ownershipPercent < 1 && ownershipPercent > 0) {
      ownershipPercent = ownershipPercent * 100;
    }
    
    const ownerAddress = (fields[`Owner ${i} Address`] || '').trim();
    const ownerSSN = fields[`Owner ${i} SSN`] || '';
    
    members.push({
      name: ownerName.trim(),
      address: ownerAddress,
      ownershipPercent: ownershipPercent,
      ssn: ownerSSN && ownerSSN.toUpperCase() !== 'N/A' && !ownerSSN.toUpperCase().includes('FOREIGN') ? ownerSSN : undefined,
    });
  }
  
  members.sort((a, b) => b.ownershipPercent - a.ownershipPercent);
  
  // Collect managers
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
function getMembershipRegistryTemplateName(memberCount, managerCount) {
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  const folderName = members === 1 
    ? 'membership-registry-1-member'
    : `membership-registry-${members}-members`;
  
  const fileName = `Template Membership Registry_${members} Members_${managers} Manager.docx`;
  
  return `llc-formation-templates/membership-registry-all-templates/${folderName}/${fileName}`;
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

async function generateMembershipRegistry(record) {
  console.log(`\n📋 Company: ${record.fields['Company Name']}`);
  
  const membershipData = mapAirtableToMembershipRegistry(record);
  console.log(`   Members: ${membershipData.memberCount}, Managers: ${membershipData.managerCount}`);
  
  const templatePath = getMembershipRegistryTemplateName(
    membershipData.memberCount,
    membershipData.managerCount
  );
  const templateUrl = `https://company-formation-template-llc-and-inc.s3.us-west-1.amazonaws.com/${templatePath}`;
  
  console.log(`\n📄 Template: ${templatePath}`);
  console.log(`🔗 Template URL: ${templateUrl}`);
  
  const vaultPath = record.fields['Vault Path'] || 
                   (record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const fileName = `membership-registry-${(record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-')}.docx`;
  const s3Key = `${vaultPath}/formation/${fileName}`;
  
  console.log(`📁 Destination: s3://avenida-legal-documents/${s3Key}`);
  
  const payload = {
    form_data: membershipData,
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
      
      console.log(`✅ Membership Registry generated! (${buffer.length} bytes)`);
      console.log(`📁 S3 Key: ${s3Key}`);
      
      // Save document locally
      const fs = require('fs');
      const outputFile = `/tmp/membership-registry-${record.id}.docx`;
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
  
  console.log('🚀 Membership Registry Generator (Direct Lambda)\n');
  console.log(`📊 Airtable Base: ${AIRTABLE_BASE_ID}`);
  console.log(`🔗 Lambda URL: ${LAMBDA_URL}\n`);

  const record = await findLLCRecord(recordId);
  
  if (!record) {
    console.error('❌ No record found');
    process.exit(1);
  }

  const success = await generateMembershipRegistry(record);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
