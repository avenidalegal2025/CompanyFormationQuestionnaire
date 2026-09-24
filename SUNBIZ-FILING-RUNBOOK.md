# SunBiz Filing — Launch Runbook (2026-09-25 demo)

Live demo: Friday 2026-09-25, 5:00 PM — Antonio watches a real company get formed end-to-end.

## The chain

Questionnaire → Stripe payment → webhook generates documents + Twilio + Airtable record →
webhook sets `Autofill = "Yes"` → EC2 watcher (`i-0764ed6c3bda7a5c2`,
`autofill-watcher.service`, polls every ~10s) → Selenium fills efile.sunbiz.org →
payment via SSM `/llc/payment` card → Airtable `Formation Status = "Filed"` +
screenshots/logs in `s3://llc-filing-audit-trail-rodolfo/<COMPANY>/`.

## Pre-demo checklist (Friday morning)

1. `npm run verify-sunbiz-wiring -- --record <demo_record_id>` → expect **0 FAIL**
   (2 WARN tolerated: shared card, Spanish-purpose note if applicable).
2. RA gate must be green: `RA_FIRST_NAME`, `RA_LAST_NAME`, `RA_ADDRESS_*` set in
   `/home/ubuntu/.airtable_env` on the instance. While any default is in use the
   filer prints `RA_PLACEHOLDER_IN_USE` and the harness FAILs — **do not demo with it red**;
   the RA signature on the form is a legal attestation (s. 831.06, F.S.).
3. `systemctl is-enabled autofill-watcher` = enabled (harness checks this too).
   The 6-hourly GitHub monitor (`lambda-monitoring.yml`) now pages if the watcher dies.
4. Translation runs on AWS Bedrock (Nova Micro, us-east-1) billed to the Avenida Legal
   AWS account — no OpenAI top-up needed (their account hit zero credits 2026-09-24;
   OpenAI remains as fallback only). Verified on the instance: `RESTAURANTE → Restaurant`.
   If translation ever fails, the filer logs `PURPOSE_TRANSLATION_FAILED`, flags the
   record `Needs Review`, and refuses to file Spanish text.
5. `/llc/payment` card: valid, headroom for $125 (LLC) / $70 (Corp). Last rotated 2025-12-04.
6. Demo record data sanity: all managers have US addresses with state+zip (incomplete
   addresses now refuse to file by design), ownership sums to 100%, email valid.

## During the demo

Tail the watcher from any shell with AWS creds for account 043206426879:

```bash
aws ssm send-command --instance-ids i-0764ed6c3bda7a5c2 \
  --document-name AWS-RunShellScript --region us-west-1 \
  --parameters 'commands=["journalctl -u autofill-watcher -n 40 --no-pager"]'
# then read the output:
aws ssm get-command-invocation --command-id <id-from-above> \
  --instance-id i-0764ed6c3bda7a5c2 --region us-west-1 \
  --query StandardOutputContent --output text
```

Healthy signs: `Found 1 record(s)` → `Processing: <COMPANY>` → per-step screenshots
upload lines → `Completed` → Airtable flips to `Filed`.

## If the watcher stalls

Manual run for one record (safe to repeat; the form is idempotent until payment):

```bash
sudo systemctl stop autofill-watcher
sudo -u ubuntu bash -c 'cd /home/ubuntu/company-questionnaire; set -a; \
  source /home/ubuntu/.airtable_env; set +a; \
  DISPLAY=:1 python3 filing_dispatcher.py <record_id>'
sudo systemctl start autofill-watcher
```

Dry-run (never pays, never files; add `REAL_DATA_DRY_RUN=1` to see real data in the form):
same command with `DRY_RUN=1`.

Failure semantics: a failed attempt leaves the record armed and bumps `Autofill Attempts`;
3 strikes → `Needs Review` + disarm. To retry after fixing, set `Autofill = "Yes"`,
`Autofill Attempts = 0` on the record.

## Post-demo

- Airtable: `Formation Status = "Filed"`; S3 has payment confirmation screenshots.
- Clean the QA test records in Airtable (promised to Antonio): SAIGON SWING LLC
  (`recN2sAovpGkqCmV2`, Autofill=No, attempts 0 — already reset) and any `ZZ QA DO NOT FILE` rows.
- Antonio reviews the three new contract wordings (pro-rata "No", §7.6 distribution
  cadence, §11.4 minor-decisions item) shipped 2026-09-22.

## Known non-blockers (tracked)

- Watcher polls every ~10s via `Restart=always` (single-run script) — works; a
  timer-based unit would be cleaner.
- Live filings write `ssm_payment_dump.json` (card JSON) to the audit bucket — pre-existing;
  tighten after launch.
- `ssm_payment_dump` + SSM command history may contain the OpenAI key (set 2026-09-23) —
  rotate if desired.
- RA is a single constant for all filings (Antonio/Avenida). Per-client RA is a
  questionnaire + watcher change, not yet scheduled.
