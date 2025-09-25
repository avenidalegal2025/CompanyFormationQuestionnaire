import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";

type SaveBody = {
  draftId?: string | null;
  data?: unknown; // AllSteps shape on the client, but we don't need TS here
};

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SaveBody;

    if (!body?.data) {
      return NextResponse.json(
        { ok: false, error: "Missing `data`" },
        { status: 400 }
      );
    }

    // If no draftId from client, generate one server-side
    const id = body.draftId && String(body.draftId).trim()
      ? String(body.draftId).trim()
      : crypto.randomUUID();

    const owner = "ANON"; // TODO: swap for session user id/email later
    const now = Date.now();

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: owner,
          sk: `DRAFT#${id}`,
          id,
          owner,
          status: "IN_PROGRESS",
          data: body.data,
          updatedAt: now,
        },
      })
    );

    return NextResponse.json({
      ok: true,
      id,
      pk: owner,
      sk: `DRAFT#${id}`,
      updatedAt: now,
    });
  } catch (err) {
    console.error("save error", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}