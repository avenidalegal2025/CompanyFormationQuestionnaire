// src/app/api/debug/maps-key/route.ts
export async function GET() {
  const val = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return Response.json({
    present: Boolean(val),
    prefix: val?.slice(0, 5) ?? null,
    length: val?.length ?? 0,
  });
}