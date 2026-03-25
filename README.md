# Thumbnail Pipeline

Event-driven video thumbnail generator running on EKS Fargate.

## Architecture

```
Browser ──WebSocket──→ ALB ──/ws──→ FastAPI api service
        ──HTTP──────→ ALB ──/──→ Next.js frontend
                                        ↓ (internal)
                              FastAPI api service → SQS (queue depth + CloudWatch history)
                                                  → S3  (thumbnails + presigned URLs)
                                                  → K8s API (pod status)

S3 (uploads/) ──event notification──→ SQS ──→ Worker (Fargate) → S3 (thumbnails/)
```

**Supported video formats:** `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.wmv`, `.flv`, `.m4v`, `.ts`, `.3gp`

## Repository Structure

| Path | Description |
|---|---|
| `frontend/` | Next.js dashboard — real-time via WebSocket, 3D scene, metrics, pod grid, queue chart, thumbnail gallery |
| `api/` | FastAPI service — HTTP endpoints + WebSocket `/ws` that broadcasts all pipeline data every 5s |
| `worker/` | Python worker — polls SQS, generates 3 thumbnails per video via ffmpeg, uploads to S3 |
| `k8s/` | Kubernetes manifests (namespace, deployments, services, ingress) |
| `bootstrap-terraform/` | One-time infra: GH Actions IAM role, ECR repos, tfstate bucket |
| `terraform/` | Main infrastructure (EKS, VPC, IAM, SQS, S3, S3→SQS notification) |
| `scripts/` | Deploy scripts (KEDA, ALB controller, K8s manifests) |
| `.github/workflows/` | CI/CD — build & push to ECR, deploy/destroy infrastructure |

## Services

### worker
Polls SQS for messages. Each message body is an S3 key (`uploads/<filename>`).
1. Downloads video from S3
2. Extracts 3 thumbnails at 0%, 50%, 100% of video duration via ffmpeg
3. Uploads thumbnails to S3 under `thumbnails/<stem>_1.jpg`, `_2.jpg`, `_3.jpg`
4. Deletes the SQS message only after all uploads succeed (retries on failure via visibility timeout)

### api
FastAPI service — data source for the frontend.

**HTTP endpoints (also used as fallback):**
- `GET /health` — liveness check
- `GET /api/pods` — pod list from K8s API
- `GET /api/queue` — SQS queue depth + 30-point CloudWatch history
- `GET /api/thumbnails` — presigned S3 URLs for generated thumbnails
- `GET /api/metrics` — aggregated pipeline metrics

**WebSocket:**
- `WS /ws` — sends full pipeline state on connect, then broadcasts updates every 5s to all connected clients

### frontend
Next.js dashboard. Connects to the API via WebSocket for real-time updates (reconnects automatically with exponential backoff, 1s → 30s max).

- **Live badge** — green `LIVE` / red `DOWN` based on WebSocket connection state
- **Overview** — processed thumbnails, running pods, queue depth, in-flight, total pods, storage used
- **Fargate Pods** — live pod grid with status, ready state, restart count, uptime
- **Queue Activity** — SQS depth chart (30-min CloudWatch history)
- **Thumbnail Gallery** — filterable by frame position (0%, 50%, 100%)

## Ingress Routing

| Path | Backend | Notes |
|---|---|---|
| `/ws` | `thumbnail-api:8000` | WebSocket — routed directly to API |
| `/` | `thumbnail-frontend:3000` | Everything else through Next.js |

ALB idle timeout set to 3600s to keep WebSocket connections alive.

## S3 Event Trigger

Videos uploaded to `uploads/` in the S3 bucket automatically trigger an SQS message via S3 event notification. Supported extensions: `.mp4 .mov .mkv .avi .webm .wmv .flv .m4v .ts .3gp`

The worker receives the S3 key as the message body and processes it with ffmpeg (supports any ffmpeg-compatible format).

## Environment Variables

### frontend
| Variable | Description |
|---|---|
| `API_BASE_URL` | FastAPI internal URL (default: `http://thumbnail-api:8000`) |

### worker
| Variable | Description |
|---|---|
| `AWS_REGION` | e.g. `ap-southeast-2` |
| `SQS_QUEUE_URL` | Full SQS queue URL |
| `S3_BUCKET` | Bucket for videos and thumbnails |
| `S3_THUMBNAIL_PREFIX` | Prefix for thumbnails (default: `thumbnails/`) |

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
- `s3:GetObject` on `uploads/` prefix
- `s3:PutObject` on `thumbnails/` prefix

### api
- `sqs:GetQueueAttributes`
- `s3:ListBucket`, `s3:GetObject` on the thumbnails prefix
- `cloudwatch:GetMetricStatistics`
- K8s RBAC: `get`, `list` on `pods` in the worker namespace

## Deploy Order

### First time only — bootstrap (run once)

```
1. cd bootstrap-terraform && terraform init && terraform apply
   # Creates: GH Actions IAM role, ECR repos, tfstate bucket settings
   # State: s3://tfstate-pala3105/thumbnail/bootstrap.tfstate
```

Or trigger the `bootstrap.yml` workflow from GitHub Actions.

### Every deploy

```
2. terraform-apply.yml      # VPC, EKS, IAM, SQS, S3, S3→SQS notification
3. build-push-a.yml         # build & push images to ECR (set image_tag e.g. 1.0.5)
4. deploy-k8s.yml           # install KEDA + ALB controller + apply K8s manifests
```

### Tear down

```
5. terraform-destroy.yml    # deletes K8s resources, waits for ALB, then terraform destroy
   # ECR repos are NOT destroyed (managed by bootstrap)
```

## CI/CD Workflows

| Workflow | Trigger | Description |
|---|---|---|
| `bootstrap.yml` | manual | One-time: GH Actions role, ECR repos |
| `terraform-apply.yml` | manual | Provision VPC, EKS, IAM, SQS, S3 |
| `build-push-a.yml` | manual | Build & push Docker images to ECR |
| `deploy-k8s.yml` | manual | Deploy KEDA, ALB controller, K8s manifests |
| `terraform-destroy.yml` | manual | Tear down all infrastructure |

### GitHub Secrets required

| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | OIDC role ARN for GitHub Actions |
| `ECR_BASE_FRONTEND` | ECR repo URI for frontend |
| `ECR_BASE_WORKER` | ECR repo URI for worker |
| `ECR_BASE_API` | ECR repo URI for api |
| `S3_BUCKET_NAME` | S3 bucket name for videos/thumbnails |

## Kubernetes

- **Ingress:** AWS Load Balancer Controller (ALB), `target-type: ip` required for Fargate
- **Worker autoscaling:** KEDA `ScaledObject` — scales 0→10 based on SQS queue depth (target: 5 msgs/pod)
- **Frontend/API autoscaling:** HPA — scales on CPU (70% threshold, min 1, max 3)
- **Auth:** IRSA (IAM Roles for Service Accounts) — no static credentials in env vars
- **CoreDNS:** Fargate-compatible — `eks.amazonaws.com/compute-type: ec2` annotation patched out on deploy
- **NAT Gateway:** single NAT gateway for outbound internet access (ECR, SQS, S3 via gateway endpoint)
