#!/bin/bash
# Sunbiz filing — run-once, then self-stop the EC2 instance.
#
# This is the second half of the start -> run -> self-stop loop:
#   1. LLCTriggerLambda calls ec2.start_instances on this box (the START half).
#   2. On boot, sunbiz-filing.service runs THIS script:
#        - run the autofill watcher ONCE (processes all pending paid+Autofill=Yes
#          Florida records via filing_dispatcher.py, then exits — it does NOT loop),
#        - then, if AUTO_SHUTDOWN=1, issue an OS shutdown so the instance STOPS
#          (the instance's InstanceInitiatedShutdownBehavior is "stop", not terminate).
#
# Result: the box is only alive for the few minutes a filing actually takes,
# instead of running 24/7 (which is what wedged it after ~4 months).
set -uo pipefail

APP_DIR=/home/ubuntu/company-questionnaire
LOG=/home/ubuntu/filing_run.log
exec >>"$LOG" 2>&1

echo "==================================================================="
echo "==== $(date -u +%FT%TZ) sunbiz-filing run-once starting"
export DISPLAY="${DISPLAY:-:1}"
cd "$APP_DIR" || { echo "FATAL: $APP_DIR missing"; exit 1; }

# Airtable creds are provided by the unit's EnvironmentFile; source as a fallback.
if [ -f /home/ubuntu/.airtable_env ]; then
  set -a; . /home/ubuntu/.airtable_env; set +a
fi

python3 autofill_watcher.py
rc=$?
echo "==== watcher exited rc=$rc at $(date -u +%FT%TZ)"

if [ "${AUTO_SHUTDOWN:-0}" = "1" ]; then
  echo "AUTO_SHUTDOWN=1 -> stopping this instance in 10s"
  sleep 10
  sudo /sbin/shutdown -h now
else
  echo "AUTO_SHUTDOWN=$AUTO_SHUTDOWN -> NOT self-stopping (instance stays up)"
fi
