terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.95"
    }
  }

  backend "s3" {
    bucket = "tfstate-pala3105"
    key    = "thumbnail/monitoring.tfstate"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = "ap-southeast-2"
}

data "aws_lb" "thumbnail" {
  tags = {
    "elbv2.k8s.aws/cluster" = "thumbnail-eks"
    "ingress.k8s.aws/stack" = "thumbnail/thumbnail-ingress"
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "thumbnail-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Messages in DLQ - worker is failing"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    QueueName = "thumbnail-pipeline-queue-dlq"
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_message_age" {
  alarm_name          = "thumbnail-dlq-message-age"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  alarm_description   = "Messages stuck in DLQ for over 5 minutes"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    QueueName = "thumbnail-pipeline-queue-dlq"
  }
}

resource "aws_cloudwatch_metric_alarm" "elb_5xx_errors" {
  alarm_name          = "thumbnail-elb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "ELB 5XX errors - frontend is failing"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = data.aws_lb.thumbnail.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "target_5xx_errors" {
  alarm_name          = "thumbnail-target-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Elevated 5xx errors on pods"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = data.aws_lb.thumbnail.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  alarm_name          = "thumbnail-target-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 2
  alarm_description   = "Average target response time exceeded 2 seconds"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = data.aws_lb.thumbnail.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "active_connection_count" {
  alarm_name          = "thumbnail-active-connection-count"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ActiveConnectionCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 500
  alarm_description   = "Active connection count exceeded 500"
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = data.aws_lb.thumbnail.arn_suffix
  }
}

resource "aws_sns_topic" "alerts" {
  name = "thumbnail-pipeline-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.endpoint
}