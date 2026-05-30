#!/usr/bin/env bash
# Layer 1 batch runner — run the first 100 variant IDs through the live Vercel
# e2e harness in parallel (4× concurrent processes), then audit the produced
# DOCXes via audit-e2e-docx.mjs.
#
# Wall-clock target: ~2 hours (100 variants × ~5 min/variant / 4× parallel).
# Resource: 4 concurrent Chromium sessions; each creates a unique Auth0 user
# via trimaran.llc+pfx<id><tag>@gmail.com so no collisions.
#
# Usage:
#   bash scripts/run-full100.sh                     # default: first 100 IDs
#   bash scripts/run-full100.sh 6 7 8 9             # specific IDs (any count)
#   E2E_RUN_TAG=foo bash scripts/run-full100.sh     # custom tag

set -uo pipefail

cd "$(dirname "$0")/.."

# The first 100 IDs (70 manual catalog PFX06-PFX100 with gaps at 26-50 + 30 generated).
DEFAULT_IDS="6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130"

if [ "$#" -gt 0 ]; then
  IDS=$(echo "$@" | tr ' ' ',')
else
  IDS="$DEFAULT_IDS"
fi

PARALLEL=${E2E_PARALLEL:-4}
RUN_TAG=${E2E_RUN_TAG:-full100}
COUNT=$(echo "$IDS" | tr ',' '\n' | wc -l)
PER_CHUNK=$(( (COUNT + PARALLEL - 1) / PARALLEL ))

LOG_DIR="/tmp/run-full100-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"
echo "Run-full100"
echo "  IDs: $COUNT total"
echo "  parallelism: $PARALLEL"
echo "  per-chunk:   $PER_CHUNK"
echo "  RUN_TAG:     $RUN_TAG"
echo "  log dir:     $LOG_DIR"

# Partition IDs into PARALLEL chunks (round-robin assignment for even mix).
echo "$IDS" | tr ',' '\n' | awk -v p="$PARALLEL" '{print NR % p, $1}' > "$LOG_DIR/_assignment.txt"

# Launch one process per chunk, each with its slice of IDs.
echo ""
echo "Launching $PARALLEL parallel processes..."
pids=()
for slot in $(seq 0 $((PARALLEL - 1))); do
  slot_ids=$(awk -v s="$slot" '$1==s {print $2}' "$LOG_DIR/_assignment.txt" | tr '\n' ' ')
  slot_count=$(echo "$slot_ids" | wc -w)
  echo "  slot $slot: $slot_count variants → $LOG_DIR/slot$slot.log"
  (
    LD_LIBRARY_PATH=/home/neotr/.local/pw-libs \
      E2E_RUN_TAG="$RUN_TAG" \
      node scripts/e2e-uat-edge-variants.mjs $slot_ids \
      > "$LOG_DIR/slot$slot.log" 2>&1
    echo $? > "$LOG_DIR/slot$slot.exit"
  ) &
  pids+=($!)
done

echo ""
echo "PIDs: ${pids[@]}"
echo "Tail logs:  for s in 0 1 2 3; do echo === slot \$s ===; tail -3 $LOG_DIR/slot\$s.log; done"
echo ""
echo "Waiting for all slots to complete (this will take ~2 hours)..."
for pid in "${pids[@]}"; do wait "$pid"; done

echo ""
echo "All slots complete. Exit codes:"
for slot in $(seq 0 $((PARALLEL - 1))); do
  ec=$(cat "$LOG_DIR/slot$slot.exit" 2>/dev/null || echo "?")
  count_pass=$(grep -c "PASS" "$LOG_DIR/slot$slot.log" || echo 0)
  echo "  slot $slot: exit=$ec PASS=$count_pass"
done

echo ""
echo "Running Layer 1 audit on produced DOCXes..."
ID_ARGS=$(echo "$IDS" | tr ',' ' ')
node scripts/audit-e2e-docx.mjs $ID_ARGS 2>&1 | tee "$LOG_DIR/_audit.log"

echo ""
echo "Done. All artifacts in: $LOG_DIR"
echo "Audit JSON:               /tmp/audit-e2e-docx-results.json"
