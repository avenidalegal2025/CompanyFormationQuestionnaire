import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// Secured endpoint to mirror a legacy pk/sk item to id/sk
export async function POST(request: NextRequest) {
  try {
    const adminToken = request.headers.get('x-admin-token') || '';
    if (!process.env.BACKFILL_ADMIN_TOKEN || adminToken !== process.env.BACKFILL_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

    // Read legacy item
    const legacyKey = { pk: userId, sk: 'DOMAINS' } as const;
    const legacy = await ddb.send(new GetCommand({ TableName: tableName, Key: legacyKey }));
    if (!legacy.Item) {
      return NextResponse.json({ success: false, message: 'No legacy pk/sk item found' }, { status: 200 });
    }

    const newKey = { id: userId, sk: 'DOMAINS' } as const;
    const item = { ...newKey, registeredDomains: legacy.Item.registeredDomains || [] } as any;
    await ddb.send(new PutCommand({ TableName: tableName, Item: item }));

    return NextResponse.json({ success: true, mirrored: item.registeredDomains?.length || 0 });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 200 });
  }
}


