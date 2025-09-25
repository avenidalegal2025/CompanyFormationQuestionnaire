// src/app/api/db/load/route.ts
import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";

type LoadBody = {
  id: string;
  // If the draft might live in ANON (pre-login), pass anonymous: true
  anonymous?: boolean;
};

const pkForUser = (email: string) => `USER#${email}`;
const skForDraft = (id: string) => `DRAFT#${id}`;
const ANON_PK = "ANON";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = (await req.json()) as LoadBody;

    if (!body?.id) {
      return NextResponse.json({ ok: false, error: "Missing body.id" }, { status: 400 });
    }

    // Try user namespace first if signed in
    const candidates: Array<{ pk: string; sk: string }> = [];

    if (session?.user?.email) {
      candidates.push({ pk: pkForUser(session.user.email), sk: skForDraft(body.id) });
    }

    // If caller says it might be anonymous, also check ANON
    if (body.anonymous || candidates.length === 0) {
      candidates.push({ pk: ANON_PK, sk: skForDraft(body.id) });
    }

    let item: Record<string, unknown> | undefined;

    for (const key of candidates) {
      const out = await ddb.send(
        new GetCommand({ TableName: TABLE_NAME, Key: key })
      );
      if (out.Item) {
        item = out.Item as Record<string, unknown>;
        break;
      }
    }

    if (!item) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Authorization: allow if owner or collaborator or anon
    const owner = (item.owner as string | null) ?? null;
    const collaborators = (item.collaborators as string[]) || [];
    const requester = session?.user?.email ?? null;

    const isAnon = (item.pk as string) === ANON_PK;
    const allowed =
      isAnon ||
      (requester && (requester === owner || collaborators.includes(requester)));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, item: item.data ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}