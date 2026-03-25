# Thumbnail Pipeline

Event-driven video thumbnail generator running on EKS Fargate.

## Architecture

```
Browser → ALB → Next.js frontend
                     ↓
              FastAPI api service → SQS (queue depth)
                                  → S3  (thumbnails)
                                  → K8s API (pod status)

SQS → Worker (Fargate Job) → S3 (download video, upload thumbnails)
```

## Repository Structure

| Path | Description |
|---|---|
| `frontend/` | Next.js 14 dashboard (3D pipeline view, metrics, thumbnails) |
| `api/` | FastAPI service — exposes SQS/S3/K8s metrics to the frontend |
| `worker/` | Python worker — polls SQS, generates thumbnails via ffmpeg, uploads to S3 |
| `k8s/` | Kubernetes manifests (namespace, deployments, services, ingress) |
| `terraform/` | Infrastructure (EKS, SQS, S3, ECR, IAM) |
| `.github/workflows/` | CI/CD — build & push to ECR |

## Services

### worker
Polls SQS for messages. Each message is an S3 key for a video file.
1. Downloads video from S3
2. Generates 3 thumbnails at 0%, 50%, 100% via ffmpeg
3. Uploads thumbnails to S3 under `thumbnails/` prefix
4. Deletes the SQS message on success

### api
FastAPI service that the frontend queries for live data:
- `GET /api/pods` — worker pod list from K8s API
- `GET /api/queue` — SQS queue depth + CloudWatch history
- `GET /api/thumbnails` — presigned S3 URLs for generated thumbnails
- `GET /api/metrics` — aggregated pipeline metrics

### frontend
Next.js dashboard with:
- 3D interactive pipeline scene (React Three Fiber)
- Live pod status grid
- SQS queue depth chart
- Thumbnail gallery (filterable by frame position)

## Environment Variables

### worker
| Variable | Description |
|---|---|
| `AWS_REGION` | e.g. `ap-southeast-2` |
| `SQS_QUEUE_URL` | Full SQS queue URL |
| `S3_BUCKET` | Bucket for videos and thumbnails |

### api
| Variable | Description |
|---|---|
| `AWS_REGION` | e.g. `ap-southeast-2` |
| `SQS_QUEUE_URL` | Full SQS queue URL |
| `S3_BUCKET` | Bucket name |
| `S3_THUMBNAIL_PREFIX` | Prefix for thumbnails (default: `thumbnails/`) |
| `WORKER_NAMESPACE` | K8s namespace to list pods from (default: `default`) |

## Required IAM Permissions

### worker
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`
- `s3:GetObject` on the video bucket
- `s3:PutObject` on the `thumbnails/` prefix

### api
- `sqs:GetQueueAttributes`
- `s3:ListBucket`, `s3:GetObject` on the thumbnails prefix
- `cloudwatch:GetMetricStatistics`
- K8s RBAC: `get`, `list` on `pods` in the worker namespace

## CI/CD

Workflow: `.github/workflows/build-push-a.yml`

Trigger: `workflow_dispatch` with inputs:
- `service`: `frontend`, `worker`, `api` — leave blank to build all
- `image_tag`: semver tag (e.g. `1.3.0`)
- `environment`: `dev`, `staging`, `prod` (default: `dev`)

Secrets required in GitHub:
- `AWS_ROLE_ARN` — OIDC role for GitHub Actions
- `ECR_BASE_FRONTEND` — ECR repo URI for frontend
- `ECR_BASE_WORKER` — ECR repo URI for worker
- `ECR_BASE_API` — ECR repo URI for api

## Kubernetes

- Ingress: AWS Load Balancer Controller (ALB), `target-type: ip` required for Fargate
- Autoscaling: HPA on the worker deployment based on CPU/memory
- Auth: IRSA (IAM Roles for Service Accounts) — no credentials in env vars
- The api pod needs a ServiceAccount with K8s RBAC to list pods
