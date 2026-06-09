# First Paid UAT — fire-on-signal runbook (2026-06-09)

Full pipeline VERIFIED in test mode end-to-end (docs + Twilio-ready + Sunbiz-decline).
The only deltas to the real run are inputs only the Stripe account owner can provide.

## Status (what's already done / golden)
- ✅ Front end → checkout → webhook → **all 6 docs** (Operating Agreement, Membership
  Registry, Org Resolution, SS-4, 2848, 8821) — content-audited PASS.
- ✅ Webhook **event-level idempotency** deployed (no more duplicate formations) — verified.
- ✅ EC2 Sunbiz filer **fixed + armed**; TEST_CARD decline path verified on real records.
- ✅ `$1 DEMO_DOLLAR` code **deployed to prod, OFF by default** (no `DEMO_DOLLAR` env set).
- ✅ Twilio creds in Vercel; `/api/phone/provision` + harness `UAT_FORWARD_PHONE_E164` opt-in ready.

## 🔴 Inputs still required (only you / Antonio)
1. `sk_live_…`  (Stripe live secret key)
2. `pk_live_…`  (Stripe live publishable key)
3. `whsec_…`    (Stripe **live** webhook signing secret — add a Live endpoint to
   `https://company-formation-questionnaire.vercel.app/api/webhooks/stripe`, event
   `checkout.session.completed`)
4. A **real card** (live mode rejects 4242)
5. **`UAT_FORWARD_PHONE_E164`** — the phone the Twilio number forwards to (e.g. `+1305…`)
6. **Allowlist email** for `DEMO_DOLLAR_EMAILS` (the UAT signup email, or `*`)

## Fire sequence (once inputs in hand)
```bash
cd /mnt/c/Users/neotr/Documents/AvenidaLegal/CompanyFormationQuestionnaire
# 1. Swap Stripe test->live + enable the $1 gate (mark sk/whsec sensitive)
vercel env rm STRIPE_SECRET_KEY production --yes && echo 'sk_live_XXX' | vercel env add STRIPE_SECRET_KEY production
vercel env rm NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production --yes && echo 'pk_live_XXX' | vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env rm STRIPE_WEBHOOK_SECRET production --yes && echo 'whsec_XXX' | vercel env add STRIPE_WEBHOOK_SECRET production
echo '1'            | vercel env add DEMO_DOLLAR production
echo '<uat-email>'  | vercel env add DEMO_DOLLAR_EMAILS production
# 2. Redeploy so env takes effect
vercel --prod --yes
# 3. Run the real UAT — $1 live charge + real Twilio number, one LLC
export UAT_FORWARD_PHONE_E164='+1XXXXXXXXXX'
export STRIPE_CARD='<REAL card>'   # harness fills 4242 by default; live mode needs a real card
node scripts/e2e-uat-edge-variants.mjs 6   # LLC sole member (or 8 for 4-owner all-covenants)
# 4. Sunbiz step on the created record (TEST_CARD decline — NO real $125 state filing):
#    find the Airtable record id, then on EC2 i-0764ed6c3bda7a5c2 (SSM):
#    DISPLAY=:1 TEST_CARD=1 python3 filing_dispatcher.py <recId>
```

## Verify
- Stripe **live** dashboard: one **$1.00** paid charge.
- Dashboard: 6 docs generated + downloadable; **exactly one** Airtable Formations record.
- Twilio console: one new number; call it → rings `UAT_FORWARD_PHONE_E164`.
- Sunbiz: filer reaches payment, card declines, **no $125 charge, no state filing**.

## After the UAT (teardown)
- `vercel env rm DEMO_DOLLAR production --yes` (+ `DEMO_DOLLAR_EMAILS`) → `vercel --prod` to restore full price.
- Release the Twilio number (or keep it, ~$1.15/mo).
- EC2: stop the instance (`aws ec2 stop-instances`) — START Lambda brings it back on demand.
- Merge branch `fix/sunbiz-filer-loop` to main.
