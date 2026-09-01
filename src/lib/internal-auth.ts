import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Inbound auth for the document-generation routes under /api/airtable/*.
 *
 * These routes take an Airtable recordId and return a filled form. The SS-4 and
 * the 2848/8821 carry the owner's SSN. Until now none of them checked anything:
 * an earlier audit pass counted them as guarded, but the only key they touch is
 * AIRTABLE_API_KEY / OPENAI_API_KEY, which are *outbound* credentials.
 *
 * A session check is the wrong shape here, because every real caller is
 * server-to-server: the Stripe webhook, the two /api/admin regenerate+email
 * routes, and the CLI scripts under scripts/. None of them carry a browser
 * cookie. So the primary credential is a shared secret in INTERNAL_API_KEY,
 * sent as `x-internal-key`.
 *
 * An admin session is also accepted, so the routes stay reachable from the
 * dashboard and for manual debugging without handing the key around.
 *
 * Mirrors the existing BACKFILL_ADMIN_TOKEN convention in /api/domains/*, but
 * compares in constant time and fails closed when the env var is missing.
 */

/** Emails allowed to call these routes with a browser session. Kept in sync
 *  with ADMIN_EMAILS in src/middleware.ts. */
const ADMIN_EMAILS = [
  "avenidalegal.2024@gmail.com",
  "info@avenidalegal.com",
  "rodolfo@avenidalegal.lat",
];

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Returns null when the caller is authorized, or the NextResponse to return
 * when it is not. Callers must do: `const deny = await requireInternalAuth(req);
 * if (deny) return deny;`
 */
export async function requireInternalAuth(
  req: Request
): Promise<NextResponse | null> {
  const expected = process.env.INTERNAL_API_KEY?.trim();

  const presented = req.headers.get("x-internal-key")?.trim();
  if (expected && presented && safeEqual(presented, expected)) return null;

  // Fall back to an admin browser session.
  try {
    const session = await getServerSession(authOptions);
    const email = String((session as any)?.user?.email || "")
      .toLowerCase()
      .trim();
    if (email && ADMIN_EMAILS.includes(email)) return null;
  } catch {
    // getServerSession can throw when there is no request context; treat that
    // as "no session" rather than letting it 500 into an open door.
  }

  if (!expected) {
    // Fail closed. An unset secret must not silently disable the check on a
    // route that returns SSNs.
    console.error(
      "INTERNAL_API_KEY is not set; refusing internal request to",
      new URL(req.url).pathname
    );
  }

  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}

/** Header block for internal server-to-server callers. */
export function internalAuthHeaders(): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY?.trim();
  return key ? { "x-internal-key": key } : {};
}
