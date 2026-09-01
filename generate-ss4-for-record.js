// Quick script to generate SS-4 for an Airtable record
// Usage: node generate-ss4-for-record.js recXXXXXXXXXXXXXX

const recordId = process.argv[2];

if (!recordId) {
  console.error('❌ Error: Please provide an Airtable Record ID');
  console.error('Usage: node generate-ss4-for-record.js recXXXXXXXXXXXXXX');
  process.exit(1);
}

const vercelUrl = process.env.VERCEL_URL || 'company-formation-questionnaire.vercel.app';
const apiUrl = `https://${vercelUrl}/api/airtable/generate-ss4`;

console.log(`📋 Generating SS-4 for Airtable Record: ${recordId}`);
console.log(`🔗 API URL: ${apiUrl}`);
console.log('');

fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY || '',
  },
  body: JSON.stringify({
    recordId: recordId,
    updateAirtable: true,
  }),
})
  .then(async (response) => {
    const text = await response.text();
    console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
    console.log('');
    
    if (response.ok) {
      try {
        const json = JSON.parse(text);
        console.log('✅ SS-4 generated successfully!');
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('✅ SS-4 generated successfully!');
        console.log(text);
      }
    } else {
      console.error('❌ Failed to generate SS-4');
      console.error(text);
    }
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
  });

