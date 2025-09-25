import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/lib/dynamo";
import { auth } from "@/auth";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type SaveBody<Data> = {
  draftId: string;
  data: Data;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;

    const draftId =
      body && typeof body === "object" && body !== null
        ? (body as SaveBody<unknown>).draftId
        : undefined;
    const data =
      body && typeof body === "object" && body !== null
        ? (body as SaveBody<unknown>).data
        : undefined;

    if (typeof draftId !== "string" || draftId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing `draftId` in body" },
        { status: 400 }
      );
    }
    if (typeof data !== "object" || data === null) {
      return NextResponse.json(
        { ok: false, error: "`data` must be an object" },
        { status: 400 }
      );
    }

    const owner = await getOwner();
    const updatedAt = Date.now();

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: owner,
          sk: `DRAFT#${draftId}`,
          owner,
          draftId,
          updatedAt,
          data,
        },
      })
    );

    return NextResponse.json({ ok: true, key: `DRAFT#${draftId}` });
  } catch (err: unknown) {
    console.error("Save route error:", err);
    return NextResponse.json({ ok: false, error: errMsg(err) }, { status: 500 });
  }
}