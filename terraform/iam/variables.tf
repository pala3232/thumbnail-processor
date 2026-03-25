variable "oidc_provider_arn" {
  description = "ARN of the OIDC provider for the EKS cluster"
  type        = string
}

variable "bucket_name" {
  description = "Name of the S3 bucket for thumbnail storage"
  type        = string
}

variable "account_id" {}
