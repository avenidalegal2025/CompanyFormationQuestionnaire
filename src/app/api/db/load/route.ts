import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth"; // optional: if not signed in, we fall back to "ANON"

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type LoadedItem<Data> = {
  draftId: string;
  owner: string;
  data: Data;
  updatedAt: number;
};

async function getOwner(): Promise<string> {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (email && typeof email === "string" && email.length > 0) return email;
  } catch {
    // ignore
  }
  return "ANON";
}

async function loadById(draftId: string) {
  const owner = await getOwner();
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: owner,
        sk: `DRAFT#${draftId}`,
      },
    })
  );

  if (!res.Item) {
    return { found: false as const };
  }

  // Normalize the response payload
  const item: LoadedItem<unknown> = {
    draftId,
    owner,
    data: (res.Item as Record<string, unknown>).data ?? {},
    updatedAt: (res.Item as Record<string, unknown>).updatedAt as number,
  };

  return { found: true as const, item };
}

// --- GET /api/db/load?draftId=XYZ ---
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const draftId = url.searchParams.get("draftId") ?? "";

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "Missing `draftId` query parameter" },
        { status: 400 }
      );
    }

    const result = await loadById(draftId);
    if (!result.found) {
      return NextResponse.json(
        { ok: false, error: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: result.item });
  } catch (err: unknown) {
    console.error("Load route error:", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}

// --- POST also supported: { draftId } in JSON body ---
export async function POST(req: Request) {
  try {
    const bodyJson = (await req.json().catch(() => null)) as unknown;
    const draftId =
      bodyJson && typeof bodyJson === "object" && bodyJson !== null
        ? (bodyJson as { draftId?: unknown }).draftId
        : undefined;

    if (typeof draftId !== "string" || draftId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing `draftId` in request body" },
        { status: 400 }
      );
    }

    const result = await loadById(draftId);
    if (!result.found) {
      return NextResponse.json(
        { ok: false, error: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: result.item });
  } catch (err: unknown) {
    console.error("Load route error (POST):", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}