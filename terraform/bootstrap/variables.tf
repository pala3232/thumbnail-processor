variable "tfstate_bucket" {
  description = "Name of the S3 bucket for Terraform remote state"
  type        = string
  default     = "tfstate-pala3105"
}

variable "github_repo" {
  description = "GitHub repo in owner/repo format"
  type        = string
  default     = "pala3232/thumbnail-processor"
}
