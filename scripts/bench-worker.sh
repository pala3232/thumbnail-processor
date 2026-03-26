#!/bin/bash
# Measures end-to-end processing time and throughput for the thumbnail pipeline.
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

# ── Resolve source keys + sizes ───────────────────────────────────────────────
declare -a SRC_KEYS
declare -A SRC_SIZES  # key → bytes

echo "Listing source bucket..."
RAW_LIST=$(aws s3 ls "s3://$SRC_BUCKET/" --region "$REGION" --recursive || true)

if $ALL; then
  while IFS= read -r line; do
    key=$(echo "$line" | awk '{print $4}')
    size=$(echo "$line" | awk '{print $3}')
    [[ -z "$key" || "$key" == */ ]] && continue
    SRC_KEYS+=("$key")
    SRC_SIZES["$key"]=$size
  done <<< "$RAW_LIST"
  [ ${#SRC_KEYS[@]} -eq 0 ] && echo "ERROR: no objects found in s3://$SRC_BUCKET/" && exit 1
else
  if [ -z "$SRC_KEY" ]; then
    SRC_KEY=$(echo "$RAW_LIST" | awk '{print $4}' | head -1 || true)
    [ -z "$SRC_KEY" ] && echo "ERROR: no objects found in s3://$SRC_BUCKET/" && exit 1
  fi
  SRC_SIZE=$(echo "$RAW_LIST" | awk -v k="$SRC_KEY" '$4==k {print $3}')
  [ -z "$SRC_SIZE" ] && SRC_SIZE=$(aws s3api head-object --bucket "$SRC_BUCKET" --key "$SRC_KEY" \
    --region "$REGION" --query ContentLength --output text 2>/dev/null || echo 0)
  for i in $(seq 1 "$COUNT"); do
    SRC_KEYS+=("$SRC_KEY")
    SRC_SIZES["$SRC_KEY"]=$SRC_SIZE
  done
fi

RUN_ID=$(date +%s)
declare -A START_TIMES
declare -A END_TIMES
declare -A STEM_SIZES  # stem → bytes
KEYS=()
BATCH_START_MS=$(date +%s%3N)

echo ""
echo "=== Thumbnail Pipeline Benchmark ==="
echo "Bucket : $BUCKET"
echo "Source : s3://$SRC_BUCKET"
echo "Region : $REGION"
echo "Files  : ${#SRC_KEYS[@]}"
echo "Run ID : $RUN_ID"
echo ""

# ── Upload phase ──────────────────────────────────────────────────────────────
echo "Uploading ${#SRC_KEYS[@]} video(s)..."

for i in "${!SRC_KEYS[@]}"; do
  ORIG_STEM=$(basename "${SRC_KEYS[$i]}")
  ORIG_STEM="${ORIG_STEM%.*}"
  KEY="uploads/bench_${RUN_ID}_${i}_${ORIG_STEM}.mp4"
  STEM="bench_${RUN_ID}_${i}_${ORIG_STEM}"
  KEYS+=("$KEY")

  START_TIMES["$STEM"]=$(date +%s%3N)
  STEM_SIZES["$STEM"]=${SRC_SIZES["${SRC_KEYS[$i]}"]}

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
      SIZE_BYTES=${STEM_SIZES[$STEM]:-0}
      SIZE_MB=$(awk "BEGIN {printf \"%.1f\", $SIZE_BYTES / 1048576}")
      echo "  ✓ $STEM — ${ELAPSED_S}s (${SIZE_MB} MB)"
    else
      STILL_PENDING+=("$KEY")
    fi
  done
  PENDING=("${STILL_PENDING[@]}")
  [ ${#PENDING[@]} -gt 0 ] && sleep "$POLL_INTERVAL"
done

BATCH_END_MS=$(date +%s%3N)

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
  TOTAL_BYTES=0

  for STEM in "${!END_TIMES[@]}"; do
    ELAPSED_MS=$(( END_TIMES[$STEM] - START_TIMES[$STEM] ))
    TOTAL_MS=$(( TOTAL_MS + ELAPSED_MS ))
    [ "$ELAPSED_MS" -lt "$MIN_MS" ] && MIN_MS=$ELAPSED_MS
    [ "$ELAPSED_MS" -gt "$MAX_MS" ] && MAX_MS=$ELAPSED_MS
    TOTAL_BYTES=$(( TOTAL_BYTES + ${STEM_SIZES[$STEM]:-0} ))
  done

  COMPLETED=${#END_TIMES[@]}
  TOTAL=${#SRC_KEYS[@]}
  AVG_MS=$(( TOTAL_MS / COMPLETED ))
  WALL_MS=$(( BATCH_END_MS - BATCH_START_MS ))
  WALL_S=$(awk "BEGIN {printf \"%.2f\", $WALL_MS / 1000}")
  TOTAL_GB=$(awk "BEGIN {printf \"%.3f\", $TOTAL_BYTES / 1073741824}")
  THROUGHPUT_GBPM=$(awk "BEGIN {printf \"%.4f\", ($TOTAL_BYTES / 1073741824) / ($WALL_MS / 60000)}")
  THROUGHPUT_MBPS=$(awk "BEGIN {printf \"%.2f\", ($TOTAL_BYTES / 1048576) / ($WALL_MS / 1000)}")

  echo "Completed   : $COMPLETED / $TOTAL"
  echo "Avg latency : $(awk "BEGIN {printf \"%.2f\", $AVG_MS / 1000}")s"
  echo "Min latency : $(awk "BEGIN {printf \"%.2f\", $MIN_MS / 1000}")s"
  echo "Max latency : $(awk "BEGIN {printf \"%.2f\", $MAX_MS / 1000}")s"
  echo "Wall time   : ${WALL_S}s"
  echo "Total data  : ${TOTAL_GB} GB"
  echo "Throughput  : ${THROUGHPUT_GBPM} GB/min  (${THROUGHPUT_MBPS} MB/s)"
  echo ""
fi
