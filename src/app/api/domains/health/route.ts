import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const info = {
      region: process.env.AWS_REGION,
      table: process.env.DYNAMO_TABLE,
      pk: process.env.DYNAMO_PK_NAME,
      sk: process.env.DYNAMO_SK_NAME,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      runtime: 'edge=false/node',
    };
    return NextResponse.json({ ok: true, info });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}


