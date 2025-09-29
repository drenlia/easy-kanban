#!/bin/bash

# Easy Kanban Kubernetes Deployment Script

set -e

echo "🚀 Deploying Easy Kanban to Kubernetes..."

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

# Apply the namespace first
echo "📦 Creating namespace..."
kubectl apply -f k8s/namespace.yaml

# Apply Redis deployment
echo "🗄️  Deploying Redis..."
kubectl apply -f k8s/redis-deployment.yaml

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n easy-kanban

# Apply ConfigMap
echo "⚙️  Creating ConfigMap..."
kubectl apply -f k8s/configmap.yaml

# Apply the main application
echo "🎯 Deploying Easy Kanban application..."
kubectl apply -f k8s/app-deployment.yaml

# Wait for the app to be ready
echo "⏳ Waiting for Easy Kanban to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/easy-kanban -n easy-kanban

# Apply services
echo "🌐 Creating services..."
kubectl apply -f k8s/service.yaml

# Apply ingress
echo "🔗 Creating ingress..."
kubectl apply -f k8s/ingress.yaml

echo "✅ Deployment completed successfully!"

# Show status
echo ""
echo "📊 Deployment Status:"
kubectl get pods -n easy-kanban
echo ""
echo "🌐 Services:"
kubectl get services -n easy-kanban
echo ""
echo "🔗 Ingress:"
kubectl get ingress -n easy-kanban

echo ""
echo "🎉 Easy Kanban is now running in Kubernetes!"
echo ""
echo "To access the application:"
echo "1. Add 'easy-kanban.local' to your /etc/hosts file:"
echo "   echo '127.0.0.1 easy-kanban.local' | sudo tee -a /etc/hosts"
echo ""
echo "2. Get the NodePort:"
echo "   kubectl get service easy-kanban-nodeport -n easy-kanban"
echo ""
echo "3. Access via:"
echo "   - Ingress: http://easy-kanban.local (if ingress controller is running)"
echo "   - NodePort: http://localhost:<NODEPORT>"
echo ""
echo "To view logs:"
echo "   kubectl logs -f deployment/easy-kanban -n easy-kanban"
echo ""
echo "To delete the deployment:"
echo "   kubectl delete namespace easy-kanban"
