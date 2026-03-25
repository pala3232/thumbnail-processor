variable "domain_name" {
  description = "Root domain name (e.g. ipalacio.com)"
  type        = string
}

variable "subdomain" {
  description = "Subdomain prefix (e.g. thumbnail → thumbnail.ipalacio.com)"
  type        = string
  default     = "thumbnail"
}

variable "cluster_name" {
  description = "EKS cluster name for ALB lookup"
  type        = string
  default     = "thumbnail-eks"
}
