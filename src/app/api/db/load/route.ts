import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";
import type { Session } from "next-auth";

type IdLike = { id?: string; sub?: string };

function getUserId(session: Session): string {
  const email = session.user?.email ?? undefined;
  const idFields = (session.user as IdLike) || {};
  return email ?? idFields.id ?? idFields.sub ?? "anonymous";
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const draftId = (searchParams.get("draftId") || "").trim();
    if (!draftId) {
      return NextResponse.json({ ok: false, error: "Missing draftId" }, { status: 400 });
    }

    const userId = getUserId(session);
    const pk = `user#${userId}`;
    const sk = `draft#${draftId}`;

    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
      })
    );

    if (!res.Item) {
      return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: res.Item });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}