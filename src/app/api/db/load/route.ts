// src/app/api/db/load/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDoc } from "@/lib/dynamo";

export const runtime = "nodejs";

const TABLE = process.env.DYNAMO_TABLE;

export async function POST(req: NextRequest) {
  try {
    if (!TABLE) {
      return NextResponse.json(
        { ok: false, error: "Missing DYNAMO_TABLE env var" },
        { status: 500 }
      );
    }

    const bodyUnknown = await req.json();
    if (typeof bodyUnknown !== "object" || bodyUnknown === null) {
      return NextResponse.json(
        { ok: false, error: "Body must be a JSON object" },
        { status: 400 }
      );
    }

    const { id, userId } = bodyUnknown as { id?: string; userId?: string };
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "`id` is required" },
        { status: 400 }
      );
    }

    const pk = userId ? `USER#${userId}` : "ANON";
    const sk = `DRAFT#${id}`;

    const res = await ddbDoc.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk, sk },
      })
    );

    if (!res.Item) {
      return NextResponse.json(
        { ok: false, error: "Not found", id, pk, sk },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: res.Item });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}