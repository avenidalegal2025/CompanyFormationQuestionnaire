import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function fetchDraft(draftId: string) {
  const owner = "ANON"; // TODO: session user
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: owner, sk: `DRAFT#${draftId}` },
    })
  );
  return result.Item;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get("draftId");
    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "Missing `draftId` query param" },
        { status: 400 }
      );
    }

    const item = await fetchDraft(draftId);
    if (!item) {
      return NextResponse.json({ ok: true, item: null });
    }
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("load GET error", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}

// Optional: still accept POST with { draftId }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { draftId?: string | null };
    const draftId = body?.draftId ? String(body.draftId) : "";
    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "Missing `draftId` in body" },
        { status: 400 }
      );
    }
    const item = await fetchDraft(draftId);
    if (!item) return NextResponse.json({ ok: true, item: null });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("load POST error", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}