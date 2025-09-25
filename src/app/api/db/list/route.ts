import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";

// Force Node.js runtime (AWS SDK v3 won't run on Edge)
export const runtime = "nodejs";

type ListBody = {
  limit?: number;
  cursor?: string;      // pass previous nextCursor
  includeData?: boolean; // include full data blob or not
};

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

async function doList(params: ListBody) {
  const limit = Math.max(1, Math.min(Number(params.limit ?? 20) || 20, 100));

  // TODO: replace with authenticated user id (e.g., sub/email) once auth is wired in
  const pk = "ANON";

  const ExclusiveStartKey = params.cursor ? { pk, sk: params.cursor } : undefined;

  // Exclude data by default for small payloads; include when requested
  const projection = params.includeData ? undefined : "pk, sk, updatedAt";

  const out = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": pk,
      ":prefix": "DRAFT#",
    },
    ProjectionExpression: projection,
    Limit: limit,
    ExclusiveStartKey,
    ScanIndexForward: false, // newest first if your sk has time/random suffix
  }));

  const items = (out.Items ?? []).map((i) => ({
    id: String((i.sk as string).replace("DRAFT#", "")),
    updatedAt: (i as any).updatedAt,
    data: (i as any).data, // present only if includeData=true
  }));

  return NextResponse.json({
    ok: true,
    count: items.length,
    items,
    nextCursor: out.LastEvaluatedKey?.sk as string | undefined,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    return doList({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      includeData: url.searchParams.get("includeData") === "true",
    });
  } catch (err) {
    console.error("List GET error:", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ListBody;
    return doList(body);
  } catch (err) {
    console.error("List POST error:", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}