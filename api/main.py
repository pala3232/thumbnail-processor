"""
FastAPI service — exposes pipeline metrics to the frontend.
Queries: SQS (queue depth), S3 (thumbnails), Kubernetes API (pods).

Environment variables:
  AWS_REGION        e.g. us-east-1
  SQS_QUEUE_URL     full queue URL
  S3_BUCKET         bucket name
  S3_THUMBNAIL_PREFIX  prefix for thumbnails (default: thumbnails/)
"""

import os
import time
from typing import Optional
from datetime import datetime, timezone

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from kubernetes import client as k8s_client, config as k8s_config

app = FastAPI(title="Thumbnail Pipeline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── AWS clients (lazy, module-level) ──────────────────────────────────────────

_sqs = None
_s3 = None

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

# ── Kubernetes client (in-cluster when deployed, local kubeconfig for dev) ────

def get_k8s():
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api()

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/queue")
def queue():
    """Current queue depth + 30-point history (sampled every ~10s via CloudWatch)."""
    try:
        sqs = get_sqs()
        attrs = sqs.get_queue_attributes(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
            ],
        )["Attributes"]
        depth = int(attrs["ApproximateNumberOfMessages"])
        in_flight = int(attrs["ApproximateNumberOfMessagesNotVisible"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # CloudWatch for history (last 5 minutes, 1-minute granularity)
    try:
        cw = boto3.client("cloudwatch", region_name=os.environ["AWS_REGION"])
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


@app.get("/api/pods")
def pods():
    """List pods in the worker namespace."""
    namespace = os.environ.get("WORKER_NAMESPACE", "default")
    try:
        v1 = get_k8s()
        pod_list = v1.list_namespaced_pod(namespace=namespace)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    result = []
    for p in pod_list.items:
        started = p.status.start_time.isoformat() if p.status.start_time else None
        result.append({
            "name": p.metadata.name,
            "status": p.status.phase,
            "ready": all(cs.ready for cs in (p.status.container_statuses or [])),
            "restarts": sum(cs.restart_count for cs in (p.status.container_statuses or [])),
            "startedAt": started,
            "node": p.spec.node_name,
        })
    return result


@app.get("/api/thumbnails")
def thumbnails():
    """List thumbnails from S3."""
    bucket = os.environ["S3_BUCKET"]
    prefix = os.environ.get("S3_THUMBNAIL_PREFIX", "thumbnails/")
    try:
        s3 = get_s3()
        paginator = s3.get_paginator("list_objects_v2")
        items = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue
                url = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=3600,
                )
                # Derive frame position from filename suffix (_1/_2/_3)
                stem = key.rsplit(".", 1)[0]
                suffix = stem[-1] if stem[-1].isdigit() else "1"
                frame_map = {"1": "0%", "2": "50%", "3": "100%"}
                items.append({
                    "key": key,
                    "url": url,
                    "frame": frame_map.get(suffix, "0%"),
                    "lastModified": obj["LastModified"].isoformat(),
                    "size": obj["Size"],
                })
        return items
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/metrics")
def metrics():
    """High-level pipeline metrics."""
    try:
        sqs = get_sqs()
        attrs = sqs.get_queue_attributes(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        queue_depth = int(attrs["ApproximateNumberOfMessages"])
        in_flight = int(attrs["ApproximateNumberOfMessagesNotVisible"])
    except Exception:
        queue_depth, in_flight = 0, 0

    try:
        s3 = get_s3()
        bucket = os.environ["S3_BUCKET"]
        prefix = os.environ.get("S3_THUMBNAIL_PREFIX", "thumbnails/")
        resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        total_thumbnails = resp.get("KeyCount", 0)
        total_bytes = sum(o["Size"] for o in resp.get("Contents", []))
    except Exception:
        total_thumbnails, total_bytes = 0, 0

    try:
        v1 = get_k8s()
        namespace = os.environ.get("WORKER_NAMESPACE", "default")
        pod_list = v1.list_namespaced_pod(namespace=namespace)
        running_pods = sum(1 for p in pod_list.items if p.status.phase == "Running")
        total_pods = len(pod_list.items)
    except Exception:
        running_pods, total_pods = 0, 0

    return {
        "queueDepth": queue_depth,
        "inFlight": in_flight,
        "totalThumbnails": total_thumbnails,
        "storageBytes": total_bytes,
        "runningPods": running_pods,
        "totalPods": total_pods,
    }
