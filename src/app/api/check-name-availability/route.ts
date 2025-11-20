import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({
  region: 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const LAMBDA_FUNCTION_ARN = 'arn:aws:lambda:us-west-1:043206426879:function:sunbiz-lambda-latest';

export async function POST(request: NextRequest) {
  try {
    const { companyName, entityType } = await request.json();

    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking name availability for: ${companyName} (${entityType || 'N/A'})`);

    // Prepare payload for Lambda
    const payload = {
      companyName: companyName.trim(),
      entityType: entityType || 'LLC', // Default to LLC if not provided
    };

    console.log(`📤 Invoking Lambda: ${LAMBDA_FUNCTION_ARN}`);
    console.log(`📋 Payload:`, JSON.stringify(payload));

    // Invoke Lambda function
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_ARN,
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    console.log(`📡 Lambda response status: ${response.StatusCode}`);
    console.log(`📡 Lambda response logResult: ${response.LogResult || 'N/A'}`);

    if (response.FunctionError) {
      console.error(`❌ Lambda function error: ${response.FunctionError}`);
      const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : null;
      return NextResponse.json(
        { 
          error: 'Lambda function error',
          details: errorPayload || response.FunctionError,
        },
        { status: 500 }
      );
    }

    // Parse Lambda response
    const responsePayload = response.Payload 
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : null;

    console.log(`✅ Lambda response payload:`, JSON.stringify(responsePayload, null, 2));

    // Lambda should return: { available: boolean, message: string, details?: any }
    return NextResponse.json({
      success: true,
      available: responsePayload?.available ?? false,
      message: responsePayload?.message || 'No se pudo determinar la disponibilidad',
      details: responsePayload?.details,
    });

  } catch (error: any) {
    console.error('❌ Error checking name availability:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check name availability',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

