#!/bin/bash
set -e

ALB_ROLE_ARN=$(cd ../terraform && terraform output -raw alb_controller_role_arn)
CLUSTER_NAME=$(cd ../terraform && terraform output -raw cluster_name)
VPC_ID=$(cd ../terraform && terraform output -raw vpc_id)
echo "adding eks helm repo..."
helm repo add eks https://aws.github.io/eks-charts 2>/dev/null || true
helm repo update eks
echo "done updating EKS! installing AWS Load Balancer Controller now..."

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set vpcId=$VPC_ID \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$ALB_ROLE_ARN" \
  --set crds.keep=true \
  --version 1.14.0

echo "done installing AWS Load Balancer Controller!"
