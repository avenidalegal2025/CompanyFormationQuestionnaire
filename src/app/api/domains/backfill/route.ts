import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveDomainRegistration, type DomainRegistration } from '@/lib/dynamo';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export async function POST(request: NextRequest) {
  try {
    const adminToken = request.headers.get('x-admin-token') || '';
    const allowAdmin = process.env.BACKFILL_ADMIN_TOKEN && adminToken === process.env.BACKFILL_ADMIN_TOKEN;
    const session = await getServerSession(authOptions);
    if (!allowAdmin && !session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const userId: string = body.userId || session?.user?.email;
    const domain: string = body.domain;
    const price: number = Number(body.price ?? 0);

    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const domainData: DomainRegistration = {
      domain,
      namecheapOrderId: domain,
      registrationDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
      status: 'active',
      stripePaymentId: body.stripePaymentId || 'backfill',
      price,
      sslEnabled: false,
      googleWorkspaceStatus: 'none',
      nameservers: ['dns1.registrar-servers.com','dns2.registrar-servers.com']
    };

    // Write using explicit id/sk. If item exists, update list; else put new item
    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

    const key = { id: userId, sk: 'DOMAINS' } as const;
    const current = await ddb.send(new GetCommand({ TableName: tableName, Key: key, ProjectionExpression: 'registeredDomains' }));
    const existing: DomainRegistration[] = current.Item?.registeredDomains || [];
    const already = existing.some(d => d.domain === domain);

    if (!current.Item) {
      await ddb.send(new PutCommand({
        TableName: tableName,
        Item: { ...key, registeredDomains: [domainData] },
      }));
    } else if (!already) {
      await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: 'SET registeredDomains = :domains',
        ExpressionAttributeValues: { ':domains': [...existing, domainData] },
        ReturnValues: 'UPDATED_NEW',
      }));
    }

    return NextResponse.json({ success: true, userId, domain: domainData, mode: !current.Item ? 'put' : already ? 'noop' : 'update' });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 200 });
  }
}


