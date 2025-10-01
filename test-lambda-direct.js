const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({
  region: 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testLambda() {
  try {
    const command = new InvokeCommand({
      FunctionName: 'check-company-availability',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        companyName: 'TEST LLC',
        entityType: 'LLC'
      }),
    });

    const { Payload } = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder('utf-8').decode(Payload));
    
    console.log('Lambda Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testLambda();
