output "github_actions_role_arn" {
  description = "Set this as AWS_ROLE_ARN in GitHub Actions secrets"
  value       = aws_iam_role.github_actions.arn
}

output "tfstate_bucket" {
  description = "S3 bucket for Terraform remote state"
  value       = data.aws_s3_bucket.tfstate.bucket
}
