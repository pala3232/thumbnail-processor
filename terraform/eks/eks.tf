module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "thumbnail-eks"
  cluster_version = "1.33"

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  enable_cluster_creator_admin_permissions = true

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnets

  tags = {
    Environment = "dev"
    Terraform   = "true"
  }
}

module "fargate_profile" {
  source  = "terraform-aws-modules/eks/aws//modules/fargate-profile"
  version = "~> 20.0"

  name         = "separate-fargate-profile"
  cluster_name = module.eks.cluster_name

  subnet_ids = var.private_subnets
  selectors = [{
    namespace = "kube-system"
  }]

  tags = {
    Environment = "dev"
    Terraform   = "true"
  }
}

module "fargate_profile_worker" {
  source  = "terraform-aws-modules/eks/aws//modules/fargate-profile"
  version = "~> 20.0"

  name         = "worker-fargate-profile"
  cluster_name = module.eks.cluster_name
  subnet_ids   = var.private_subnets

  selectors = [{
    namespace = "thumbnail"
  }]
}
