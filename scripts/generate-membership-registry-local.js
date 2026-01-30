#!/usr/bin/env node
/**
 * Generate Membership Registry locally using Airtable credentials
 * This bypasses the API and calls the Lambda directly
 */

const Airtable = require('airtable');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const http = require('http');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = 'app8Ggz2miYds1F38';
const AIRTABLE_TABLE_NAME = 'Formations';

// AWS Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const S3_BUCKET = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';
const LAMBDA_MEMBERSHIP_REGISTRY_URL = process.env.LAMBDA_MEMBERSHIP_REGISTRY_URL || '';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Helper function to map Airtable to Membership Registry format
function mapAirtableToMembershipRegistry(record) {
  const fields = record.fields || record;
  const entityType = fields['Entity Type'] || 'LLC';
  
  if (entityType !== 'LLC') {
    throw new Error('Membership Registry is only for LLCs');
  }
  
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

// Get template name based on member/manager counts
function getMembershipRegistryTemplateName(memberCount, managerCount) {
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  const folderName = members === 1 
    ? 'membership-registry-1-member'
    : `membership-registry-${members}-members`;
  
  const fileName = `Template Membership Registry_${members} Members_${managers} Manager.docx`;
  
  return `llc-formation-templates/membership-registry-all-templates/${folderName}/${fileName}`;
}

// Call Lambda function
function callLambda(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = (urlObj.protocol === 'https:' ? https : http).request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ buffer: Buffer.from(body, 'binary') });
          }
        } else {
          reject(new Error(`Lambda returned ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function findLLCRecord(recordId) {
  if (recordId) {
    console.log(`🔍 Looking for specific record: ${recordId}`);
    try {
      const record = await base(AIRTABLE_TABLE_NAME).find(recordId);
      const entityType = record.fields['Entity Type'] || '';
      if (entityType !== 'LLC') {
        console.error(`❌ Record ${recordId} is not an LLC (Entity Type: ${entityType})`);
        return null;
      }
      return record;
    } catch (error) {
      console.error(`❌ Error fetching record ${recordId}:`, error.message);
      return null;
    }
  }

  console.log('🔍 Searching for LLC records in Airtable...');
  const records = await base(AIRTABLE_TABLE_NAME)
    .select({
      filterByFormula: "{Entity Type} = 'LLC'",
      maxRecords: 10,
      sort: [{ field: 'Payment Date', direction: 'desc' }],
    })
    .all();

  if (records.length === 0) {
    console.error('❌ No LLC records found in Airtable');
    return null;
  }

  console.log(`✅ Found ${records.length} LLC record(s)`);
  
  for (const record of records) {
    const owner1Name = record.fields['Owner 1 Name'] || '';
    if (owner1Name) {
      console.log(`📋 Selected record: ${record.id}`);
      console.log(`   Company: ${record.fields['Company Name'] || 'N/A'}`);
      console.log(`   Owner 1: ${owner1Name}`);
      const ownerCount = record.fields['Owner Count'] || 0;
      const managerCount = record.fields['Managers Count'] || 0;
      console.log(`   Owners: ${ownerCount}, Managers: ${managerCount}`);
      return record;
    }
  }

  return records[0];
}

async function main() {
  const recordId = process.argv[2];
  
  console.log('🚀 Membership Registry Generator (Local)\n');
  console.log(`📊 Airtable Base: ${AIRTABLE_BASE_ID}`);
  console.log(`📋 Table: ${AIRTABLE_TABLE_NAME}\n`);

  if (!LAMBDA_MEMBERSHIP_REGISTRY_URL) {
    console.error('❌ LAMBDA_MEMBERSHIP_REGISTRY_URL not set');
    console.error('   Please set it in your environment or .env.local');
    process.exit(1);
  }

  const record = await findLLCRecord(recordId);
  
  if (!record) {
    console.error('❌ No LLC record found to process');
    process.exit(1);
  }

  try {
    console.log('\n📋 Mapping Airtable data to Membership Registry format...');
    const membershipRegistryData = mapAirtableToMembershipRegistry(record);
    
    console.log(`   Company: ${membershipRegistryData.companyName}`);
    console.log(`   Members: ${membershipRegistryData.memberCount}, Managers: ${membershipRegistryData.managerCount}`);
    
    // Get template path
    const templatePath = getMembershipRegistryTemplateName(
      membershipRegistryData.memberCount,
      membershipRegistryData.managerCount
    );
    const templateUrl = `https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${templatePath}`;
    
    console.log(`\n📄 Using template: ${templatePath}`);
    console.log(`🔗 Template URL: ${templateUrl}`);
    
    // Get vault path
    const vaultPath = record.fields['Vault Path'] || 
                     (record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileName = `membership-registry-${(record.fields['Company Name'] || 'Company').toLowerCase().replace(/[^a-z0-9]/g, '-')}.docx`;
    const s3Key = `${vaultPath}/formation/${fileName}`;
    
    console.log(`📁 Destination: s3://${S3_BUCKET}/${s3Key}`);
    
    // Call Lambda
    console.log(`\n📞 Calling Lambda: ${LAMBDA_MEMBERSHIP_REGISTRY_URL}`);
    const lambdaResponse = await callLambda(LAMBDA_MEMBERSHIP_REGISTRY_URL, {
      formData: membershipRegistryData,
      s3Bucket: S3_BUCKET,
      s3Key: s3Key,
      templateUrl: templateUrl,
    });
    
    if (lambdaResponse.buffer) {
      console.log(`✅ Lambda returned document (${lambdaResponse.buffer.length} bytes)`);
      
      // Upload to S3
      console.log(`\n📤 Uploading to S3...`);
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: lambdaResponse.buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }));
      
      console.log(`✅ Uploaded to s3://${S3_BUCKET}/${s3Key}`);
      console.log(`\n✅ Membership Registry generated successfully!`);
      console.log(`📁 S3 Key: ${s3Key}`);
      console.log(`🔗 View URL: https://company-formation-questionnaire.vercel.app/api/documents/view?key=${encodeURIComponent(s3Key)}`);
    } else {
      console.log('✅ Lambda response:', JSON.stringify(lambdaResponse, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
