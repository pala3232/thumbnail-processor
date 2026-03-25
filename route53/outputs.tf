output "certificate_arn" {
  value = aws_acm_certificate_validation.cert.certificate_arn
}

output "name_servers" {
  description = "Paste these into Namecheap Custom DNS"
  value       = aws_route53_zone.main.name_servers
}

output "hosted_zone_id" {
  value = aws_route53_zone.main.zone_id
}
