module "sqs" {
  source  = "terraform-aws-modules/sqs/aws"
  version = "~> 4.0"

  name                       = "thumbnail-pipeline-queue"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400
  create_dlq                 = true
  redrive_policy = {
    # default is 5 for this module
    maxReceiveCount = 5
  }

  tags = {
    Environment = "dev"
  }
}
