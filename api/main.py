"""
FastAPI service — exposes pipeline data via HTTP and WebSocket.
Queries: SQS (queue depth), S3 (thumbnails), Kubernetes API (pods), CloudWatch (history).

Environment variables:
  AWS_REGION
  SQS_QUEUE_URL
  S3_BUCKET
  S3_THUMBNAIL_PREFIX  (default: thumbnails/)
  WORKER_NAMESPACE     (default: default)
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import boto3
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from kubernetes import client as k8s_client, config as k8s_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── AWS clients ────────────────────────────────────────────────────────────────

_sqs = None
_s3  = None

def get_sqs():
    global _sqs
    if _sqs is None:
        _sqs = boto3.client("sqs", region_name=os.environ["AWS_REGION"])
    return _sqs

def get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    return _s3

# ── Kubernetes client ──────────────────────────────────────────────────────────

def get_k8s():
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api()

# ── WebSocket connection manager ───────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, data: dict):
        dead: set[WebSocket] = set()
        for ws in self.active.copy():
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self.active -= dead

manager = ConnectionManager()

# ── Sync data helpers (run in thread pool via asyncio.to_thread) ───────────────

def _fetch_metrics() -> dict:
    try:
        attrs = get_sqs().get_queue_attributes(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        queue_depth = int(attrs["ApproximateNumberOfMessages"])
        in_flight   = int(attrs["ApproximateNumberOfMessagesNotVisible"])
    except Exception:
        queue_depth, in_flight = 0, 0

    try:
        bucket = os.environ["S3_BUCKET"]
        prefix = os.environ.get("S3_THUMBNAIL_PREFIX", "thumbnails/")
        resp   = get_s3().list_objects_v2(Bucket=bucket, Prefix=prefix)
        total_thumbnails = resp.get("KeyCount", 0)
        total_bytes      = sum(o["Size"] for o in resp.get("Contents", []))
    except Exception:
        total_thumbnails, total_bytes = 0, 0

    try:
        namespace = os.environ.get("WORKER_NAMESPACE", "default")
        pod_list  = get_k8s().list_namespaced_pod(namespace=namespace)
        running_pods = sum(1 for p in pod_list.items if p.status.phase == "Running")
        total_pods   = len(pod_list.items)
    except Exception:
        running_pods, total_pods = 0, 0

    return {
        "queueDepth":      queue_depth,
        "inFlight":        in_flight,
        "totalThumbnails": total_thumbnails,
        "storageBytes":    total_bytes,
        "runningPods":     running_pods,
        "totalPods":       total_pods,
    }


def _fetch_queue() -> dict:
    try:
        attrs = get_sqs().get_queue_attributes(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
            ],
        )["Attributes"]
        depth     = int(attrs["ApproximateNumberOfMessages"])
        in_flight = int(attrs["ApproximateNumberOfMessagesNotVisible"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        cw  = boto3.client("cloudwatch", region_name=os.environ["AWS_REGION"])
        now = datetime.now(timezone.utc)
        resp = cw.get_metric_statistics(
            Namespace="AWS/SQS",
            MetricName="ApproximateNumberOfMessagesVisible",
            Dimensions=[{"Name": "QueueName", "Value": os.environ["SQS_QUEUE_URL"].split("/")[-1]}],
            StartTime=datetime(now.year, now.month, now.day, now.hour, now.minute - 30, tzinfo=timezone.utc),
            EndTime=now,
            Period=60,
            Statistics=["Average"],
        )
        history = [
            {"time": pt["Timestamp"].strftime("%H:%M"), "depth": int(pt["Average"])}
            for pt in sorted(resp["Datapoints"], key=lambda x: x["Timestamp"])
        ]
    except Exception:
        history = []

    return {"depth": depth, "inFlight": in_flight, "history": history}


def _fetch_pods() -> list:
    namespace = os.environ.get("WORKER_NAMESPACE", "default")
    try:
        pod_list = get_k8s().list_namespaced_pod(namespace=namespace)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    result = []
    for p in pod_list.items:
        started = p.status.start_time.isoformat() if p.status.start_time else None
        result.append({
            "name":      p.metadata.name,
            "status":    p.status.phase,
            "ready":     all(cs.ready for cs in (p.status.container_statuses or [])),
            "restarts":  sum(cs.restart_count for cs in (p.status.container_statuses or [])),
            "startedAt": started,
            "node":      p.spec.node_name,
        })
    return result


def _fetch_thumbnails() -> list:
    bucket = os.environ["S3_BUCKET"]
    prefix = os.environ.get("S3_THUMBNAIL_PREFIX", "thumbnails/")
    try:
        paginator = get_s3().get_paginator("list_objects_v2")
        items = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue
                url = get_s3().generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=3600,
                )
                stem      = key.rsplit(".", 1)[0]
                suffix    = stem[-1] if stem[-1].isdigit() else "1"
                frame_map = {"1": "0%", "2": "50%", "3": "100%"}
                items.append({
                    "key":          key,
                    "url":          url,
                    "frame":        frame_map.get(suffix, "0%"),
                    "lastModified": obj["LastModified"].isoformat(),
                    "size":         obj["Size"],
                })
        return items
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


async def collect_state() -> dict[str, Any]:
    metrics, queue, pods, thumbnails = await asyncio.gather(
        asyncio.to_thread(_fetch_metrics),
        asyncio.to_thread(_fetch_queue),
        asyncio.to_thread(_fetch_pods),
        asyncio.to_thread(_fetch_thumbnails),
        return_exceptions=True,
    )
    return {
        "metrics":    metrics    if not isinstance(metrics,    Exception) else None,
        "queue":      queue      if not isinstance(queue,      Exception) else None,
        "pods":       pods       if not isinstance(pods,       Exception) else [],
        "thumbnails": thumbnails if not isinstance(thumbnails, Exception) else [],
    }


async def broadcast_loop():
    while True:
        await asyncio.sleep(5)
        if not manager.active:
            continue
        try:
            state = await collect_state()
            await manager.broadcast(state)
        except Exception as e:
            log.error(f"broadcast error: {e}")

# ── App ────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(broadcast_loop())
    yield
    task.cancel()

app = FastAPI(title="Thumbnail Pipeline API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── HTTP routes ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/metrics")
def metrics():
    return _fetch_metrics()

@app.get("/api/queue")
def queue():
    return _fetch_queue()

@app.get("/api/pods")
def pods():
    return _fetch_pods()

@app.get("/api/thumbnails")
def thumbnails():
    return _fetch_thumbnails()

@app.post("/api/test")
def trigger_test():
    """Copy videos from TEST_SOURCE_BUCKET into uploads/ to trigger the pipeline."""
    source_bucket = os.environ.get("TEST_SOURCE_BUCKET")
    if not source_bucket:
        raise HTTPException(status_code=400, detail="TEST_SOURCE_BUCKET not configured")

    VIDEO_EXTENSIONS = ('.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.flv', '.m4v', '.ts', '.3gp')
    dest_bucket = os.environ["S3_BUCKET"]
    s3 = get_s3()

    try:
        resp = s3.list_objects_v2(Bucket=source_bucket)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not list source bucket: {e}")

    copied = 0
    skipped = 0
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if not key.lower().endswith(VIDEO_EXTENSIONS):
            skipped += 1
            continue
        dest_key = f"uploads/{key.split('/')[-1]}"
        try:
            s3.copy_object(
                CopySource={"Bucket": source_bucket, "Key": key},
                Bucket=dest_bucket,
                Key=dest_key,
            )
            copied += 1
            log.info(f"test: copied s3://{source_bucket}/{key} → s3://{dest_bucket}/{dest_key}")
        except Exception as e:
            log.error(f"test: failed to copy {key}: {e}")

    return {"queued": copied, "skipped": skipped}

# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    log.info(f"WS connected: {ws.client} — active: {len(manager.active)}")
    try:
        # Send current state immediately on connect
        state = await collect_state()
        await ws.send_json(state)
        # Keep alive — client sends "ping" every 30s
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error(f"WS error: {e}")
    finally:
        manager.disconnect(ws)
        log.info(f"WS disconnected: {ws.client} — active: {len(manager.active)}")
