"""
Thumbnail worker — polls SQS for video S3 keys, generates 3 thumbnails via ffmpeg,
uploads them to S3, then deletes the message.

Environment variables (from ConfigMap):
  AWS_REGION
  SQS_QUEUE_URL
  S3_BUCKET
  S3_THUMBNAIL_PREFIX  (default: thumbnails/)
"""

import json
import os
import logging
import tempfile
import time
from urllib.parse import unquote_plus

import boto3
import ffmpeg

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

AWS_REGION          = os.environ["AWS_REGION"]
SQS_QUEUE_URL       = os.environ["SQS_QUEUE_URL"]
S3_BUCKET           = os.environ["S3_BUCKET"]
THUMBNAIL_PREFIX    = os.environ.get("S3_THUMBNAIL_PREFIX", "thumbnails/")
VISIBILITY_TIMEOUT  = 120   # seconds — must exceed max processing time
WAIT_TIME           = 20    # long polling — reduces empty receives
FRAME_POSITIONS     = [0.1, 0.5, 0.95]  # 10%, 50%, 95% of video duration

sqs = boto3.client("sqs", region_name=AWS_REGION)
s3  = boto3.client("s3",  region_name=AWS_REGION)


def parse_s3_key(body: str) -> str | None:
    """Parse SQS message body. Returns S3 key, or None if the message should be skipped."""
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return body.strip()  # plain-text key (legacy)

    # AWS sends a test event when the notification is first created — delete and skip
    if data.get("Event") == "s3:TestEvent":
        return None

    records = data.get("Records", [])
    if not records:
        return None

    return unquote_plus(records[0]["s3"]["object"]["key"])


def get_video_duration(path: str) -> float:
    probe = ffmpeg.probe(path)
    return float(probe["format"]["duration"])


def extract_thumbnail(video_path: str, output_path: str, timestamp: float) -> None:
    (
        ffmpeg
        .input(video_path, ss=timestamp)
        .output(output_path, vframes=1, format="image2", vcodec="mjpeg")
        .overwrite_output()
        .run(quiet=True)
    )


def process_message(receipt_handle: str, s3_key: str) -> None:
    log.info(f"processing: {s3_key}")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "video")

        # 1. Download video from S3
        log.info(f"downloading s3://{S3_BUCKET}/{s3_key}")
        s3.download_file(S3_BUCKET, s3_key, video_path)

        # 2. Get duration
        duration = get_video_duration(video_path)
        log.info(f"duration: {duration:.2f}s")

        # 3. Extract thumbnails at 0%, 50%, 100%
        stem = os.path.splitext(os.path.basename(s3_key))[0]
        thumbnail_paths = []
        for i, position in enumerate(FRAME_POSITIONS, start=1):
            timestamp = duration * position
            out_path = os.path.join(tmpdir, f"thumb_{i}.jpg")
            extract_thumbnail(video_path, out_path, timestamp)
            thumbnail_paths.append((i, out_path))
            log.info(f"extracted frame {i} at {timestamp:.2f}s")

        # 4. Upload thumbnails to S3 — all must succeed before deleting message
        for i, thumb_path in thumbnail_paths:
            dest_key = f"{THUMBNAIL_PREFIX}{stem}_{i}.jpg"
            s3.upload_file(
                thumb_path,
                S3_BUCKET,
                dest_key,
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            log.info(f"uploaded s3://{S3_BUCKET}/{dest_key}")

    # 5. Delete message only after all uploads succeed
    sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt_handle)
    log.info(f"deleted message for {s3_key}")


def poll() -> None:
    log.info("worker started, polling SQS...")
    while True:
        try:
            resp = sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=WAIT_TIME,        # long polling
                VisibilityTimeout=VISIBILITY_TIMEOUT,
            )
            messages = resp.get("Messages", [])
            if not messages:
                continue

            msg = messages[0]
            receipt_handle = msg["ReceiptHandle"]
            s3_key = parse_s3_key(msg["Body"])

            if s3_key is None:
                sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt_handle)
                log.info("skipped and deleted non-video message")
                continue

            try:
                process_message(receipt_handle, s3_key)
            except Exception as e:
                # Don't delete — let visibility timeout expire so another pod retries
                log.error(f"failed to process {s3_key}: {e}")

        except Exception as e:
            log.error(f"poll error: {e}")
            time.sleep(5)


if __name__ == "__main__":
    poll()
