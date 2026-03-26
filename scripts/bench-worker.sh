#!/bin/bash
# Measures end-to-end processing time for one or more videos through the thumbnail pipeline.
# Copies video(s) from the test source bucket into uploads/, polls for thumbnails/, reports timing.
#
# Usage:
#   ./bench-worker.sh -b <bucket> -s <source-bucket> [-k <source-key>] [-r <region>] [-n <count>] [-a]
#
#   -b  main S3 bucket name (required)
#   -s  test source bucket to copy from (required)
#   -k  specific key in source bucket to copy (default: first object found)
#   -r  AWS region (default: ap-southeast-2)
#   -n  number of copies of a single file to upload in parallel (default: 1)
#   -a  copy all files from the source bucket (ignores -k and -n)
#
# Examples:
#   ./bench-worker.sh -b my-bucket -s my-test-bucket -a
#   ./bench-worker.sh -b my-bucket -s my-test-bucket -k videos/sample.mp4 -n 10
#   ./bench-worker.sh -b my-bucket -s my-test-bucket -n 30

set -euo pipefail

REGION="ap-southeast-2"
COUNT=1
BUCKET=""
SRC_BUCKET=""
SRC_KEY=""
ALL=false
POLL_INTERVAL=3
TIMEOUT=300

usage() { echo "Usage: $0 -b <bucket> -s <source-bucket> [-k <source-key>] [-r <region>] [-n <count>] [-a]"; exit 1; }

while getopts "b:s:k:r:n:a" opt; do
  case $opt in
    b) BUCKET="$OPTARG" ;;
    s) SRC_BUCKET="$OPTARG" ;;
    k) SRC_KEY="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    a) ALL=true ;;
    *) usage ;;
  esac
done

[ -z "$BUCKET" ]     && echo "ERROR: -b <bucket> is required"        && usage
[ -z "$SRC_BUCKET" ] && echo "ERROR: -s <source-bucket> is required" && usage

# ── Resolve source keys ──────────────────────────────────────────────────────
declare -a SRC_KEYS

if $ALL; then
  mapfile -t SRC_KEYS < <(aws s3 ls "s3://$SRC_BUCKET/" --region "$REGION" --recursive \
    | awk '{print $4}' | grep -v '/$' || true)
  [ ${#SRC_KEYS[@]} -eq 0 ] && echo "ERROR: no objects found in s3://$SRC_BUCKET/" && exit 1
else
  if [ -z "$SRC_KEY" ]; then
    SRC_KEY=$(aws s3 ls "s3://$SRC_BUCKET/" --region "$REGION" --recursive \
      | awk '{print $4}' | head -1 || true)
    [ -z "$SRC_KEY" ] && echo "ERROR: no objects found in s3://$SRC_BUCKET/" && exit 1
  fi
  for i in $(seq 1 "$COUNT"); do SRC_KEYS+=("$SRC_KEY"); done
fi

RUN_ID=$(date +%s)
declare -A START_TIMES
declare -A END_TIMES
KEYS=()

echo ""
echo "=== Thumbnail Pipeline Benchmark ==="
echo "Bucket : $BUCKET"
echo "Source : s3://$SRC_BUCKET"
echo "Region : $REGION"
echo "Files  : ${#SRC_KEYS[@]}"
echo "Run ID : $RUN_ID"
echo ""

# ── Upload phase ─────────────────────────────────────────────────────────────
echo "Uploading ${#SRC_KEYS[@]} video(s)..."

for i in "${!SRC_KEYS[@]}"; do
  ORIG_STEM=$(basename "${SRC_KEYS[$i]}")
  ORIG_STEM="${ORIG_STEM%.*}"
  KEY="uploads/bench_${RUN_ID}_${i}_${ORIG_STEM}.mp4"
  STEM="bench_${RUN_ID}_${i}_${ORIG_STEM}"
  KEYS+=("$KEY")

  START_TIMES["$STEM"]=$(date +%s%3N)

  aws s3 cp "s3://$SRC_BUCKET/${SRC_KEYS[$i]}" "s3://$BUCKET/$KEY" \
    --region "$REGION" --quiet &
done

wait
echo "All uploads done. Polling for thumbnails..."
echo ""

# ── Poll phase ────────────────────────────────────────────────────────────────
DEADLINE=$(( $(date +%s) + TIMEOUT ))
PENDING=("${KEYS[@]}")

while [ ${#PENDING[@]} -gt 0 ] && [ "$(date +%s)" -lt "$DEADLINE" ]; do
  STILL_PENDING=()
  for KEY in "${PENDING[@]}"; do
    STEM=$(basename "$KEY" .mp4)
    THUMB="thumbnails/${STEM}_1.jpg"
    if aws s3 ls "s3://$BUCKET/$THUMB" --region "$REGION" &>/dev/null; then
      END_TIMES["$STEM"]=$(date +%s%3N)
      START=${START_TIMES[$STEM]}
      END=${END_TIMES[$STEM]}
      ELAPSED_MS=$(( END - START ))
      ELAPSED_S=$(awk "BEGIN {printf \"%.2f\", $ELAPSED_MS / 1000}")
      echo "  ✓ $STEM — ${ELAPSED_S}s"
    else
      STILL_PENDING+=("$KEY")
    fi
  done
  PENDING=("${STILL_PENDING[@]}")
  [ ${#PENDING[@]} -gt 0 ] && sleep "$POLL_INTERVAL"
done

# ── Timeout report ────────────────────────────────────────────────────────────
if [ ${#PENDING[@]} -gt 0 ]; then
  echo ""
  echo "TIMEOUT after ${TIMEOUT}s — ${#PENDING[@]} video(s) did not complete:"
  for KEY in "${PENDING[@]}"; do
    echo "  ✗ $(basename "$KEY" .mp4)"
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
if [ ${#END_TIMES[@]} -gt 0 ]; then
  echo ""
  echo "=== Summary ==="
  TOTAL_MS=0
  MIN_MS=999999999
  MAX_MS=0

  for STEM in "${!END_TIMES[@]}"; do
    ELAPSED_MS=$(( END_TIMES[$STEM] - START_TIMES[$STEM] ))
    TOTAL_MS=$(( TOTAL_MS + ELAPSED_MS ))
    [ "$ELAPSED_MS" -lt "$MIN_MS" ] && MIN_MS=$ELAPSED_MS
    [ "$ELAPSED_MS" -gt "$MAX_MS" ] && MAX_MS=$ELAPSED_MS
  done

  COMPLETED=${#END_TIMES[@]}
  TOTAL=${#SRC_KEYS[@]}
  AVG_MS=$(( TOTAL_MS / COMPLETED ))

  echo "Completed : $COMPLETED / $TOTAL"
  echo "Avg       : $(awk "BEGIN {printf \"%.2f\", $AVG_MS / 1000}")s"
  echo "Min       : $(awk "BEGIN {printf \"%.2f\", $MIN_MS / 1000}")s"
  echo "Max       : $(awk "BEGIN {printf \"%.2f\", $MAX_MS / 1000}")s"
  echo ""
fi
