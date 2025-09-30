import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/dynamo';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'edit' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Persist draft to DynamoDB directly and return a link with draftId and permissions
    const draftId = crypto.randomUUID();
    const owner = 'ANON';
    const now = Date.now();
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: owner,
          sk: `DRAFT#${draftId}`,
          id: draftId,
          owner,
          status: 'IN_PROGRESS',
          data: formData,
          updatedAt: now,
        },
      })
    );

    const token = jwt.sign(
      { draftId, permissions, exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) },
      JWT_SECRET
    );

    const originFromRequest = request.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
    const magicLink = `${baseUrl}/collaborate?token=${token}`;

    return NextResponse.json({ 
      success: true, 
      magicLink,
      expiresIn: '7 days'
    });

  } catch (error) {
    console.error('Error generating magic link:', error);
    return NextResponse.json(
      { error: 'Failed to generate magic link' }, 
      { status: 500 }
    );
  }
}

