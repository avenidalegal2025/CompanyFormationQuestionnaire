import { generate8821PDF } from '../src/lib/pdf-filler';

// Load environment variables
if (typeof process !== 'undefined' && process.env) {
  // Environment variables should already be loaded by Next.js or the runtime
  // But we can manually load .env.local if needed
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch (e) {
    // dotenv not available, assume env vars are already set
  }
}

// Sample questionnaire data for testing
const testFormData = {
  company: {
    companyName: 'TEST LLC',
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
      fullName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      ssn: '123-45-6789',
      tin: '',
      ownershipPercentage: 100,
    },
  ],
  agreement: {
    llc_taxOwner: 'John Doe',
    corp_taxOwner: '',
  },
  admin: {
    managersCount: 1,
  },
};

async function test8821() {
  console.log('🧪 Testing 8821 PDF generation...');
  console.log('📋 Test form data:', JSON.stringify(testFormData, null, 2));
  
  try {
    const result = await generate8821PDF(
      'test-vault/test-company',
      'TEST LLC',
      testFormData as any
    );
    
    if (result.success) {
      console.log('✅ 8821 PDF generated successfully!');
      console.log('📄 S3 Key:', result.s3Key);
      console.log('📁 File name:', result.fileName);
      console.log('📊 Size:', result.size, 'bytes');
    } else {
      console.error('❌ Failed to generate 8821 PDF:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error);
  }
}

test8821();

