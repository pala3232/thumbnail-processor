# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "main-pipeline-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-southeast-2a", "ap-southeast-2b", "ap-southeast-2c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  public_subnet_names  = ["public-thumbnail-a", "public-thumbnail-b", "public-thumbnail-c"]
  private_subnet_names = ["private-thumbnail-a", "private-thumbnail-b", "private-thumbnail-c"]

  public_subnet_tags  = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }

  enable_nat_gateway   = true
  single_nat_gateway   = true

  default_security_group_name = "main-pipeline-default-sg"
  default_security_group_ingress = [
    {
      from_port   = 0
      to_port     = 65535
      protocol    = "tcp"
      cidr_blocks = "10.0.0.0/16"
    }
  ]
  default_security_group_egress = [
    {
      from_port   = 0
      to_port     = 65535
      protocol    = "tcp"
      cidr_blocks = "0.0.0.0/0"
    },
    {
      from_port   = 0
      to_port     = 65535
      protocol    = "udp"
      cidr_blocks = "0.0.0.0/0"
    }
  ]

  tags = {
    Terraform   = "true"
    Environment = "dev"
  }
}

# S3 gateway endpoint — free, keeps S3/ECR layer traffic off the NAT
module "endpoints" {
  source  = "terraform-aws-modules/vpc/aws//modules/vpc-endpoints"
  version = "~> 5.0"

  vpc_id = module.vpc.vpc_id

  endpoints = {
    s3 = {
      service_type    = "Gateway"
      service         = "s3"
      route_table_ids = module.vpc.private_route_table_ids
      tags            = { Name = "s3-vpc-endpoint" }
    }
  }

  tags = {
    Terraform   = "true"
    Environment = "dev"
  }
}
