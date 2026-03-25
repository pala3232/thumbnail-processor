#!/bin/bash
set -e

ALB_ROLE_ARN=$(cd ../terraform && terraform output -raw alb_controller_role_arn)
CLUSTER_NAME=$(cd ../terraform && terraform output -raw cluster_name)
echo "removing existing ALB helm release and CRDs for clean install..."
helm uninstall aws-load-balancer-controller -n kube-system --no-hooks 2>/dev/null || true
kubectl delete crd ingressclassparams.elbv2.k8s.aws --ignore-not-found
kubectl delete crd targetgroupbindings.elbv2.k8s.aws --ignore-not-found

echo "adding eks helm repo..."
helm repo add eks https://aws.github.io/eks-charts
helm repo update eks
echo "done updating EKS! installing AWS Load Balancer Controller now..."

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=$ALB_ROLE_ARN" \
  --set crds.keep=true \
  --version 1.14.0

echo "done installing AWS Load Balancer Controller!"
