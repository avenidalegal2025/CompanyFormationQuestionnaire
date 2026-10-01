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

**Evidence video:** every run is screen-recorded (ffmpeg on the Xvfb display) and
uploaded to `s3://llc-filing-audit-trail-rodolfo/<COMPANY>/videos/`; the record's
`Filing Video` column gets a presigned URL. This happens on success AND on
failure (the video shows where a failed run broke). Dry-run videos carry a
`DRYRUN_` prefix.

**How long the link actually lasts.** A presigned URL dies with the credentials
that signed it. On the EC2 the filer runs under an instance role, so it signs
with temporary STS credentials (`ASIA...`) valid for hours — the old code asked
for 7 days and produced links that returned `ExpiredToken` the same day
(2026-09-29: the rehearsal link in Airtable was dead the next morning while the
mp4 sat fine in S3). The filer now caps the link to the credentials' real
remaining life and logs it: `Link valid Nh`, plus `VIDEO_LINK_SHORT_LIVED` when
it is under 7 days. **Expect ~5 hours, not 7 days.**

To get a real 7-day link, put long-lived signer keys in SSM
`/llc/video_signer` (base64 JSON: `aws_access_key_id`, `aws_secret_access_key`,
for a user with only `s3:GetObject` on this bucket); the filer picks them up
automatically. Either way the S3 object never expires — only the link does, so
download the mp4 if Antonio needs to keep it.

**Video validation:** `stop_screen_recording` (filing_utils.py) stops ffmpeg with
SIGINT (same finalize path as `q`, but not dependent on ffmpeg reading stdin) and
then ffprobe-checks the mp4 before upload. If the recording is empty or truncated
(no `moov` atom — happens when ffmpeg is SIGKILLed or the shell/session dies
mid-run), the log shows `SCREEN_RECORDING_EMPTY` / `SCREEN_RECORDING_INVALID` and
nothing is uploaded or linked, so a broken video never lands on the Airtable
record. Lesson from 2026-09-24: never launch a second manual (sudo) watcher run
alongside the service — both record at once, and the orphaned one gets killed
mid-write. One runner at a time.

## Watcher safety rules (since 2026-09-30)

`autofill_watcher.py` enforces these itself, however it is started:

- **A rehearsal never changes a record.** With `DRY_RUN=1` or `TEST_CARD=1` in the
  environment it runs the real browser flow and uploads the video, but does not set
  `In Progress`, does not clear `Autofill`, does not count an attempt and does not
  link the video. Before this, a rehearsal "completed" the record with fake data and
  disarmed it, so the real filing never ran.
- **One watcher at a time** (`flock` on `/tmp/sunbiz-autofill.lock`). A second
  instance exits with code 3.
- **No live filing with the placeholder Registered Agent.** If any `RA_*` variable
  is missing and it is not a rehearsal, it exits with code 2 before touching any
  record. Rehearsals may run without them (they use fake data).
- **It loads `/home/ubuntu/.airtable_env` itself** (existing env vars win), so a
  manual run sees the same config as `sunbiz-filing.service`.

Incident that motivated this: a hand-started `/tmp/autofill_loop.sh` (root, since
2026-06-30, `DRY_RUN=1` hard-coded, no RA env) polled every 15 s, took every paid
record before the boot service, filed it on SunBiz as "ZZ QA DO NOT FILE LLC" and
disarmed it. Stopped and renamed `.DISABLED_20260930` on 2026-09-30.
Never start the watcher in a loop by hand; the boot service is the only runner.

To watch a real record's rehearsal with its real data (stops before payment, record untouched):

```bash
sudo -u ubuntu bash -c 'cd /home/ubuntu/company-questionnaire;   DRY_RUN=1 REAL_DATA_DRY_RUN=1 DISPLAY=:1 python3 filing_dispatcher.py <record_id>'
```

## If the watcher stalls

Manual run for one record (safe to repeat; the form is idempotent until payment):

```bash
sudo -u ubuntu bash -c 'cd /home/ubuntu/company-questionnaire; set -a; \
  source /home/ubuntu/.airtable_env; set +a; \
  DISPLAY=:1 python3 filing_dispatcher.py <record_id>'
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
