#!/bin/bash
# Run once locally before anything else.
# Creates the tfstate S3 bucket, GitHub OIDC provider, and GH Actions IAM role.
# Requires AWS credentials with sufficient permissions (AdministratorAccess recommended).
set -e

cd ../terraform/bootstrap

echo "Initialising bootstrap..."
terraform init

echo "Applying bootstrap..."
terraform apply -auto-approve

echo ""
echo "Done. Add these to GitHub Actions secrets:"
echo ""
terraform output -raw github_actions_role_arn | xargs -I{} echo "  AWS_ROLE_ARN = {}"
echo "  S3_BUCKET_NAME = thumbnail-pipeline-pala3105"
