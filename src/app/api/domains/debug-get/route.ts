import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Secured endpoint to dump raw items for a user across common key variations
export async function GET(request: NextRequest) {
  try {
    const adminToken = request.headers.get('x-admin-token') || '';
    if (!process.env.BACKFILL_ADMIN_TOKEN || adminToken !== process.env.BACKFILL_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const region = process.env.AWS_REGION || 'us-west-1';
    const tableName = process.env.DYNAMO_TABLE || 'Company_Creation_Questionaire_Avenida_Legal';
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

    const keys = [
      { id: userId, sk: 'DOMAINS' },
      { pk: userId, sk: 'DOMAINS' },
      { PK: userId, SK: 'DOMAINS' },
    ];

    const reads = await Promise.allSettled(
      keys.map(key => ddb.send(new GetCommand({ TableName: tableName, Key: key as any })))
    );

    // Also scan for any item that contains the userId in id/pk/PK and sk/SK
    const scans = await Promise.allSettled([
      ddb.send(new ScanCommand({ TableName: tableName, FilterExpression: '#id = :id', ExpressionAttributeNames: { '#id': 'id' }, ExpressionAttributeValues: { ':id': userId } })),
      ddb.send(new ScanCommand({ TableName: tableName, FilterExpression: '#pk = :id', ExpressionAttributeNames: { '#pk': 'pk' }, ExpressionAttributeValues: { ':id': userId } })),
      ddb.send(new ScanCommand({ TableName: tableName, FilterExpression: '#PK = :id', ExpressionAttributeNames: { '#PK': 'PK' }, ExpressionAttributeValues: { ':id': userId } })),
    ]);

    return NextResponse.json({
      table: tableName,
      direct: reads.map((r, i) => ({ key: keys[i], ok: r.status === 'fulfilled', item: (r as any).value?.Item || null, error: r.status === 'rejected' ? (r as any).reason?.message : undefined })),
      scans: scans.map((s) => ({ ok: s.status === 'fulfilled', count: (s as any).value?.Items?.length || 0, items: (s as any).value?.Items || [], error: s.status === 'rejected' ? (s as any).reason?.message : undefined })),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 200 });
  }
}


