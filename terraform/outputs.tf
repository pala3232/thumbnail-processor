output "cluster_name"           { value = module.eks.cluster_name }
output "alb_controller_role_arn" { value = module.iam.alb_controller_role_arn }
output "worker_role_arn"         { value = module.iam.worker_role_arn }
output "api_role_arn"            { value = module.iam.api_role_arn }
output "vpc_id"                  { value = module.networking.vpc_id }
output "keda_role_arn"           { value = module.iam.keda_role_arn }
