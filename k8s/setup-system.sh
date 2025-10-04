#!/bin/bash

# Easy Kanban Multi-Tenant System Setup Script
# This script sets up all prerequisites for multi-tenant deployments

set -e

echo "🚀 Setting up Easy Kanban Multi-Tenant System..."
echo ""

# Function to display usage
usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --skip-image     Skip Docker image build and import"
    echo "  --skip-storage    Skip storage setup"
    echo "  --help           Show this help message"
    echo ""
    echo "This script will:"
    echo "  1. Create storage directories under /data/easy-kanban-pv/"
    echo "  2. Install local-path provisioner for dynamic storage"
    echo "  3. Create storage class for Easy Kanban"
    echo "  4. Build and import Docker image (unless --skip-image)"
    echo "  5. Verify all components are ready"
    exit 1
}

# Parse command line arguments
SKIP_IMAGE=false
SKIP_STORAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-image)
            SKIP_IMAGE=true
            shift
            ;;
        --skip-storage)
            SKIP_STORAGE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "❌ Unknown option: $1"
            usage
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Create storage directories
if [ "$SKIP_STORAGE" = false ]; then
    echo "📁 Creating storage directories..."
    sudo mkdir -p /data/easy-kanban-pv
    sudo chmod 755 /data/easy-kanban-pv
    echo "✅ Storage directory created: /data/easy-kanban-pv"
    echo ""
fi

# 2. Install local-path provisioner
if [ "$SKIP_STORAGE" = false ]; then
    echo "🔧 Installing local-path provisioner..."
    
    # Update the provisioner config to use our custom path
    cat > "${SCRIPT_DIR}/local-path-provisioner-custom.yaml" << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: local-path-provisioner
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: local-path-provisioner
  template:
    metadata:
      labels:
        app: local-path-provisioner
    spec:
      serviceAccountName: local-path-provisioner-service-account
      containers:
      - name: local-path-provisioner
        image: rancher/local-path-provisioner:v0.0.24
        imagePullPolicy: IfNotPresent
        command:
        - local-path-provisioner
        - --config
        - /etc/provisioner/config.json
        env:
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        volumeMounts:
        - name: config-volume
          mountPath: /etc/provisioner/
        - name: storage-volume
          mountPath: /opt/local-path-provisioner
      volumes:
      - name: config-volume
        configMap:
          name: local-path-provisioner-config
      - name: storage-volume
        hostPath:
          path: /data/easy-kanban-pv
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: local-path-provisioner-service-account
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: local-path-provisioner-role
rules:
- apiGroups: [""]
  resources: ["nodes", "persistentvolumes"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["endpoints", "persistentvolumeclaims", "events"]
  verbs: ["*"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: local-path-provisioner-bind
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: local-path-provisioner-role
subjects:
- kind: ServiceAccount
  name: local-path-provisioner-service-account
  namespace: kube-system
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-path-provisioner-config
  namespace: kube-system
data:
  config.json: |-
    {
        "nodePathMap":[
        {
            "node": "DEFAULT_PATH_FOR_NON_EXISTING_NODES",
            "paths": ["/data/easy-kanban-pv"]
        }
        ]
    }
EOF

    kubectl apply -f "${SCRIPT_DIR}/local-path-provisioner-custom.yaml"
    echo "✅ Local-path provisioner installed"
    echo ""
fi

# 3. Create storage class
if [ "$SKIP_STORAGE" = false ]; then
    echo "💾 Creating storage class..."
    kubectl apply -f "${SCRIPT_DIR}/storage-class.yaml"
    echo "✅ Storage class created"
    echo ""
fi

# 4. Build and import Docker image
if [ "$SKIP_IMAGE" = false ]; then
    echo "🐳 Building Docker image..."
    cd "${SCRIPT_DIR}/.."
    docker build -f Dockerfile.prod -t easy-kanban:latest .
    echo "✅ Docker image built"
    
    echo "📦 Importing image to Kubernetes..."
    docker save easy-kanban:latest | sudo ctr -n k8s.io images import -
    echo "✅ Docker image imported to Kubernetes"
    echo ""
fi

# 5. Verify setup
echo "🔍 Verifying setup..."

# Check storage class
if kubectl get storageclass easy-kanban-storage >/dev/null 2>&1; then
    echo "✅ Storage class 'easy-kanban-storage' is ready"
else
    echo "❌ Storage class 'easy-kanban-storage' not found"
    exit 1
fi

# Check local-path provisioner
if kubectl get deployment local-path-provisioner -n kube-system >/dev/null 2>&1; then
    echo "✅ Local-path provisioner is running"
else
    echo "❌ Local-path provisioner not found"
    exit 1
fi

# Check Docker image
if sudo crictl images | grep easy-kanban:latest >/dev/null 2>&1; then
    echo "✅ Docker image 'easy-kanban:latest' is available"
else
    echo "❌ Docker image 'easy-kanban:latest' not found"
    exit 1
fi

echo ""
echo "🎉 Easy Kanban Multi-Tenant System is ready!"
echo ""
echo "📋 Next steps:"
echo "  1. Deploy your first instance:"
echo "     ./deploy-instance.sh my-company kanban-token-12345 basic"
echo ""
echo "  2. Storage will be automatically created under:"
echo "     /data/easy-kanban-pv/easy-kanban-my-company-{data|attachments|avatars}"
echo ""
echo "  3. Monitor deployments:"
echo "     kubectl get pods --all-namespaces | grep easy-kanban"
echo ""
