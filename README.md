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
| `bootstrap-terraform/` | One-time infra: GH Actions IAM role, ECR repos, tfstate bucket config |
| `terraform/` | Main infrastructure (EKS, VPC, IAM, SQS, S3) — destroy/recreate freely |
| `scripts/` | Deploy scripts (KEDA, ALB controller, K8s manifests) |
| `.github/workflows/` | CI/CD — build & push to ECR, deploy/destroy infrastructure |

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

### frontend
| Variable | Description |
|---|---|
| `API_BASE_URL` | FastAPI service URL (default: `http://thumbnail-api:8000`) |

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
2. terraform-apply.yml      # VPC, EKS, IAM, SQS, S3
3. build-push-a.yml         # build & push images to ECR (set image_tag e.g. 1.0.0)
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

- Ingress: AWS Load Balancer Controller (ALB), `target-type: ip` required for Fargate
- Worker autoscaling: KEDA `ScaledObject` — scales 0→10 based on SQS queue depth (target: 5 msgs/pod)
- Frontend/API autoscaling: HPA — scales on CPU (70% threshold, min 1, max 3)
- Auth: IRSA (IAM Roles for Service Accounts) — no credentials in env vars
- The api pod needs a ServiceAccount with K8s RBAC to list pods
