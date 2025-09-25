// src/app/api/db/save/route.ts
import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "@/lib/dynamo";
import { randomUUID } from "crypto";

type SaveRequestBody = {
  data?: unknown;   // questionnaire payload (any JSON)
  id?: string;      // optional existing id if you later support updates
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
    const body = (await req.json()) as SaveRequestBody;

    if (!body || typeof body !== "object" || body.data == null) {
      return NextResponse.json(
        { ok: false, error: "Missing `data` in request body" },
        { status: 400 }
      );
    }

    const id = body.id ?? randomUUID();
    const now = new Date().toISOString();

    const item = {
      id,
      pk: "ANON",            // swap to user id once you wire auth
      sk: `DRAFT#${id}`,
      data: body.data,       // store the JSON as-is
      updatedAt: now,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.DYNAMO_TABLE,
        Item: item,
      })
    );

    return NextResponse.json({ ok: true, ...item });
  } catch (err: unknown) {
    console.error("Save route error:", err);
    return NextResponse.json(
      { ok: false, error: errMsg(err) },
      { status: 500 }
    );
  }
}