import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Partition key for a questionnaire draft.
 *
 * Every draft used to be written under the literal pk "ANON", so a single
 * unauthenticated `GET /api/db/list?includeData=true` walked every anonymous
 * user's questionnaire — names, addresses, SSNs, passport references. Scoping
 * the pk per owner is what makes that query harmless.
 *
 * Two owner shapes, mirroring the scheme /api/drafts/migrate already uses:
 *
 *   signed in  -> `user_<sub|email>`
 *   anonymous  -> `anon_<draftId>`, where draftId is the client's
 *                 crypto.randomUUID(). 122 bits, so the id is itself the
 *                 capability: you can only read a draft whose id you hold.
 *
 * Returns null when neither is available, which callers must treat as 401.
 */
export async function draftOwner(draftId?: string | null): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const u = (session as any)?.user;
  const userKey = u?.id || u?.email;
  if (userKey) return `user_${String(userKey).toLowerCase().trim()}`;

  const id = draftId && String(draftId).trim();
  return id ? `anon_${id}` : null;
}

/**
 * The pre-fix partition key. Drafts saved before per-owner scoping still live
 * here, so single-record reads fall back to it — that lookup still demands the
 * exact draft UUID, so it grants nothing a caller did not already hold. There
 * is deliberately no list-style fallback: enumeration was the vulnerability.
 */
export const LEGACY_DRAFT_PK = "ANON";

/**
 * Partition key for a draft published behind a share link.
 *
 * Share links are validated by a signed JWT carrying the draftId, and the
 * recipient is usually NOT the owner — often not signed in at all — so
 * draftOwner() is the wrong lookup there: it would resolve to the *reader's*
 * identity. Shares therefore get their own key, derived from the draftId that
 * the token authorizes. /api/share/generate already receives the full form
 * data and writes it itself, so this partition is self-contained and does not
 * depend on where the author's own copy lives.
 */
export function shareOwner(draftId: string): string {
  return `share_${draftId}`;
}
