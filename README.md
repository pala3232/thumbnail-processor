# Thumbnail Pipeline

Event-driven video thumbnail generator running on EKS (hybrid EC2 + Fargate).

## Architecture

<a href="images/architecture.svg"><img src="images/architecture.svg" width="100%"></a>

**Supported video formats:** `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.wmv`, `.flv`, `.m4v`, `.ts`, `.3gp`

## Dashboard

![Dashboard](images/3.png)

## Repository Structure

| Path | Description |
|---|---|
| `frontend/` | Next.js dashboard — real-time via WebSocket, 3D scene, metrics, pod grid, queue chart, thumbnail gallery |
| `api/` | FastAPI service — HTTP endpoints + WebSocket `/ws` that broadcasts all pipeline data every 5s |
| `worker/` | Python worker — polls SQS, generates 3 thumbnails per video via ffmpeg, uploads to S3 |
| `k8s/` | Kubernetes manifests (namespace, deployments, services, ingress) |
| `bootstrap-terraform/` | One-time infra: GH Actions IAM role, ECR repos, tfstate bucket |
| `terraform/` | Main infrastructure (EKS, VPC, IAM, SQS, S3, S3→SQS notification, Container Insights) |
| `terraform-monitoring/` | CloudWatch alarms + SNS email alerts for DLQ, ALB 5xx, response time, connections |
| `route53/` | DNS + TLS — Route53 hosted zone, ACM certificate, A record (applied last, after K8s) |
| `scripts/` | Deploy scripts (KEDA, ALB controller, K8s manifests) |
| `.github/workflows/` | CI/CD — build & push to ECR, deploy/destroy infrastructure |

## Services

### worker
Polls SQS for S3 event notification messages. Parses the JSON body to extract the S3 key.
1. Downloads video from S3
2. Extracts 3 thumbnails at 10%, 50%, 95% of video duration via ffmpeg
3. Uploads thumbnails to S3 under `thumbnails/<stem>_1.jpg`, `_2.jpg`, `_3.jpg`
4. Deletes the SQS message only after all uploads succeed (retries on failure via visibility timeout)
5. Skips and deletes S3 test events (`s3:TestEvent`) sent when the notification is first created

### api
FastAPI service — data source for the frontend.

**HTTP endpoints (also used as fallback):**
- `GET /health` — liveness check
- `GET /api/pods` — pod list from K8s API
- `GET /api/queue` — SQS queue depth + in-memory history (5 min at 5s resolution)
- `POST /api/test` — copies videos from test source bucket into `uploads/` to trigger the pipeline
- `DELETE /api/purge` — deletes all objects under `uploads/` and `thumbnails/` in the main bucket
- `GET /api/thumbnails` — presigned S3 URLs for generated thumbnails
- `GET /api/metrics` — aggregated pipeline metrics

**WebSocket:**
- `WS /ws` — sends full pipeline state on connect, then broadcasts updates every 5s to all connected clients

### frontend
Next.js dashboard. Connects to the API via WebSocket for real-time updates (reconnects automatically with exponential backoff, 1s → 30s max).

- **Live badge** — green `LIVE` / red `DOWN` based on WebSocket connection state
- **Overview** — processed thumbnails, running pods, queue depth, in-flight, total pods, storage used
- **Worker Pods** — live pod grid with status, ready state, restart count, uptime
- **Queue Activity** — SQS depth chart (5-min in-memory history at 5s resolution)
- **Thumbnail Gallery** — filterable by frame position (10%, 50%, 95%)
- **Test Pipeline button** — copies videos from the test source bucket into `uploads/` to trigger the pipeline
- **Purge button** — deletes all uploads and thumbnails from S3 to reset pipeline state

## Ingress Routing

| Path | Backend | Notes |
|---|---|---|
| `/ws` | `thumbnail-api:8000` | WebSocket — routed directly to API |
| `/` | `thumbnail-frontend:3000` | Everything else through Next.js |

ALB idle timeout set to 3600s to keep WebSocket connections alive.

ALB health check path set to `/health` for all backends — the API serves `GET /health` returning 200, and the frontend serves `GET /health` via a Next.js route. Without this, ALB defaults to checking `/` on the API (which returns 404), marking the target unhealthy and dropping new WebSocket connections.

Uvicorn WebSocket ping interval set to 3600s — ALB does not correctly handle protocol-level ping/pong frames on backend connections. The 5s application broadcast keeps the connection alive; protocol pings are unnecessary and cause disconnects.

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
| `TEST_SOURCE_BUCKET` | S3 bucket containing test videos for the Test Pipeline button |

## Required IAM Permissions

### worker
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`
- `s3:GetObject` on `uploads/` prefix
- `s3:PutObject` on `thumbnails/` prefix

### api
- `sqs:GetQueueAttributes`
- `s3:ListBucket`, `s3:GetObject` on the thumbnails prefix
- `s3:PutObject` on `uploads/` prefix (for Test Pipeline button)
- `s3:DeleteObject` on the main bucket (for Purge button)
- `s3:ListBucket`, `s3:GetObject` on the test source bucket
- K8s RBAC: `get`, `list` on `pods` in the worker namespace

## Deploy Order

### First time only — bootstrap (run once)

```
1. cd bootstrap-terraform && terraform init && terraform apply
   # Creates: GH Actions IAM role, ECR repos, tfstate bucket settings
   # State: s3://tfstate-pala3105/thumbnail/bootstrap.tfstate
```

Or trigger the `bootstrap.yml` workflow from GitHub Actions.

### Every deploy — automated (recommended)

```
2. deploy-all.yml → phase: 1
   # Runs in parallel: terraform-apply, build all 3 images, route53 step 1
   # Then: deploy-k8s (waits for terraform + images)
   # Outputs NS records — paste into Namecheap Custom DNS, wait for propagation

3. deploy-all.yml → phase: 2
   # Runs: route53 step 2 (ACM validation + A record), ingress HTTPS annotation, monitoring
```

### Every deploy — manual (step by step)

```
2. terraform-apply.yml          # VPC, EKS, IAM, SQS, S3, S3→SQS notification
3. build-push-a.yml             # build & push images to ECR (set image_tag e.g. 1.0.5)
4. deploy-k8s.yml               # install KEDA + ALB controller + apply K8s manifests
```

### HTTPS / custom domain (run after step 4, ALB must exist)

```
5. terraform-global.yml → action: apply, step: 1
   # Creates Route53 hosted zone, ACM cert, DNS validation records
   # Outputs the 4 NS records — paste them into Namecheap Custom DNS

6. Wait for NS propagation (usually a few minutes)

7. terraform-global.yml → action: apply, step: 2
   # Waits for ACM cert validation, creates A record alias to ALB
   # Annotates ingress with cert ARN → ALB enables HTTPS + HTTP→HTTPS redirect
```

### Tear down

```
8. terraform-destroy.yml
   # Deletes K8s resources, lets ALB controller clean up ALB + security groups via finalizer
   # Falls back to force-delete + orphaned SG cleanup if controller fails
   # Then terraform destroy (monitoring → route53 → infra)
   # ECR repos are NOT destroyed (managed by bootstrap)
```

## CI/CD Workflows

| Workflow | Trigger | Description |
|---|---|---|
| `bootstrap.yml` | manual | One-time: GH Actions role, ECR repos |
| `deploy-all.yml` | manual | **Full deploy in two phases** — phase 1: terraform + images + k8s in parallel; phase 2: HTTPS + monitoring |
| `terraform-apply.yml` | manual | Provision VPC, EKS, IAM, SQS, S3 |
| `build-push-a.yml` | manual | Build & push Docker images to ECR |
| `deploy-k8s.yml` | manual | Deploy KEDA, ALB controller, K8s manifests |
| `terraform-global.yml` | manual | Route53 hosted zone + ACM cert + HTTPS ingress (step 1 → 2) |
| `terraform-monitoring.yml` | manual | Deploy CloudWatch alarms + SNS alerts |
| `terraform-destroy.yml` | manual | Tear down all infrastructure |

### GitHub Secrets required

| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | OIDC role ARN for GitHub Actions |
| `ECR_BASE_FRONTEND` | ECR repo URI for frontend |
| `ECR_BASE_WORKER` | ECR repo URI for worker |
| `ECR_BASE_API` | ECR repo URI for api |
| `S3_BUCKET_NAME` | S3 bucket name for videos/thumbnails |
| `DOMAIN_NAME` | Root domain (e.g. `yourdomain.com`) — used by `terraform-global.yml` |
| `ALERT_EMAIL` | Email address for CloudWatch alarm notifications |

## Kubernetes

- **Compute:** hybrid — EC2 managed node group (t3.medium, 1–3 nodes) for frontend, API, and control-plane workloads; Fargate for the worker only (`app=thumbnail-worker` label selector)
- **Ingress:** AWS Load Balancer Controller (ALB), `target-type: ip`
- **Worker autoscaling:** KEDA `ScaledObject` — scales 0→10 based on SQS queue depth (1 pod per 3 messages, polling every 15s, cooldown 90s)
- **Frontend/API autoscaling:** HPA — scales on CPU (70% threshold, min 1, max 3, stabilization window 90s)
- **Auth:** IRSA (IAM Roles for Service Accounts) — no static credentials in env vars
- **KEDA service account:** pre-created with Helm ownership annotations (`meta.helm.sh/release-name`, `meta.helm.sh/release-namespace`, `app.kubernetes.io/managed-by=Helm`) before KEDA install to avoid Helm ownership conflict
- **NAT Gateway:** single NAT gateway for outbound internet access (ECR, SQS, S3 via gateway endpoint)

## Observability

### Container Insights
Enabled via the `amazon-cloudwatch-observability` EKS add-on. On EC2 nodes, the agent runs as a DaemonSet. On Fargate (worker), it is injected as a sidecar automatically. Metrics available in CloudWatch under the `ContainerInsights` namespace:
- Pod CPU and memory usage
- Pod network I/O
- Container restarts
- Node and Fargate vCPU and memory

### CloudWatch Alarms (`terraform-monitoring/`)
All alarms notify via SNS email (configured via `ALERT_EMAIL` secret).

| Alarm | Metric | Threshold | Description |
|---|---|---|---|
| `thumbnail-dlq-not-empty` | `ApproximateNumberOfMessagesVisible` | > 0 | Any message in DLQ — worker is failing |
| `thumbnail-dlq-message-age` | `ApproximateAgeOfOldestMessage` | > 300s | Message stuck in DLQ for over 5 minutes |
| `thumbnail-elb-5xx-errors` | `HTTPCode_ELB_5XX_Count` | > 0 | ALB-level 5xx errors |
| `thumbnail-target-5xx-errors` | `HTTPCode_Target_5XX_Count` | > 0 | Pod-level 5xx errors |
| `thumbnail-target-response-time` | `TargetResponseTime` | > 2s avg | Slow response time (2 consecutive minutes) |
| `thumbnail-active-connection-count` | `ActiveConnectionCount` | > 500 | Unexpected traffic spike |

### Deploy Order
Apply monitoring after the ALB exists (after `deploy-k8s.yml`):
```
terraform-monitoring.yml → action: apply
```
