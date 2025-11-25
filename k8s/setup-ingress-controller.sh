#!/bin/bash
# Setup script for ingress-nginx controller
# This ensures the ingress controller has the correct global settings for file uploads

set -e

echo "🔧 Configuring ingress-nginx controller for file uploads..."

# Check if ingress-nginx namespace exists
if ! kubectl get namespace ingress-nginx &>/dev/null; then
    echo "❌ Error: ingress-nginx namespace not found. Please install ingress-nginx first."
    echo "   Install with: kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml"
    exit 1
fi

# Check if ConfigMap exists
if ! kubectl get configmap ingress-nginx-controller -n ingress-nginx &>/dev/null; then
    echo "❌ Error: ingress-nginx-controller ConfigMap not found. Please ensure ingress-nginx is installed."
    exit 1
fi

# Patch the ConfigMap to set client-max-body-size and proxy-body-size
echo "📝 Setting client-max-body-size and proxy-body-size to 100m..."
kubectl patch configmap ingress-nginx-controller -n ingress-nginx --type merge -p '{"data":{"client-max-body-size":"100m","proxy-body-size":"100m"}}'

# Restart the ingress controller pod to apply changes
echo "🔄 Restarting ingress controller pod to apply changes..."
POD_NAME=$(kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$POD_NAME" ]; then
    kubectl delete pod "$POD_NAME" -n ingress-nginx
    echo "⏳ Waiting for pod to restart..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=controller -n ingress-nginx --timeout=60s
    echo "✅ Ingress controller pod restarted"
else
    echo "⚠️  Warning: Could not find ingress controller pod to restart"
fi

# Verify the configuration
echo ""
echo "✅ Verifying configuration..."
kubectl get configmap ingress-nginx-controller -n ingress-nginx -o jsonpath='{.data.client-max-body-size}' | grep -q "100m" && echo "   ✓ client-max-body-size: 100m" || echo "   ✗ client-max-body-size: NOT SET"
kubectl get configmap ingress-nginx-controller -n ingress-nginx -o jsonpath='{.data.proxy-body-size}' | grep -q "100m" && echo "   ✓ proxy-body-size: 100m" || echo "   ✗ proxy-body-size: NOT SET"

echo ""
echo "✅ Ingress controller configuration complete!"
echo "   File uploads up to 100MB are now supported."

