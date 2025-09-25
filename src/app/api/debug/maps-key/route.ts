import { NextResponse } from "next/server";

export function GET() {
  // NEVER return the full key in production; we only reveal length+prefix.
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  return NextResponse.json({
    present: Boolean(key),
    prefix: key ? key.slice(0, 6) : null,
    length: key.length || 0,
  });
}