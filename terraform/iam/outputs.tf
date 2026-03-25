output "worker_role_arn" {
  value = module.worker_iam_role.iam_role_arn
}

output "api_role_arn" {
  value = module.api_iam_role.iam_role_arn
}

output "alb_controller_role_arn" {
  value = module.alb_controller_iam_role.iam_role_arn
}
