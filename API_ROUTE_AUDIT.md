# Unauthenticated API route audit

77 route files under `src/app/api`. 24 perform an auth check; **43 do not**.

`src/middleware.ts` matches only `/client/:path*` and `/admin/:path*` — the
**page** routes. No API path is covered, so every API route must guard itself.

---

## CRITICAL — unauthenticated dump of every anonymous draft

`GET /api/db/list?includeData=true&limit=100`

`doList()` hardcodes `const pk = "ANON"` (marked `// TODO: replace with
authenticated user id`). Every anonymous user's draft shares that one DynamoDB
partition key. The route has no auth check, accepts `includeData=true` from the
query string, returns full `data` for each draft, and paginates via
`nextCursor` — so the whole partition is walkable.

Drafts hold questionnaire answers: owner names, addresses, **SSNs**, passport
references, ownership splits.

`GET /api/db/load?draftId=…` is the same defect per-record, and
`POST /api/db/save` writes to `pk="ANON"` too — so an unauthenticated caller
can also overwrite another user's draft.

Fix: derive `pk` from the session; reject when there is none. All three routes
share the `"ANON"` constant, so it is one change in three files.

## HIGH — unauthenticated document generation

No inbound auth on any of these; they generate filled forms from Airtable
records by id:

    POST /api/airtable/generate-ss4          POST /api/airtable/generate-2848
    POST /api/airtable/generate-ss4-batch    POST /api/airtable/generate-8821
    POST /api/airtable/generate-bylaws       POST /api/airtable/generate-shareholder-registry
    POST /api/airtable/generate-membership-registry
    POST /api/airtable/generate-organizational-resolution

The SS-4 and 2848/8821 outputs carry SSNs. An earlier pass of this audit
counted these as guarded; that was a false positive — the `API_KEY` match is
`AIRTABLE_API_KEY` / `OPENAI_API_KEY`, which are **outbound** credentials, not
an inbound check.

## HIGH — unauthenticated PII lookup

`GET /api/session/email?session_id=…` returns the Stripe customer email for any
session id. Stripe ids are high-entropy, but they leak via URLs, referrers and
logs, so this is a lookup oracle rather than a guessing target.

## MEDIUM — money-spending routes

`POST /api/domains/purchase` and `POST /api/phone/provision` have no auth
check. Confirm whether spend is gated downstream; if not, these are billable
actions any caller can trigger.

## LOW — infrastructure disclosure

`/api/test-env` and `/api/domains/env-debug` return `AWS_REGION`,
`DYNAMO_TABLE`, `DYNAMO_PK_NAME`, `DYNAMO_SK_NAME`, `DYNAMO_SK_VALUE`. No
credentials, but it names the table and key shape that the CRITICAL finding
above operates on.

Credit where due: `/api/debug-env` and `/api/debug/maps-key` deliberately mask
their secrets (`SET`/`NOT_SET`, first-4/last-4). They are safe as written.

## Also worth deleting

Twelve routes are named `test-*`, `debug-*`, `diag`, `search-mock` or
`webhooks/test`. Whatever their individual risk, dev scaffolding should not be
reachable in production.

---

## Suggested order

1. `db/list`, `db/load`, `db/save` — session-derived `pk`. Largest exposure,
   smallest change.
2. The eight `airtable/generate-*` routes — shared auth helper.
3. `session/email`.
4. Delete or env-gate the `test-*` / `debug-*` / `diag` routes.
5. Decide on `domains/purchase` and `phone/provision`.

Nothing here was tested against production. All findings are from reading the
route handlers.
