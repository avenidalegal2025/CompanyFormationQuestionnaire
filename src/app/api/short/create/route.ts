import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_SHORT_URL_TABLE || 'company-questionnaire-short-urls';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'view' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Generate a short code (6 characters)
    const shortCode = crypto.randomBytes(4).toString('base64url').substring(0, 6);
    
    // Store in DynamoDB
    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
    
    const item = {
      TableName: TABLE_NAME,
      Item: {
        shortCode,
        formData,
        permissions,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt,
        ttl: expiresAt, // DynamoDB TTL
      },
      ConditionExpression: 'attribute_not_exists(shortCode)'
    } as const;

    try {
      await docClient.send(new PutCommand(item));
    } catch {
      // Collision fallback: try one more code
      const shortCode2 = crypto.randomBytes(4).toString('base64url').substring(0, 6);
      await docClient.send(new PutCommand({
        ...item,
        Item: { ...item.Item, shortCode: shortCode2 },
      }));
      // Update link with new code
      const originFromRequest = request.nextUrl.origin;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
      const shortLink = `${baseUrl}/s/${shortCode2}`;
      return NextResponse.json({ success: true, magicLink: shortLink, expiresIn: '7 days' });
    }

    // Generate short link
    const originFromRequest = request.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
    const shortLink = `${baseUrl}/s/${shortCode}`;

    return NextResponse.json({ 
      success: true, 
      magicLink: shortLink,
      expiresIn: '7 days'
    });

  } catch (error) {
    console.error('Error creating short URL:', error);
    return NextResponse.json(
      { error: 'Failed to create short URL' }, 
      { status: 500 }
    );
  }
}
