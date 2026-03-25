terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.95"
    }
  }
  backend "s3" {
    bucket = "tfstate-pala3105"
    key    = "thumbnail/bootstrap.tfstate"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = "ap-southeast-2"
}

data "aws_caller_identity" "current" {}

# ── tfstate bucket (already exists — manage settings only) ────────────────────

data "aws_s3_bucket" "tfstate" {
  bucket = var.tfstate_bucket
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = data.aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = data.aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = data.aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── GitHub Actions OIDC provider (already exists — look it up) ────────────────

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# ── GitHub Actions IAM role ────────────────────────────────────────────────────

data "aws_iam_policy_document" "github_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "github-actions-thumbnail"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = { Terraform = "true" }
}

resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ── ECR Repositories ───────────────────────────────────────────────────────────

resource "aws_ecr_repository" "worker" {
  name                 = "thumbnail-worker"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration { scan_on_push = true }

  lifecycle { prevent_destroy = true }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "thumbnail-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration { scan_on_push = true }

  lifecycle { prevent_destroy = true }
}

resource "aws_ecr_repository" "api" {
  name                 = "thumbnail-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration { scan_on_push = true }

  lifecycle { prevent_destroy = true }
}
