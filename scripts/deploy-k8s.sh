#!/bin/bash
# Deploys all K8s manifests for the thumbnail pipeline.
# Prerequisites: terraform applied, KEDA installed (deploy-keda.sh), ALB controller installed (deploy-aws-lb.sh), images in ECR.
set -e

CLUSTER_NAME=$(cd ../terraform && terraform output -raw cluster_name)
REGION="ap-southeast-2"

echo "Updating kubeconfig for cluster: $CLUSTER_NAME"
aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"

echo "Waiting for ALB controller to be ready..."
kubectl rollout status deployment/aws-load-balancer-controller -n kube-system --timeout=120s

echo "--- [1/7] Namespace ---"
kubectl apply -f ../k8s/ns.yaml

echo "--- [2/7] Service accounts + RBAC ---"
kubectl apply -f ../k8s/sa-worker.yaml
kubectl apply -f ../k8s/sa-api.yaml
kubectl apply -f ../k8s/frontend-sa.yaml
kubectl apply -f ../k8s/clusterrole.yaml

echo "--- [3/7] ConfigMaps ---"
kubectl apply -f ../k8s/worker/configmap.yaml
kubectl apply -f ../k8s/api/configmap.yaml

echo "--- [4/7] Deployments + Services ---"
kubectl apply -f ../k8s/worker/deployment.yaml
kubectl apply -f ../k8s/api/deployment.yaml
kubectl apply -f ../k8s/frontend/deployment.yaml

echo "--- [5/7] HPAs ---"
kubectl apply -f ../k8s/api/hpa.yaml
kubectl apply -f ../k8s/frontend/hpa.yaml

echo "--- [6/7] KEDA ScaledObject ---"
kubectl apply -f ../k8s/worker/scaledobject.yaml

echo "--- [7/7] Ingress ---"
kubectl apply -f ../k8s/ingress.yaml

echo ""
echo "Waiting for api and frontend deployments to be ready..."
kubectl rollout status deployment/api-deployment -n thumbnail --timeout=120s
kubectl rollout status deployment/thumbnail-frontend -n thumbnail --timeout=120s

echo ""
echo "All manifests applied. ALB provisioning may take 1-2 minutes."
echo "Get ingress address: kubectl get ingress thumbnail-ingress -n thumbnail"
