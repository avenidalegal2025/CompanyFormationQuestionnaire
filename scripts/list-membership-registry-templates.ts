import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.S3_DOCUMENTS_BUCKET || 'avenida-legal-documents';

async function listMembershipRegistryTemplates() {
  console.log('🔍 Exploring Membership Registry templates in S3...\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Region: ${process.env.AWS_REGION || 'us-west-1'}\n`);

  try {
    // List all files in templates folder
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'templates/',
    });

    const response = await s3Client.send(command);
    const objects = response.Contents || [];

    console.log(`📁 Found ${objects.length} files in templates/ folder:\n`);

    // Filter and group membership registry templates
    const membershipTemplates = objects
      .filter(obj => {
        const key = obj.Key || '';
        return key.includes('membership-registry') && key.endsWith('.docx');
      })
      .sort((a, b) => (a.Key || '').localeCompare(b.Key || ''));

    const otherTemplates = objects
      .filter(obj => {
        const key = obj.Key || '';
        return !key.includes('membership-registry');
      })
      .sort((a, b) => (a.Key || '').localeCompare(b.Key || ''));

    if (membershipTemplates.length > 0) {
      console.log('📋 Membership Registry Templates:');
      console.log('='.repeat(80));
      
      membershipTemplates.forEach((obj, index) => {
        const key = obj.Key || '';
        const fileName = key.split('/').pop() || key;
        const size = obj.Size ? `${(obj.Size / 1024).toFixed(2)} KB` : 'Unknown';
        const lastModified = obj.LastModified?.toISOString().split('T')[0] || 'Unknown';
        
        // Extract member and manager counts from filename
        const match = fileName.match(/membership-registry-template-(\d+)-(\d+)\.docx/);
        if (match) {
          const [, members, managers] = match;
          console.log(`${index + 1}. ${fileName}`);
          console.log(`   📊 Members: ${members}, Managers: ${managers}`);
          console.log(`   📦 Size: ${size}`);
          console.log(`   📅 Modified: ${lastModified}`);
          console.log(`   🔗 S3 Key: ${key}`);
        } else {
          console.log(`${index + 1}. ${fileName} (legacy format)`);
          console.log(`   📦 Size: ${size}`);
          console.log(`   📅 Modified: ${lastModified}`);
          console.log(`   🔗 S3 Key: ${key}`);
        }
        console.log('');
      });

      // Analyze structure
      console.log('\n📊 Template Structure Analysis:');
      console.log('='.repeat(80));
      
      const templateMap = new Map<string, { members: number; managers: number; key: string }>();
      
      membershipTemplates.forEach(obj => {
        const key = obj.Key || '';
        const fileName = key.split('/').pop() || key;
        const match = fileName.match(/membership-registry-template-(\d+)-(\d+)\.docx/);
        if (match) {
          const [, members, managers] = match;
          templateMap.set(`${members}-${managers}`, {
            members: parseInt(members),
            managers: parseInt(managers),
            key: key,
          });
        }
      });

      if (templateMap.size > 0) {
        console.log('\n📋 Available Template Combinations:');
        const sorted = Array.from(templateMap.entries()).sort((a, b) => {
          const [aMembers, aManagers] = a[0].split('-').map(Number);
          const [bMembers, bManagers] = b[0].split('-').map(Number);
          if (aMembers !== bMembers) return aMembers - bMembers;
          return aManagers - bManagers;
        });

        sorted.forEach(([key, data]) => {
          console.log(`   ${data.members} member(s), ${data.managers} manager(s) → ${key}.docx`);
        });

        // Find gaps
        console.log('\n🔍 Missing Template Combinations (up to 6 members, 6 managers):');
        const missing: string[] = [];
        for (let m = 1; m <= 6; m++) {
          for (let mgr = 0; mgr <= 6; mgr++) {
            const key = `${m}-${mgr}`;
            if (!templateMap.has(key)) {
              missing.push(`   ${m} member(s), ${mgr} manager(s) → membership-registry-template-${key}.docx`);
            }
          }
        }
        
        if (missing.length > 0) {
          console.log(`   Found ${missing.length} missing combinations:`);
          missing.slice(0, 20).forEach(m => console.log(m)); // Show first 20
          if (missing.length > 20) {
            console.log(`   ... and ${missing.length - 20} more`);
          }
        } else {
          console.log('   ✅ All combinations available!');
        }
      }
    } else {
      console.log('⚠️  No Membership Registry templates found!');
      console.log('   Expected format: templates/membership-registry-template-{members}-{managers}.docx');
    }

    if (otherTemplates.length > 0) {
      console.log('\n\n📁 Other Templates in templates/ folder:');
      console.log('='.repeat(80));
      otherTemplates.forEach((obj, index) => {
        const key = obj.Key || '';
        const fileName = key.split('/').pop() || key;
        const size = obj.Size ? `${(obj.Size / 1024).toFixed(2)} KB` : 'Unknown';
        console.log(`${index + 1}. ${fileName} (${size})`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error listing templates:', error.message);
    if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
      console.error('\n⚠️  AWS credentials not configured or invalid.');
      console.error('   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    }
    process.exit(1);
  }
}

// Run the script
listMembershipRegistryTemplates()
  .then(() => {
    console.log('\n✅ Template exploration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
