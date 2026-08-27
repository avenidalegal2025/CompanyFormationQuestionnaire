import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { draftOwner, LEGACY_DRAFT_PK } from "@/lib/draft-owner";

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function fetchDraft(draftId: string) {
  const owner = await draftOwner(draftId);
  if (!owner) return undefined;

  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: owner, sk: `DRAFT#${draftId}` },
    })
  );
  if (result.Item) return result.Item;

  // Drafts saved before per-owner scoping still sit under the shared legacy
  // key. Reading one still requires the exact draft UUID, so this grants the
  // caller nothing they did not already hold.
  const legacy = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: LEGACY_DRAFT_PK, sk: `DRAFT#${draftId}` },
    })
  );
  return legacy.Item;
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