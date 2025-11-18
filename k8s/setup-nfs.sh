#!/bin/bash

# Setup NFS Server for Easy Kanban Multi-Tenant Deployment
# This script sets up NFS server in Kubernetes for shared storage

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Setting up NFS Server for Easy Kanban..."
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    exit 1
fi

echo "✅ Kubernetes cluster is accessible"
echo ""

# Create namespace if it doesn't exist
echo "📦 Checking namespace..."
if ! kubectl get namespace easy-kanban &> /dev/null; then
    echo "   Creating namespace: easy-kanban"
    kubectl create namespace easy-kanban
else
    echo "   Namespace 'easy-kanban' already exists"
fi
echo ""

# Deploy NFS Server
echo "🔧 Deploying NFS Server..."
kubectl apply -f "${SCRIPT_DIR}/nfs-server-deployment.yaml"

# Wait for NFS server to be ready
echo "⏳ Waiting for NFS server to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/nfs-server -n easy-kanban || {
    echo "❌ NFS server deployment failed or timed out"
    echo "   Check logs: kubectl logs -n easy-kanban -l app=nfs-server"
    exit 1
}

echo "✅ NFS server is ready"
echo ""

# Get NFS server service IP
NFS_SERVER_IP=$(kubectl get service nfs-server -n easy-kanban -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
if [ -z "$NFS_SERVER_IP" ]; then
    echo "⚠️  Warning: Could not get NFS server IP. Using service name instead."
    NFS_SERVER_IP="nfs-server.easy-kanban.svc.cluster.local"
fi

echo "📋 NFS Server Information:"
echo "   Service: nfs-server.easy-kanban.svc.cluster.local"
echo "   Cluster IP: ${NFS_SERVER_IP}"
echo ""

# Create storage class
echo "📦 Creating NFS Storage Class..."
kubectl apply -f "${SCRIPT_DIR}/nfs-storage-class.yaml"
echo "✅ Storage class created"
echo ""

# Create Persistent Volume
echo "💾 Creating Persistent Volume..."
# Update PV with actual NFS server IP if needed
sed "s|nfs-server.easy-kanban.svc.cluster.local|${NFS_SERVER_IP}|g" \
    "${SCRIPT_DIR}/nfs-persistent-volume.yaml" | kubectl apply -f -
echo "✅ Persistent volume created"
echo ""

# Create Persistent Volume Claim
echo "🔗 Creating Persistent Volume Claim..."
kubectl apply -f "${SCRIPT_DIR}/nfs-persistent-volume-claim.yaml"
echo "✅ Persistent volume claim created"
echo ""

# Verify PVC is bound
echo "⏳ Waiting for PVC to be bound..."
sleep 5
PVC_STATUS=$(kubectl get pvc easy-kanban-shared-pvc -n easy-kanban -o jsonpath='{.status.phase}' 2>/dev/null || echo "Pending")
if [ "$PVC_STATUS" != "Bound" ]; then
    echo "⚠️  Warning: PVC status is '${PVC_STATUS}' (expected 'Bound')"
    echo "   Check: kubectl describe pvc easy-kanban-shared-pvc -n easy-kanban"
else
    echo "✅ PVC is bound"
fi
echo ""

# Create exports directory structure
echo "📁 Setting up NFS exports directory structure..."
NFS_POD=$(kubectl get pod -n easy-kanban -l app=nfs-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$NFS_POD" ]; then
    kubectl exec -n easy-kanban "$NFS_POD" -- mkdir -p /exports/easy-kanban
    kubectl exec -n easy-kanban "$NFS_POD" -- chmod 777 /exports/easy-kanban
    echo "✅ Directory structure created"
else
    echo "⚠️  Warning: Could not find NFS pod to create directory structure"
fi
echo ""

echo "✅ NFS setup complete!"
echo ""
echo "📋 Summary:"
echo "   NFS Server: nfs-server.easy-kanban.svc.cluster.local"
echo "   Storage Class: easy-kanban-nfs"
echo "   Persistent Volume: easy-kanban-shared-storage"
echo "   Persistent Volume Claim: easy-kanban-shared-pvc"
echo ""
echo "💡 Next steps:"
echo "   1. Update your deployment to use 'easy-kanban-shared-pvc'"
echo "   2. Set MULTI_TENANT=true in your ConfigMap"
echo "   3. Set TENANT_DOMAIN in your ConfigMap (e.g., ezkan.cloud)"
echo ""

