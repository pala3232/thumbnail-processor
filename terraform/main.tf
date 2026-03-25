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

module "ecr" {
  source = "./ecr"
}