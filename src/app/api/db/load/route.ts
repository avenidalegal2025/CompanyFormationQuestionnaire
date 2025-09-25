// src/app/api/db/load/route.ts
import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";

type LoadRequestBody = {
  id: string;
};

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LoadRequestBody;

    if (!body?.id) {
      return NextResponse.json(
        { ok: false, error: "Missing `id` in request body" },
        { status: 400 }
      );
    }

    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: "ANON",          // replace with user ID later
          sk: `DRAFT#${body.id}`,
        },
      })
    );

    if (!result.Item) {
      return NextResponse.json(
        { ok: false, error: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: result.Item });
  } catch (err: unknown) {
    console.error("Load route error:", err);
    return NextResponse.json(
      { ok: false, error: errMsg(err) },
      { status: 500 }
    );
  }
}