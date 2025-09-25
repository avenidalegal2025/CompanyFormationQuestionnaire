// src/app/api/db/save/route.ts
import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "@/lib/dynamo";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json(); // parse request
    const { data } = body;

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Missing data in request body" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const item = {
      id,
      pk: "ANON",
      sk: `DRAFT#${id}`,
      data,
      updatedAt: now,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.DYNAMO_TABLE,
        Item: item,
      })
    );

    return NextResponse.json({ ok: true, ...item });
  } catch (err: any) {
    console.error("Save route error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}