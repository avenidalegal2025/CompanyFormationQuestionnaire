# Sunbiz filing bot — start → run → self-stop loop

EC2 `i-0764ed6c3bda7a5c2` ("LLC-Filing-Automation", account 043206426879, us-west-1).
Access via **SSM** (`aws ssm send-command ... --profile llc-admin --region us-west-1`).

## The loop
1. **START** — `LlcLambdaCdkStack-LLCTriggerLambda…` reads the instance id from SSM
   param `/llc/ec2/instance_id` and calls `ec2.start_instances`. (Invoked by the
   web app when a paid Florida formation needs filing.)
2. **RUN-ONCE** — on boot, `sunbiz-filing.service` runs `run_and_stop.sh`, which
   runs `autofill_watcher.py` once. The watcher queries Airtable for
   `Formation State=Florida AND Stripe Payment ID set AND Autofill=Yes AND
   status Pending/In Progress`, dispatches each (LLC → `llc_filing_airtable.py`,
   Corp → `corp_filing_airtable.py`), then exits. It does **not** loop.
3. **SELF-STOP** — when `AUTO_SHUTDOWN=1`, `run_and_stop.sh` issues `shutdown -h`.
   The instance's shutdown behavior is **stop** (not terminate), so the START
   lambda can bring it back next time.

## Components (this dir → box)
| file | installed to |
|------|--------------|
| `xvfb.service` | `/etc/systemd/system/xvfb.service` — virtual display `:1` for Firefox |
| `run_and_stop.sh` | `/home/ubuntu/company-questionnaire/run_and_stop.sh` (chmod +x) |
| `sunbiz-filing.service` | `/etc/systemd/system/sunbiz-filing.service` (enabled) |

The old `autofill-watcher.service` (static, no display, no self-stop) is superseded.

## Display
Firefox renders to **Xvfb on `:1`** (the scripts set `DISPLAY=:1`). The Feb-2026
outage (`Failed to decode response from marionette`) was because no X server was
running on `:1`; `xvfb.service` fixes that permanently.

## No-payment dry-run (verification)
`DRY_RUN=1` fills the entire Sunbiz form + screenshots every field to S3, then
**hard-stops before the Credit-Card-Payment / submit step** (gate in
`filing_utils.fill_payment_and_submit`). In dry-run nothing is charged, nothing
is filed, and the Airtable record is left untouched (no In-Progress/Filed write,
no SSM card fetch). Run manually:

```bash
DISPLAY=:1 DRY_RUN=1 python3 llc_filing_airtable.py recXXXXXXXXXXXXXX
```

Screenshots land in `s3://llc-filing-audit-trail-rodolfo/<COMPANY>/screenshots/`.

## Disarm the real loop
- Keep box alive after a run: set `Environment=AUTO_SHUTDOWN=0` in the unit.
- Stop auto-filing entirely: `systemctl disable sunbiz-filing.service`.
