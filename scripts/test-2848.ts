import { generate2848PDF } from '../src/lib/pdf-filler';

// Sample questionnaire data for testing 2848
const testFormData = {
  company: {
    companyName: 'TEST COMPANY LLC',
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
    businessStartDate: '2024-01-15', // Year company is being founded
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

async function test2848() {
  console.log('🧪 Testing 2848 PDF generation...');
  console.log('📋 Expected:');
  console.log('   Taxpayer Line 1: TEST COMPANY LLC');
  console.log('   Taxpayer Line 2: 12550 Biscayne Blvd Ste 110');
  console.log('   Taxpayer Line 3: North Miami, FL 33181');
  console.log('   Taxpayer Phone: 305-555-1234');
  console.log('   Representative: ANTONIO REGOJO, 10634 NE 11 AVE., MIAMI, FL 33138');
  console.log('   Representative Phone: 786-512-0434, Fax: 866-496-4957');
  console.log('   Income Tax | 1065 | 2024');
  console.log('   Signature: JOHN SMITH TEST');
  console.log('   Company: TEST COMPANY LLC');
  console.log('   Title: SOLE MEMBER');
  
  try {
    const result = await generate2848PDF(
      'test-vault/test-2848',
      'TEST COMPANY LLC',
      testFormData as any
    );
    
    if (result.success) {
      console.log('\n✅ 2848 PDF generated successfully!');
      console.log('📄 S3 Key:', result.s3Key);
      console.log('📁 File name:', result.fileName);
      console.log('📊 Size:', result.size, 'bytes');
      console.log('\n📥 Downloading PDF...');
      console.log(`   Run: aws s3 cp s3://avenida-legal-documents/${result.s3Key} ~/Downloads/test-2848.pdf`);
    } else {
      console.error('❌ Failed to generate 2848 PDF:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error);
  }
}

test2848();
