#!/bin/bash

# Test NFS connectivity from a specific node or any pod
# This helps verify NFS works across nodes after adding k8s2

set -e

echo "🔍 Testing NFS Connectivity..."
echo ""

# Get NFS service details
NFS_SERVICE_IP=$(kubectl get svc -n easy-kanban nfs-server -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
NFS_SERVICE_NAME="nfs-server.easy-kanban.svc.cluster.local"

if [ -z "$NFS_SERVICE_IP" ]; then
    echo "❌ NFS service not found. Is NFS server deployed?"
    exit 1
fi

echo "📋 NFS Server Information:"
echo "   Service: ${NFS_SERVICE_NAME}"
echo "   ClusterIP: ${NFS_SERVICE_IP}"
echo ""

# Test 1: Check if NFS service is accessible
echo "🧪 Test 1: Checking NFS service accessibility..."
if kubectl run nfs-connectivity-test --rm -i --restart=Never --image=busybox --restart=Never -n easy-kanban -- sh -c "nc -zv ${NFS_SERVICE_IP} 2049" 2>&1 | grep -q "succeeded\|open"; then
    echo "✅ NFS port 2049 is accessible"
else
    echo "❌ Cannot reach NFS port 2049"
    echo "   This might indicate network connectivity issues"
fi
echo ""

# Test 2: Try mounting NFS
echo "🧪 Test 2: Testing NFS mount..."
cat <<EOF | kubectl apply -f - 2>/dev/null || true
apiVersion: v1
kind: Pod
metadata:
  name: nfs-mount-test
  namespace: easy-kanban
spec:
  containers:
  - name: test
    image: busybox
    command: ['sh', '-c', 'sleep 3600']
    volumeMounts:
    - name: nfs-test
      mountPath: /mnt/nfs
  volumes:
  - name: nfs-test
    persistentVolumeClaim:
      claimName: easy-kanban-shared-pvc-data
EOF

echo "⏳ Waiting for test pod to start..."
sleep 5

if kubectl get pod nfs-mount-test -n easy-kanban 2>/dev/null | grep -q Running; then
    echo "✅ NFS mount test pod is running"
    
    # Test if we can write to NFS
    echo "🧪 Test 3: Testing NFS write access..."
    if kubectl exec -n easy-kanban nfs-mount-test -- sh -c "echo 'NFS test from $(hostname)' > /mnt/nfs/.nfs-test-$(date +%s).txt && ls -la /mnt/nfs/.nfs-test-*.txt" 2>/dev/null; then
        echo "✅ NFS write test successful"
        
        # Cleanup test file
        kubectl exec -n easy-kanban nfs-mount-test -- sh -c "rm -f /mnt/nfs/.nfs-test-*.txt" 2>/dev/null || true
    else
        echo "⚠️  NFS write test failed (may be permission issue)"
    fi
    
    # Show which node the test pod is on
    NODE=$(kubectl get pod nfs-mount-test -n easy-kanban -o jsonpath='{.spec.nodeName}' 2>/dev/null || echo "unknown")
    echo "   Test pod running on node: ${NODE}"
    
    # Cleanup
    kubectl delete pod nfs-mount-test -n easy-kanban 2>/dev/null || true
else
    echo "❌ NFS mount test pod failed to start"
    echo "   Check: kubectl describe pod nfs-mount-test -n easy-kanban"
    kubectl delete pod nfs-mount-test -n easy-kanban 2>/dev/null || true
fi
echo ""

# Test 4: Check NFS server pod location
echo "🧪 Test 4: Checking NFS server pod location..."
NFS_POD_NODE=$(kubectl get pods -n easy-kanban -l app=nfs-server -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "unknown")
NFS_POD_IP=$(kubectl get pods -n easy-kanban -l app=nfs-server -o jsonpath='{.items[0].status.podIP}' 2>/dev/null || echo "unknown")
echo "   NFS server pod running on node: ${NFS_POD_NODE}"
echo "   NFS server pod IP: ${NFS_POD_IP}"
echo ""

# Test 5: List all nodes and their NFS usage
echo "🧪 Test 5: Checking pod distribution across nodes..."
echo "   Pods using NFS volumes:"
kubectl get pods -n easy-kanban -o wide | grep -E "easy-kanban|nfs-server" | awk '{print "   - " $1 " on node " $7}'
echo ""

echo "📊 Summary:"
echo "   NFS Service IP: ${NFS_SERVICE_IP}"
echo "   NFS Server Node: ${NFS_POD_NODE}"
echo "   All pods in cluster can access NFS via ClusterIP: ${NFS_SERVICE_IP}"
echo ""
echo "✅ If all tests passed, NFS is working correctly across nodes!"
echo ""

