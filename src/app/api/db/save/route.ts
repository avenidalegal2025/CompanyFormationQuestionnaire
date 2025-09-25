// src/app/api/db/save/route.ts
import { NextResponse } from "next/server";
import { PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";

type SaveBody = {
  id?: string;                 // draft id (uuid)
  data: Record<string, unknown>;
  collaborators?: string[];    // optional: list of collaborator emails
  // If the draft was created anonymously and user later signs in,
  // pass oldAnonId here to “claim” it into the user’s namespace
  oldAnonId?: string;
};

const pkForUser = (email: string) => `USER#${email}`;
const skForDraft = (id: string) => `DRAFT#${id}`;

// Anonymous namespace to keep your current flow working
const ANON_PK = "ANON";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = (await req.json()) as SaveBody;

    if (!body || typeof body !== "object" || !body.data) {
      return NextResponse.json({ ok: false, error: "Missing body.data" }, { status: 400 });
    }

    // Determine who owns this draft
    const ownerEmail = session?.user?.email ?? null;

    // Create or use existing id
    const id = body.id || randomUUID();

    // If the user is signed in, use their pk; otherwise save under ANON
    const pk = ownerEmail ? pkForUser(ownerEmail) : ANON_PK;
    const sk = skForDraft(id);

    // If user is signing in later and wants to claim an anon draft, move it
    if (ownerEmail && body.oldAnonId) {
      const oldKey = { pk: ANON_PK, sk: skForDraft(body.oldAnonId) };
      const old = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: oldKey }));
      if (old.Item) {
        // write under user namespace
        await ddb.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              ...old.Item,
              pk: pkForUser(ownerEmail),
              owner: ownerEmail,
              // ensure collaborators is array
              collaborators: Array.isArray(old.Item.collaborators)
                ? old.Item.collaborators
                : [],
              updatedAt: new Date().toISOString(),
            },
          })
        );
        // delete the anon copy
        await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: oldKey }));
      }
    }

    const now = new Date().toISOString();

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk,
          sk,
          id, // denormalized for convenience
          owner: ownerEmail ?? null,
          collaborators: Array.isArray(body.collaborators) ? body.collaborators : [],
          data: body.data,
          updatedAt: now,
        },
      })
    );

    return NextResponse.json({
      ok: true,
      id,
      pk,
      sk,
      updatedAt: now,
      claimed: Boolean(ownerEmail && body.oldAnonId),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}