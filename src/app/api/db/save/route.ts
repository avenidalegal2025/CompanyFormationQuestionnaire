// src/app/api/db/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDoc } from "@/lib/dynamo";

export const runtime = "nodejs"; // ensure Node runtime for AWS SDK

const TABLE = process.env.DYNAMO_TABLE;

// Narrow/typed body the route accepts
type SaveBody = {
  data: Record<string, unknown>;
  draftId?: string;
  userId?: string;
};

function makeId() {
  // Prefer crypto.randomUUID if available
  // (Edge-safe guard even though we force node runtime above)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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

    const { data, draftId, userId } = bodyUnknown as SaveBody;

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { ok: false, error: "`data` must be a non-empty object" },
        { status: 400 }
      );
    }

    // Build PK/SK
    const id = draftId ?? makeId();
    const pk = userId ? `USER#${userId}` : "ANON";
    const sk = `DRAFT#${id}`;

    const now = new Date().toISOString();

    const item = {
      pk,
      sk,
      type: "DRAFT",
      status: "IN_PROGRESS",
      updatedAt: now,
      data, // raw questionnaire payload
    };

    // Allow overwrite of the same draft id; remove ConditionExpression for simplicity
    await ddbDoc.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
      })
    );

    return NextResponse.json({ ok: true, id, pk, sk, updatedAt: now });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}