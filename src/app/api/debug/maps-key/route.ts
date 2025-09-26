// src/app/api/debug/maps-key/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set" },
      { status: 500 }
    );
  }

  // For security, don’t return the full key. Show only the first/last chars.
  const redacted =
    key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "***";

  return NextResponse.json({
    ok: true,
    key: redacted,
  });
}