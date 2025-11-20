/**
 * Direct test of SS-4 and 8821 Lambda functions
 * Tests the Lambda functions with sample data
 */

const LAMBDA_SS4_URL = 'https://rgkqsugoslrjh4kqq2kzwqfnry0ndryd.lambda-url.us-west-1.on.aws/';
const LAMBDA_8821_URL = 'https://ql6ufztnwlohsqexpkm7wu44mu0xovla.lambda-url.us-west-1.on.aws/';

const TEMPLATE_SS4_URL = 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/fss4.pdf';
const TEMPLATE_8821_URL = 'https://ss4-template-bucket-043206426879.s3.us-west-1.amazonaws.com/f8821.pdf';

// Sample data matching what TypeScript sends
const sampleSS4Data = {
  companyName: 'Test Company LLC',
  companyNameBase: 'Test Company',
  entityType: 'LLC',
  formationState: 'Wyoming',
  businessPurpose: 'General business purposes',
  companyAddress: '12550 Biscayne Blvd Ste 110',
  companyCity: 'North Miami',
  companyState: 'FL',
  companyZip: '33181',
  ownerName: 'John Doe',
  ownerSSN: '123-45-6789',
  ownerTitle: 'Member',
  ownerAddress: '123 Main St',
  ownerCity: 'Miami',
  ownerState: 'FL',
  ownerZip: '33130',
  responsiblePartyName: 'John Doe',
  responsiblePartySSN: '123-45-6789',
  responsiblePartyTitle: 'Member',
};

const sample8821Data = {
  companyName: 'Test Company LLC',
  ein: '',
  companyAddress: '12550 Biscayne Blvd Ste 110',
  taxpayerName: 'John Doe',
  taxpayerSSN: '123-45-6789',
  taxpayerAddress: '123 Main St',
  taxpayerCity: 'Miami',
  taxpayerState: 'FL',
  taxpayerZip: '33130',
  designeeName: 'Avenida Legal',
  designeeAddress: '12550 Biscayne Blvd Ste 110',
  designeeCity: 'North Miami',
  designeeState: 'FL',
  designeeZip: '33181',
  designeePhone: '(305) 123-4567',
  designeeFax: '',
  taxInfo: 'N/A',
  taxForms: 'All tax forms and information',
  taxYears: '2024, 2025, 2026',
  taxMatters: 'N/A',
};

async function testLambda(lambdaUrl: string, formData: any, templateUrl: string, formName: string) {
  console.log(`\n🧪 Testing ${formName} Lambda...`);
  console.log(`📍 URL: ${lambdaUrl}`);
  console.log(`📄 Template: ${templateUrl}`);
  console.log(`📋 Data keys: ${Object.keys(formData).join(', ')}`);
  
  const s3Bucket = 'avenida-legal-documents';
  const s3Key = `test/${formName.toLowerCase()}_test_${Date.now()}.pdf`;
  
  const payload = {
    form_data: formData,
    s3_bucket: s3Bucket,
    s3_key: s3Key,
    templateUrl: templateUrl,
    return_pdf: true,
  };
  
  try {
    console.log(`\n📤 Sending request...`);
    const startTime = Date.now();
    
    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`⏱️  Response time: ${responseTime}ms`);
    console.log(`📡 Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error response:`, errorText);
      return { success: false, error: errorText, responseTime };
    }
    
    const contentType = response.headers.get('content-type');
    console.log(`📄 Content-Type: ${contentType}`);
    
    if (contentType?.includes('application/json')) {
      const jsonResponse = await response.json();
      console.log(`✅ JSON Response:`, JSON.stringify(jsonResponse, null, 2));
      return { success: true, response: jsonResponse, responseTime };
    } else if (contentType?.includes('application/pdf')) {
      const arrayBuffer = await response.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);
      console.log(`✅ PDF received: ${pdfBuffer.length} bytes`);
      
      // Validate PDF
      if (pdfBuffer.length < 4 || pdfBuffer.subarray(0, 4).toString() !== '%PDF') {
        console.error(`❌ Invalid PDF format`);
        return { success: false, error: 'Invalid PDF format', responseTime };
      }
      
      console.log(`✅ Valid PDF file`);
      console.log(`📦 S3 Location: s3://${s3Bucket}/${s3Key}`);
      
      return { 
        success: true, 
        pdfSize: pdfBuffer.length,
        s3Bucket,
        s3Key,
        responseTime 
      };
    } else {
      const text = await response.text();
      console.log(`⚠️  Unexpected content type. Response:`, text.substring(0, 500));
      return { success: false, error: `Unexpected content type: ${contentType}`, responseTime };
    }
  } catch (error: any) {
    console.error(`❌ Request failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing SS-4 and 8821 Lambda Functions');
  console.log('═══════════════════════════════════════════════════════');
  
  // Test SS-4
  const ss4Result = await testLambda(
    LAMBDA_SS4_URL,
    sampleSS4Data,
    TEMPLATE_SS4_URL,
    'SS-4'
  );
  
  // Test 8821
  const form8821Result = await testLambda(
    LAMBDA_8821_URL,
    sample8821Data,
    TEMPLATE_8821_URL,
    '8821'
  );
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════════════════════');
  
  console.log(`\n📄 SS-4 (EIN Application):`);
  if (ss4Result.success) {
    console.log(`   ✅ SUCCESS`);
    if (ss4Result.pdfSize) {
      console.log(`   📦 PDF Size: ${ss4Result.pdfSize} bytes`);
      console.log(`   📍 S3: s3://${ss4Result.s3Bucket}/${ss4Result.s3Key}`);
    }
    if (ss4Result.responseTime) {
      console.log(`   ⏱️  Response Time: ${ss4Result.responseTime}ms`);
    }
  } else {
    console.log(`   ❌ FAILED`);
    console.log(`   🔴 Error: ${ss4Result.error}`);
  }
  
  console.log(`\n📄 Form 8821 (Tax Authorization):`);
  if (form8821Result.success) {
    console.log(`   ✅ SUCCESS`);
    if (form8821Result.pdfSize) {
      console.log(`   📦 PDF Size: ${form8821Result.pdfSize} bytes`);
      console.log(`   📍 S3: s3://${form8821Result.s3Bucket}/${form8821Result.s3Key}`);
    }
    if (form8821Result.responseTime) {
      console.log(`   ⏱️  Response Time: ${form8821Result.responseTime}ms`);
    }
  } else {
    console.log(`   ❌ FAILED`);
    console.log(`   🔴 Error: ${form8821Result.error}`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  
  const successCount = [ss4Result, form8821Result].filter(r => r.success).length;
  console.log(`\n📈 Overall: ${successCount}/2 tests passed\n`);
  
  if (successCount === 2) {
    console.log('✅ All Lambda functions are working correctly!');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }
}

runTests()
  .then(() => {
    console.log('\n✅ Test complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

