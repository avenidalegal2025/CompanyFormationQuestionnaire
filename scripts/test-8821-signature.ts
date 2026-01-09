import { generate8821PDF } from '../src/lib/pdf-filler';

// Sample questionnaire data with hardcoded signature values for testing
const testFormData = {
  company: {
    companyName: 'TEST SIGNATURE LLC',
    entityType: 'LLC',
    formationState: 'FL',
    address: '12550 Biscayne Blvd Ste 110, North Miami, FL 33181',
    addressLine1: '12550 Biscayne Blvd Ste 110',
    addressLine2: '',
    city: 'North Miami',
    state: 'FL',
    zipCode: '33181',
    postalCode: '33181',
    phone: '305-555-1234',
    phoneNumber: '305-555-1234',
    usPhoneNumber: '305-555-1234',
    businessPhone: '305-555-1234',
  },
  owners: [
    {
      fullName: 'JOHN SMITH TEST',
      ssn: '123-45-6789',
      tin: '',
    },
  ],
  agreement: {
    llc_taxOwner: 'JOHN SMITH TEST',
    corp_taxOwner: '',
  },
  admin: {
    managersCount: 1,
  },
};

async function test8821Signature() {
  console.log('🧪 Testing 8821 PDF with hardcoded signature...');
  console.log('📋 Expected signature:');
  console.log('   Name: "JOHN SMITH TEST, SOLE MEMBER"');
  console.log('   Title: "SOLE MEMBER"');
  
  try {
    const result = await generate8821PDF(
      'test-vault/test-signature',
      'TEST SIGNATURE LLC',
      testFormData as any
    );
    
    if (result.success) {
      console.log('\n✅ 8821 PDF generated successfully!');
      console.log('📄 S3 Key:', result.s3Key);
      console.log('📁 File name:', result.fileName);
      console.log('📊 Size:', result.size, 'bytes');
      console.log('\n📥 Downloading PDF to inspect...');
      console.log(`   Run: aws s3 cp s3://avenida-legal-documents/${result.s3Key} /tmp/test-8821-signature.pdf`);
      console.log(`   Then open: /tmp/test-8821-signature.pdf`);
    } else {
      console.error('❌ Failed to generate 8821 PDF:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error);
  }
}

test8821Signature();

