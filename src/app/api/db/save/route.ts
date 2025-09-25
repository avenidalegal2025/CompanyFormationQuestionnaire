import { NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";

function getUserId(session: any) {
  const email = session?.user?.email as string | undefined;
  const sub = (session as any)?.user?.id || (session as any)?.user?.sub;
  return email ?? sub ?? "anonymous";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const inputDraftId = (body?.draftId as string | undefined)?.trim();
    const draftId = inputDraftId && inputDraftId.length > 0 ? inputDraftId : randomUUID();
    const data = body?.data ?? {};

    const userId = getUserId(session);
    const now = new Date().toISOString();

    // Keys
    const pk = `user#${userId}`;
    const sk = `draft#${draftId}`;

    // Preserve createdAt if updating
    let createdAt = now;
    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        ProjectionExpression: "#ca",
        ExpressionAttributeNames: { "#ca": "createdAt" },
      })
    );
    if (existing.Item?.createdAt) {
      createdAt = existing.Item.createdAt as string;
    }

    const item = {
      pk,
      sk,
      owner: userId,
      draftId,
      data,
      createdAt,
      updatedAt: now,
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return NextResponse.json({ ok: true, draftId, updatedAt: now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}