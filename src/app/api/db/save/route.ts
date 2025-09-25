import { NextRequest, NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDoc } from "@/lib/dynamo"; // our DynamoDB client

// Define the payload type
interface SaveRequest {
  data: Record<string, unknown>;
  pk?: string;
  sk?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveRequest;

    if (!body.data) {
      return NextResponse.json(
        { ok: false, error: "Missing 'data' in request body" },
        { status: 400 }
      );
    }

    // Auto-generate keys if not provided
    const pk = body.pk ?? "user#demo"; // replace later with Auth0 user id
    const sk = body.sk ?? "draft";

    const now = new Date().toISOString();

    const item = {
      pk,
      sk,
      data: body.data,
      updatedAt: now,
    };

    await ddbDoc.send(
      new PutCommand({
        TableName: process.env.DYNAMO_TABLE_NAME!,
        Item: item,
      })
    );

    return NextResponse.json({ ok: true, item });
  } catch (err: any) {
    console.error("Save error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}