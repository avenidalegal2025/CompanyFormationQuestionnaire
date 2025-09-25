import { NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";
import type { Session } from "next-auth";

type SaveBody = {
  draftId?: string;
  data?: unknown;
};

type IdLike = { id?: string; sub?: string };

function getUserId(session: Session): string {
  const email = session.user?.email ?? undefined;
  const idFields = (session.user as IdLike) || {};
  return email ?? idFields.id ?? idFields.sub ?? "anonymous";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as SaveBody;
    const incomingDraftId = (body.draftId ?? "").trim();
    const draftId = incomingDraftId.length > 0 ? incomingDraftId : randomUUID();
    const data = body.data ?? {};

    const userId = getUserId(session);
    const now = new Date().toISOString();

    const pk = `user#${userId}`;
    const sk = `draft#${draftId}`;

    // Preserve createdAt if updating an existing draft
    let createdAt = now;
    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        ProjectionExpression: "#ca",
        ExpressionAttributeNames: { "#ca": "createdAt" },
      })
    );
    if (existing.Item && typeof existing.Item.createdAt === "string") {
      createdAt = existing.Item.createdAt;
    }

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk,
          sk,
          owner: userId,
          draftId,
          data,
          createdAt,
          updatedAt: now,
        },
      })
    );

    return NextResponse.json({ ok: true, draftId, updatedAt: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}