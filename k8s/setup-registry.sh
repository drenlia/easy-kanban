#!/bin/bash

# Setup Internal Container Registry for Kubernetes
# This creates a local Docker registry that runs in the cluster

set -e

echo "🚀 Setting up Internal Container Registry..."
echo ""

# Configuration
REGISTRY_NAMESPACE="kube-system"
REGISTRY_NAME="internal-registry"
REGISTRY_PORT="5000"
REGISTRY_IMAGE="registry:2"

# Check if registry already exists
if kubectl get deployment ${REGISTRY_NAME} -n ${REGISTRY_NAMESPACE} >/dev/null 2>&1; then
    echo "⚠️  Registry already exists. Skipping creation."
    echo "   To recreate, delete it first: kubectl delete deployment ${REGISTRY_NAME} -n ${REGISTRY_NAMESPACE}"
    exit 0
fi

echo "📋 Creating registry deployment..."
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${REGISTRY_NAME}
  namespace: ${REGISTRY_NAMESPACE}
  labels:
    app: ${REGISTRY_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${REGISTRY_NAME}
  template:
    metadata:
      labels:
        app: ${REGISTRY_NAME}
    spec:
      containers:
      - name: registry
        image: ${REGISTRY_IMAGE}
        ports:
        - containerPort: ${REGISTRY_PORT}
        volumeMounts:
        - name: registry-storage
          mountPath: /var/lib/registry
        env:
        - name: REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY
          value: /var/lib/registry
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: registry-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ${REGISTRY_NAME}
  namespace: ${REGISTRY_NAMESPACE}
  labels:
    app: ${REGISTRY_NAME}
spec:
  type: ClusterIP
  ports:
  - port: ${REGISTRY_PORT}
    targetPort: ${REGISTRY_PORT}
    protocol: TCP
  selector:
    app: ${REGISTRY_NAME}
EOF

echo "✅ Registry deployment created"
echo ""

echo "⏳ Waiting for registry to be ready..."
kubectl wait --for=condition=available --timeout=120s deployment/${REGISTRY_NAME} -n ${REGISTRY_NAMESPACE} || {
    echo "❌ Registry deployment failed or timed out"
    exit 1
}

# Get registry service IP
REGISTRY_IP=$(kubectl get svc ${REGISTRY_NAME} -n ${REGISTRY_NAMESPACE} -o jsonpath='{.spec.clusterIP}')
REGISTRY_HOST="${REGISTRY_NAME}.${REGISTRY_NAMESPACE}.svc.cluster.local:${REGISTRY_PORT}"

echo "✅ Registry is ready!"
echo ""
echo "📋 Registry Information:"
echo "   Service: ${REGISTRY_HOST}"
echo "   ClusterIP: ${REGISTRY_IP}:${REGISTRY_PORT}"
echo ""

# Configure nodes to trust the registry (for insecure registry)
echo "📋 Configuring nodes to trust internal registry..."
echo "   Note: This requires containerd configuration on each node"
echo ""

# Create a script to configure containerd on each node
cat <<'CONFIG_EOF' > /tmp/configure-registry.sh
#!/bin/bash
# Configure containerd to trust internal registry

REGISTRY_HOST="internal-registry.kube-system.svc.cluster.local:5000"
CONFIG_FILE="/etc/containerd/config.toml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ containerd config not found at $CONFIG_FILE"
    exit 1
fi

# Backup config
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%s)"

# Check if registry config already exists
if grep -q "registry.kube-system.svc.cluster.local" "$CONFIG_FILE"; then
    echo "⚠️  Registry configuration already exists"
    exit 0
fi

# Add registry configuration
cat >> "$CONFIG_FILE" <<EOF

[plugins."io.containerd.grpc.v1.cri".registry.mirrors."${REGISTRY_HOST}"]
  endpoint = ["http://${REGISTRY_HOST}"]

[plugins."io.containerd.grpc.v1.cri".registry.configs."${REGISTRY_HOST}".tls]
  insecure_skip_verify = true
EOF

# Restart containerd
systemctl restart containerd
echo "✅ Registry configured in containerd"
CONFIG_EOF

chmod +x /tmp/configure-registry.sh

echo "📝 To configure registry on each node, run:"
echo "   sudo bash /tmp/configure-registry.sh"
echo ""
echo "   Or manually add to /etc/containerd/config.toml:"
echo ""
echo "   [plugins.\"io.containerd.grpc.v1.cri\".registry.mirrors.\"${REGISTRY_HOST}\"]"
echo "     endpoint = [\"http://${REGISTRY_HOST}\"]"
echo ""
echo "   [plugins.\"io.containerd.grpc.v1.cri\".registry.configs.\"${REGISTRY_HOST}\".tls]"
echo "     insecure_skip_verify = true"
echo ""
echo "   Then restart containerd: sudo systemctl restart containerd"
echo ""

echo "🎉 Internal registry setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure containerd on all nodes (see above)"
echo "   2. Build and push image: ./k8s/build-and-push-to-registry.sh"
echo "   3. Update deployment to use: ${REGISTRY_HOST}/easy-kanban:latest"
echo ""

