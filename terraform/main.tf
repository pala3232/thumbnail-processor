# Main Terraform configuration for the thumbnail pipeline infrastructure.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.95"
    }
  }

  backend "s3" {
    bucket = "tfstate-pala3105"
    key    = "thumbnail/terraform.tfstate"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = "ap-southeast-2"
}


data "aws_caller_identity" "current" {}

module "networking" {
  source = "./networking"
}

module "eks" {
  source          = "./eks"
  vpc_id          = module.networking.vpc_id
  private_subnets = module.networking.private_subnets
}

module "iam" {
  source            = "./iam"
  oidc_provider_arn = module.eks.oidc_provider_arn
  bucket_name       = var.s3_bucket_name
  account_id        = data.aws_caller_identity.current.account_id
}

module "s3" {
  source      = "./s3"
  bucket_name = var.s3_bucket_name
}

module "sqs" {
  source = "./sqs"
}

# S3 -> SQS event notification

resource "aws_s3_bucket_notification" "upload_notification" {
  bucket     = module.s3.s3_bucket_id
  depends_on = [aws_sqs_queue_policy.allow_s3]

  queue {
    id            = "notify-mp4"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".mp4"
  }
  queue {
    id            = "notify-mov"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".mov"
  }
  queue {
    id            = "notify-mkv"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".mkv"
  }
  queue {
    id            = "notify-avi"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".avi"
  }
  queue {
    id            = "notify-webm"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".webm"
  }
  queue {
    id            = "notify-wmv"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".wmv"
  }
  queue {
    id            = "notify-flv"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".flv"
  }
  queue {
    id            = "notify-m4v"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".m4v"
  }
  queue {
    id            = "notify-ts"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".ts"
  }
  queue {
    id            = "notify-3gp"
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
    filter_suffix = ".3gp"
  }
}

resource "aws_sqs_queue_policy" "allow_s3" {
  queue_url = module.sqs.queue_url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowS3SendMessage"
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = module.sqs.queue_arn
      Condition = {
        ArnLike = {
          "aws:SourceArn" = module.s3.s3_bucket_arn
        }
      }
    }]
  })
}
