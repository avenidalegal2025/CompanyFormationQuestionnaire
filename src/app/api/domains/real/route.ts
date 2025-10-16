import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log('Real API - Getting domains for user:', userId);
    
    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ 
      region,
      credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      } : undefined
    }));

    // Try exact key first
    let domains: any[] = [];
    try {
      const getRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { id: userId, sk: 'DOMAINS' },
        ProjectionExpression: 'registeredDomains'
      }));
      domains = getRes.Item?.registeredDomains || [];
      console.log('Domains API path=get', { found: domains.length });
    } catch (e) {
      console.warn('Domains API get error; will try scan', e);
    }

    // Fallback: scan by id if nothing found
    if (domains.length === 0) {
      try {
        const scanRes = await ddb.send(new ScanCommand({
          TableName: tableName,
          FilterExpression: 'id = :id',
          ExpressionAttributeValues: { ':id': userId },
          ProjectionExpression: 'registeredDomains'
        }));
        domains = scanRes.Items?.[0]?.registeredDomains || [];
        console.log('Domains API path=scan', { items: scanRes.Items?.length || 0, found: domains.length });
      } catch (e) {
        console.warn('Domains API scan error', e);
      }
    }

    return NextResponse.json({
      success: true,
      domains,
      count: domains.length,
      userId,
      source: 'real_dynamodb'
    });

  } catch (error) {
    console.error('Domains API fatal error; returning empty:', error);
    return NextResponse.json({ success: false, domains: [], count: 0, note: 'Handled error' });
  }
}
