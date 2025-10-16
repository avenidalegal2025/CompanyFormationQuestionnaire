import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const envVars = {
      AWS_REGION: process.env.AWS_REGION,
      DYNAMO_TABLE: process.env.DYNAMO_TABLE,
      DYNAMO_PK_NAME: process.env.DYNAMO_PK_NAME,
      DYNAMO_SK_NAME: process.env.DYNAMO_SK_NAME,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT_SET',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT_SET',
    };

    return NextResponse.json({
      success: true,
      environment: process.env.NODE_ENV,
      variables: envVars
    });

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get environment variables',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
