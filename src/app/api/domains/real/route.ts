import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDomainsByUserSafe } from '@/lib/dynamo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log('Real API - Getting domains for user:', userId, {
      table: process.env.DYNAMO_TABLE,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)
    });
    
    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ 
      region,
      credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      } : undefined
    }));

    // Use shared safe getter first
    let domains: any[] = await getDomainsByUserSafe(userId);

    // If still empty, prefer an explicit scan selecting the item whose sk equals 'DOMAINS'
    if (!Array.isArray(domains) || domains.length === 0) {
      try {
        const scanPk = await ddb.send(new ScanCommand({
          TableName: tableName,
          FilterExpression: '#pk = :id',
          ExpressionAttributeNames: { '#pk': 'pk' },
          ExpressionAttributeValues: { ':id': userId },
        }));
        const items = (scanPk.Items || []) as any[];
        // Prefer exact sk === 'DOMAINS', otherwise any item containing DOMAINS
        const preferred =
          items.find((it) => it?.sk === 'DOMAINS') ||
          items.find((it) => (it?.sk || it?.SK || '').toString().includes('DOMAINS')) ||
          undefined;
        const listCandidate = preferred || items[0];
        const list = Array.isArray(listCandidate?.registeredDomains)
          ? listCandidate.registeredDomains
          : Array.isArray(listCandidate?.domains)
          ? listCandidate.domains
          : Array.isArray(listCandidate?.domainList)
          ? listCandidate.domainList
          : [];
        if (Array.isArray(list) && list.length > 0) {
          domains = list;
        }
      } catch (e) {
        console.warn('Domains API explicit scan fallback error', e);
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
