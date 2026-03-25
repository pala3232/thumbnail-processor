#!/bin/bash
set -e

ALB_ROLE_ARN=$(cd ../terraform && terraform output -raw alb_controller_role_arn)
CLUSTER_NAME=$(cd ../terraform && terraform output -raw cluster_name)
echo "downloading/applying CRDs for AWS Load Balancer Controller..."

wget https://raw.githubusercontent.com/aws/eks-charts/master/stable/aws-load-balancer-controller/crds/crds.yaml
kubectl apply -f crds.yaml
echo "adding eks..."

helm repo add eks https://aws.github.io/eks-charts
echo "done adding EKS! updating EKS now..."

helm repo update eks
echo "done updating EKS! installing AWS Load Balancer Controller now..."

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$ALB_ROLE_ARN" \
  --version 1.14.0

echo "done installing AWS Load Balancer Controller!"
