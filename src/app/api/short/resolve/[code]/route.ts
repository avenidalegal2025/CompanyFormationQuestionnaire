import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_SHORT_URL_TABLE || 'company-questionnaire-short-urls';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    
    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // Fetch from DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { shortCode: code },
    }));

    if (!result.Item) {
      return NextResponse.json({ error: 'Short URL not found or expired' }, { status: 404 });
    }

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (result.Item.expiresAt && result.Item.expiresAt < now) {
      return NextResponse.json({ error: 'Short URL has expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      formData: result.Item.formData,
      permissions: result.Item.permissions,
      expiresAt: new Date(result.Item.expiresAt * 1000).toISOString(),
    });

  } catch (error) {
    console.error('Error resolving short URL:', error);
    return NextResponse.json(
      { error: 'Failed to resolve short URL' }, 
      { status: 500 }
    );
  }
}
