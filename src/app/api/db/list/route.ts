// src/app/api/db/list/route.ts
import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";

const pkForUser = (email: string) => `USER#${email}`;

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": pkForUser(email),
          ":prefix": "DRAFT#",
        },
        ProjectionExpression: "id, updatedAt",
        ScanIndexForward: false, // newest first
      })
    );

    return NextResponse.json({
      ok: true,
      drafts:
        out.Items?.map((i) => ({
          id: i.id as string,
          updatedAt: i.updatedAt as string,
        })) ?? [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}