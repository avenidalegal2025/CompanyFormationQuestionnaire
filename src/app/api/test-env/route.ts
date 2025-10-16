import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    env: {
      AWS_REGION: process.env.AWS_REGION,
      DYNAMO_TABLE: process.env.DYNAMO_TABLE,
      DYNAMO_PK_NAME: process.env.DYNAMO_PK_NAME,
      DYNAMO_SK_NAME: process.env.DYNAMO_SK_NAME,
      DYNAMO_SK_VALUE: process.env.DYNAMO_SK_VALUE,
    }
  });
}
