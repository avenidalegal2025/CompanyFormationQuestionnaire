import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// Upsert canonical id/sk item for a user and optionally delete legacy pk/PK items
export async function POST(request: NextRequest) {
  try {
    const adminToken = request.headers.get('x-admin-token') || '';
    if (!process.env.BACKFILL_ADMIN_TOKEN || adminToken !== process.env.BACKFILL_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { userId, domain } = await request.json();
    if (!userId || !domain) {
      return NextResponse.json({ error: 'userId and domain are required' }, { status: 400 });
    }

    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

    // Collect any legacy records
    const pkKey = { pk: userId, sk: 'DOMAINS' } as const;
    const PKKey = { PK: userId, SK: 'DOMAINS' } as const;
    const idKey = { id: userId, sk: 'DOMAINS' } as const;

    const legacyPk = await ddb.send(new GetCommand({ TableName: tableName, Key: pkKey }));
    const legacyPK = await ddb.send(new GetCommand({ TableName: tableName, Key: PKKey }));

    // Choose source registeredDomains from any available record
    const source = (legacyPk.Item as any) || (legacyPK.Item as any) || {};
    const list: any[] = Array.isArray(source.registeredDomains)
      ? source.registeredDomains
      : Array.isArray(source.domains)
      ? source.domains
      : Array.isArray(source.domainList)
      ? source.domainList
      : [];

    // Ensure the requested domain exists in the list
    const exists = list.some((d: any) => d?.domain === domain);
    if (!exists) {
      list.push({
        domain,
        namecheapOrderId: domain,
        registrationDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
        status: 'active',
        stripePaymentId: 'normalize',
        price: 0,
        sslEnabled: false,
        googleWorkspaceStatus: 'none',
        nameservers: []
      });
    }

    // Upsert canonical id/sk
    await ddb.send(new PutCommand({
      TableName: tableName,
      Item: { ...idKey, registeredDomains: list },
    }));

    // Optionally clean legacy (best-effort)
    try { if (legacyPk.Item) await ddb.send(new DeleteCommand({ TableName: tableName, Key: pkKey })); } catch {}
    try { if (legacyPK.Item) await ddb.send(new DeleteCommand({ TableName: tableName, Key: PKKey })); } catch {}

    return NextResponse.json({ success: true, normalized: list.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 200 });
  }
}


