#!/bin/bash
set -e
echo "adding KEDA repo, downloading KEDA..."

helm repo add kedacore https://kedacore.github.io/charts 2>/dev/null || true
echo "repo added. updating it now..."

helm repo update kedacore
echo "done updating KEDA repo! installing KEDA now..."

helm upgrade --install keda kedacore/keda --namespace kube-system --version 2.19.0
echo "done installing KEDA!"
