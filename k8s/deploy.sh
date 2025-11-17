#!/bin/bash

# Easy Kanban Multi-Tenant Kubernetes Deployment Script

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <instance_name> <instance_token> <plan>"
    echo ""
    echo "Parameters:"
    echo "  instance_name  - The instance hostname (e.g., my-instance-name)"
    echo "  instance_token - Token for admin portal database access"
    echo "  plan          - License plan: 'basic' or 'pro'"
    echo ""
    echo "Example:"
    echo "  $0 my-company kanban-token-12345 basic"
    echo "  $0 enterprise kanban-token-67890 pro"
    echo ""
    echo "This will deploy Easy Kanban accessible at: https://my-company.ezkan.cloud"
    exit 1
}

# Check parameters
if [ $# -ne 3 ]; then
    echo "❌ Error: Missing required parameters"
    usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="$1"
INSTANCE_TOKEN="$2"
PLAN="$3"
NAMESPACE="easy-kanban-${INSTANCE_NAME}"
DOMAIN="ezkan.cloud"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"

# Validate instance name (alphanumeric and hyphens only)
if [[ ! "$INSTANCE_NAME" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "❌ Error: Instance name must contain only lowercase letters, numbers, and hyphens"
    echo "   Must start and end with alphanumeric characters"
    exit 1
fi

# Validate plan
if [[ "$PLAN" != "basic" && "$PLAN" != "pro" ]]; then
    echo "❌ Error: Plan must be 'basic' or 'pro'"
    exit 1
fi

# Set license configuration based on plan
if [[ "$PLAN" == "basic" ]]; then
    USER_LIMIT="5"
    TASK_LIMIT="100"
    BOARD_LIMIT="10"
    STORAGE_LIMIT="1Gi"  # 1GB
    SUPPORT_TYPE="basic"
else
    USER_LIMIT="50"
    TASK_LIMIT="-1"  # unlimited
    BOARD_LIMIT="-1" # unlimited
    STORAGE_LIMIT="10Gi" # 10GB
    SUPPORT_TYPE="pro"
fi

# Generate random JWT secret
JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "🚀 Deploying Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo "🌐 Hostname: ${FULL_HOSTNAME}"
echo "🔑 Instance Token: ${INSTANCE_TOKEN}"
echo "📋 Plan: ${PLAN} (${SUPPORT_TYPE})"
echo "👥 User Limit: ${USER_LIMIT}"
echo "📝 Task Limit: ${TASK_LIMIT}"
echo "📊 Board Limit: ${BOARD_LIMIT}"
echo "💾 Storage Limit: ${STORAGE_LIMIT} bytes"

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

# Resource requirements per instance
# App: 200m CPU, 256Mi memory (requests)
# Redis: 100m CPU, 128Mi memory (requests)
# Total per instance: 300m CPU, 384Mi memory
REQUIRED_CPU="300m"
REQUIRED_MEMORY="384Mi"

# Function to check resource availability
check_resource_availability() {
    echo "🔍 Checking cluster resource availability..."
    
    # Get node capacity using kubectl describe (more reliable than jq parsing)
    local node_info=$(kubectl describe nodes 2>/dev/null | grep -A 5 "Allocated resources:" | tail -n +2)
    if [ -z "$node_info" ]; then
        echo "⚠️  Warning: Could not retrieve node resource information, skipping resource check"
        return 0
    fi
    
    # Extract CPU and memory from kubectl describe output
    local cpu_allocated=$(echo "$node_info" | grep "cpu" | awk '{print $2}' | sed 's/(//;s/)//' | head -1)
    local memory_allocated=$(echo "$node_info" | grep "memory" | awk '{print $2}' | sed 's/(//;s/)//' | head -1)
    
    # Get total node capacity
    local node_capacity=$(kubectl get nodes -o json 2>/dev/null)
    local total_cpu=$(echo "$node_capacity" | jq -r '[.items[].status.capacity.cpu] | map(tonumber) | add' 2>/dev/null || echo "0")
    local total_memory_ki=$(echo "$node_capacity" | jq -r '[.items[].status.capacity.memory] | map(gsub("[^0-9]"; "") | tonumber) | add' 2>/dev/null || echo "0")
    
    # Convert memory from KiB to Mi
    local total_memory_mi=$((total_memory_ki / 1024))
    
    # Parse allocated resources (handle percentage format)
    local cpu_allocated_num=0
    local memory_allocated_num=0
    
    if echo "$cpu_allocated" | grep -q "%"; then
        local cpu_percent=$(echo "$cpu_allocated" | sed 's/%//')
        cpu_allocated_num=$(awk "BEGIN {printf \"%.2f\", $total_cpu * $cpu_percent / 100}")
    else
        # Try to parse as millicores or cores
        if echo "$cpu_allocated" | grep -q "m"; then
            cpu_allocated_num=$(echo "$cpu_allocated" | sed 's/m//' | awk '{print $1/1000}')
        else
            cpu_allocated_num=$(echo "$cpu_allocated" | sed 's/[^0-9.]//g')
        fi
    fi
    
    if echo "$memory_allocated" | grep -q "%"; then
        local mem_percent=$(echo "$memory_allocated" | sed 's/%//')
        memory_allocated_num=$(awk "BEGIN {printf \"%.0f\", $total_memory_mi * $mem_percent / 100}")
    else
        # Try to parse memory (handle Mi, Gi, etc.)
        if echo "$memory_allocated" | grep -qi "Gi"; then
            memory_allocated_num=$(echo "$memory_allocated" | sed 's/Gi//;s/[^0-9.]//g' | awk '{print $1*1024}')
        elif echo "$memory_allocated" | grep -qi "Mi"; then
            memory_allocated_num=$(echo "$memory_allocated" | sed 's/Mi//;s/[^0-9.]//g')
        else
            memory_allocated_num=$(echo "$memory_allocated" | sed 's/[^0-9.]//g')
        fi
    fi
    
    # Convert required resources to numeric values
    local required_cpu_num=$(echo "$REQUIRED_CPU" | sed 's/m$//' | awk '{print $1/1000}')
    local required_memory_num=$(echo "$REQUIRED_MEMORY" | sed 's/Mi$//' | awk '{print $1}')
    
    # Calculate available resources
    local available_cpu=$(awk "BEGIN {printf \"%.2f\", $total_cpu - $cpu_allocated_num}")
    local available_memory=$(awk "BEGIN {printf \"%.0f\", $total_memory_mi - $memory_allocated_num}")
    
    echo "   📊 Cluster Capacity:"
    echo "      CPU: ${total_cpu} cores"
    echo "      Memory: ${total_memory_mi} Mi"
    echo "   📊 Current Usage (requests):"
    echo "      CPU: ${cpu_allocated_num} cores"
    echo "      Memory: ${memory_allocated_num} Mi"
    echo "   📊 Available:"
    echo "      CPU: ${available_cpu} cores"
    echo "      Memory: ${available_memory} Mi"
    echo "   📊 Required for new instance:"
    echo "      CPU: ${REQUIRED_CPU} (${required_cpu_num} cores)"
    echo "      Memory: ${REQUIRED_MEMORY}"
    
    # Check if we have enough resources (with 10% buffer)
    local cpu_sufficient=$(awk "BEGIN {print ($available_cpu >= $required_cpu_num * 1.1) ? 1 : 0}")
    local memory_sufficient=$(awk "BEGIN {print ($available_memory >= $required_memory_num * 1.1) ? 1 : 0}")
    
    if [ "$cpu_sufficient" -eq 0 ] || [ "$memory_sufficient" -eq 0 ]; then
        echo ""
        echo "❌ Error: Insufficient cluster resources for new deployment"
        if [ "$cpu_sufficient" -eq 0 ]; then
            echo "   ⚠️  CPU: Required ${REQUIRED_CPU} (${required_cpu_num} cores), but only ${available_cpu} cores available"
        fi
        if [ "$memory_sufficient" -eq 0 ]; then
            echo "   ⚠️  Memory: Required ${REQUIRED_MEMORY}, but only ${available_memory} Mi available"
        fi
        echo ""
        echo "💡 Suggestions:"
        echo "   - Scale down or remove other instances"
        echo "   - Add more nodes to the cluster"
        echo "   - Reduce resource requests for existing deployments"
        return 1
    fi
    
    echo "✅ Sufficient resources available"
    return 0
}

# Function to check pod health after deployment
check_pod_health() {
    local deployment_name=$1
    local namespace=$2
    local timeout=120  # 2 minutes in seconds
    local elapsed=0
    local check_interval=5
    
    echo "🔍 Monitoring pod health for ${deployment_name}..."
    
    # Wait a moment for pod to be created
    sleep 3
    
    while [ $elapsed -lt $timeout ]; do
        # Check if pod exists - use deployment name as label selector (deployment name matches the app label)
        local pod_count=$(kubectl get pods -n "${namespace}" -l app="${deployment_name}" --no-headers 2>/dev/null | wc -l)
        if [ "$pod_count" -eq 0 ]; then
            if [ $elapsed -lt 30 ]; then
                # Pod might not be created yet, wait a bit more
                sleep $check_interval
                elapsed=$((elapsed + check_interval))
                continue
            else
                echo ""
                echo "❌ Error: No pods found for deployment ${deployment_name}"
                echo ""
                echo "📋 Deployment Status:"
                kubectl get deployment "${deployment_name}" -n "${namespace}" || true
                return 1
            fi
        fi
        
        # Get pod status - use deployment name as label selector
        local pod_status=$(kubectl get pods -n "${namespace}" -l app="${deployment_name}" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "")
        local pod_ready=$(kubectl get pods -n "${namespace}" -l app="${deployment_name}" -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
        local pod_name=$(kubectl get pods -n "${namespace}" -l app="${deployment_name}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
        
        if [ -z "$pod_name" ]; then
            sleep $check_interval
            elapsed=$((elapsed + check_interval))
            continue
        fi
        
        # Check for backoff states
        local waiting_reason=$(kubectl get pods -n "${namespace}" "${pod_name}" -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || echo "")
        local last_state_reason=$(kubectl get pods -n "${namespace}" "${pod_name}" -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}' 2>/dev/null || echo "")
        local restart_count=$(kubectl get pods -n "${namespace}" "${pod_name}" -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null || echo "0")
        
        # Check for common error states
        if [[ "$waiting_reason" == *"BackOff"* ]] || [[ "$waiting_reason" == *"ImagePullBackOff"* ]] || [[ "$waiting_reason" == *"CrashLoopBackOff"* ]] || [[ "$waiting_reason" == *"ErrImagePull"* ]]; then
            echo ""
            echo "❌ Error: Pod is in error state: ${waiting_reason}"
            if [ "$restart_count" -gt 0 ]; then
                echo "   Restart count: ${restart_count}"
            fi
            echo ""
            echo "📋 Pod Details:"
            kubectl get pods -n "${namespace}" -l app="${deployment_name}"
            echo ""
            echo "📋 Pod Events:"
            kubectl describe pod "${pod_name}" -n "${namespace}" | grep -A 20 "Events:" || true
            echo ""
            echo "📋 Pod Logs (last 50 lines):"
            kubectl logs "${pod_name}" -n "${namespace}" --tail=50 2>&1 || true
            return 1
        fi
        
        if [[ "$last_state_reason" == *"Error"* ]] || [[ "$last_state_reason" == *"CrashLoopBackOff"* ]]; then
            echo ""
            echo "❌ Error: Pod container terminated with error: ${last_state_reason}"
            if [ "$restart_count" -gt 0 ]; then
                echo "   Restart count: ${restart_count}"
            fi
            echo ""
            echo "📋 Pod Details:"
            kubectl get pods -n "${namespace}" -l app="${deployment_name}"
            echo ""
            echo "📋 Pod Logs (last 50 lines):"
            kubectl logs "${pod_name}" -n "${namespace}" --tail=50 2>&1 || true
            return 1
        fi
        
        # Check for excessive restarts (might indicate a problem)
        if [ "$restart_count" -gt 3 ]; then
            echo ""
            echo "⚠️  Warning: Pod has restarted ${restart_count} times"
        fi
        
        # Check if pod is ready
        if [ "$pod_ready" == "True" ]; then
            echo "✅ Pod is ready and healthy"
            if [ "$restart_count" -gt 0 ]; then
                echo "   (Note: Pod restarted ${restart_count} time(s) before becoming ready)"
            fi
            return 0
        fi
        
        # Show progress every 10 seconds (more frequent updates)
        if [ $((elapsed % 10)) -eq 0 ]; then
            echo "   ⏳ Waiting for pod to be ready... (${elapsed}s / ${timeout}s)"
            echo "      Current status: ${pod_status}, Ready: ${pod_ready}"
            if [ -n "$waiting_reason" ] && [ "$waiting_reason" != "<no value>" ]; then
                echo "      Waiting reason: ${waiting_reason}"
            fi
        fi
        
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done
    
    # Timeout reached
    echo ""
    echo "❌ Error: Pod did not become ready within ${timeout} seconds"
    echo ""
    echo "📋 Pod Status:"
    kubectl get pods -n "${namespace}" -l app="${deployment_name}"
    echo ""
    if [ -n "$pod_name" ]; then
        echo "📋 Pod Details:"
        kubectl describe pod "${pod_name}" -n "${namespace}"
        echo ""
        echo "📋 Pod Logs (last 100 lines):"
        kubectl logs "${pod_name}" -n "${namespace}" --tail=100 2>&1 || true
    fi
    return 1
}

# Check resource availability before deployment
if ! check_resource_availability; then
    echo ""
    echo "❌ Deployment aborted due to insufficient resources"
    exit 1
fi

# Create temporary directory for generated manifests
TEMP_DIR=$(mktemp -d)
echo "📁 Using temporary directory: ${TEMP_DIR}"

# Function to generate manifests with instance-specific values
generate_manifests() {
    echo "🔧 Generating instance-specific manifests..."
    
    # Generate namespace
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/namespace.yaml > "${TEMP_DIR}/namespace.yaml"
    
    # Generate Redis deployment
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/redis-deployment.yaml > "${TEMP_DIR}/redis-deployment.yaml"
    
    # Generate ConfigMap with instance token and plan-specific values
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/INSTANCE_TOKEN_PLACEHOLDER/${INSTANCE_TOKEN}/g" \
        -e "s/JWT_SECRET_PLACEHOLDER/${JWT_SECRET}/g" \
        -e "s/USER_LIMIT_PLACEHOLDER/${USER_LIMIT}/g" \
        -e "s/TASK_LIMIT_PLACEHOLDER/${TASK_LIMIT}/g" \
        -e "s/BOARD_LIMIT_PLACEHOLDER/${BOARD_LIMIT}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        -e "s/SUPPORT_TYPE_PLACEHOLDER/${SUPPORT_TYPE}/g" \
        -e "s/APP_VERSION_PLACEHOLDER//g" \
        ${SCRIPT_DIR}/configmap.yaml > "${TEMP_DIR}/configmap.yaml"
    
    # Generate app deployment
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/DEPLOYMENT_NAME_PLACEHOLDER/easy-kanban-${INSTANCE_NAME}/g" \
        -e "s/IMAGE_NAME_PLACEHOLDER/easy-kanban:latest/g" \
        ${SCRIPT_DIR}/app-deployment.yaml > "${TEMP_DIR}/app-deployment.yaml"
    
    # Generate services
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/service.yaml > "${TEMP_DIR}/service.yaml"
    
    # Generate ingress with dynamic hostname
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/easy-kanban.local/${FULL_HOSTNAME}/g" \
        ${SCRIPT_DIR}/ingress.yaml > "${TEMP_DIR}/ingress.yaml"
    
    # Create storage directories
    echo "📁 Creating storage directories for ${INSTANCE_NAME}..."
    sudo -n mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data" || true
    sudo -n mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments" || true
    sudo -n mkdir -p "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars" || true
    sudo -n chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data" || true
    sudo -n chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments" || true
    sudo -n chmod 755 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars" || true
    
    # Generate persistent volumes
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        ${SCRIPT_DIR}/persistent-volume-template.yaml > "${TEMP_DIR}/persistent-volume.yaml"
    
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        ${SCRIPT_DIR}/persistent-volume-attachments-template.yaml > "${TEMP_DIR}/persistent-volume-attachments.yaml"
    
    sed -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        ${SCRIPT_DIR}/persistent-volume-avatars-template.yaml > "${TEMP_DIR}/persistent-volume-avatars.yaml"
    
    # Generate persistent volume claims
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/STORAGE_CLASS_PLACEHOLDER/easy-kanban-storage/g" \
        ${SCRIPT_DIR}/persistent-volume-claim.yaml > "${TEMP_DIR}/persistent-volume-claim.yaml"
    
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/STORAGE_LIMIT_PLACEHOLDER/${STORAGE_LIMIT}/g" \
        -e "s/STORAGE_CLASS_PLACEHOLDER/easy-kanban-storage/g" \
        ${SCRIPT_DIR}/persistent-volume-claim-attachments.yaml > "${TEMP_DIR}/persistent-volume-claim-attachments.yaml"
    
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_NAME_PLACEHOLDER/${INSTANCE_NAME}/g" \
        -e "s/STORAGE_CLASS_PLACEHOLDER/easy-kanban-storage/g" \
        ${SCRIPT_DIR}/persistent-volume-claim-avatars.yaml > "${TEMP_DIR}/persistent-volume-claim-avatars.yaml"
}

# Generate manifests
generate_manifests

# Apply the namespace first
echo "📦 Creating namespace..."
kubectl apply -f "${TEMP_DIR}/namespace.yaml"

# Apply Redis deployment
echo "🗄️  Deploying Redis..."
kubectl apply -f "${TEMP_DIR}/redis-deployment.yaml"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
if kubectl wait --for=condition=available --timeout=300s deployment/redis -n "${NAMESPACE}" 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis failed to become ready"
    exit 1
fi

# Apply ConfigMap
echo "⚙️  Creating ConfigMap..."
kubectl apply -f "${TEMP_DIR}/configmap.yaml"

# Create storage class
echo "📁 Creating storage class..."
kubectl apply -f "${SCRIPT_DIR}/storage-class.yaml"

# Create persistent volumes
echo "💾 Creating persistent volumes..."
kubectl apply -f "${TEMP_DIR}/persistent-volume.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-attachments.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-avatars.yaml"

# Create persistent volume claims
echo "🔗 Creating persistent volume claims..."
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim-attachments.yaml"
kubectl apply -f "${TEMP_DIR}/persistent-volume-claim-avatars.yaml"

# Fix ownership before deploying the application
echo "🔧 Setting correct ownership for storage directories..."
sudo -n chown -R 1001:65533 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data" || true
sudo -n chown -R 1001:65533 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments" || true
sudo -n chown -R 1001:65533 "/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars" || true

# Apply the main application
echo "🎯 Deploying Easy Kanban application..."
kubectl apply -f "${TEMP_DIR}/app-deployment.yaml"

# Wait for the app to be ready and check pod health
echo "⏳ Waiting for Easy Kanban to be ready..."
if ! check_pod_health "easy-kanban-${INSTANCE_NAME}" "${NAMESPACE}"; then
    echo ""
    echo "❌ Deployment failed: Pod did not become healthy"
    echo ""
    echo "💡 Troubleshooting steps:"
    echo "   1. Check pod logs: kubectl logs -n ${NAMESPACE} -l app=easy-kanban-${INSTANCE_NAME}"
    echo "   2. Check pod events: kubectl describe pod -n ${NAMESPACE} -l app=easy-kanban-${INSTANCE_NAME}"
    echo "   3. Check resource constraints: kubectl top nodes"
    echo "   4. Verify image exists: kubectl get pods -n ${NAMESPACE} -l app=easy-kanban-${INSTANCE_NAME} -o jsonpath='{.items[0].spec.containers[0].image}'"
    exit 1
fi

# Apply services
echo "🌐 Creating services..."
kubectl apply -f "${TEMP_DIR}/service.yaml"

# Apply ingress
echo "🔗 Creating ingress..."
kubectl apply -f "${TEMP_DIR}/ingress.yaml"

echo "✅ Deployment completed successfully!"

# Extract IP and port information
echo ""
echo "🔍 Extracting deployment information..."

# Get the external IP and NodePort information
EXTERNAL_IP=""
NODEPORT=""
INGRESS_IP=$(kubectl get ingress easy-kanban-${INSTANCE_NAME}-ingress -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

# Always get NodePort information for admin portal (frontend port for web access)
NODEPORT=$(kubectl get service easy-kanban-${INSTANCE_NAME}-nodeport -n "${NAMESPACE}" -o jsonpath='{.spec.ports[?(@.name=="frontend")].nodePort}' 2>/dev/null || echo "")
if [ -n "$NODEPORT" ]; then
    # Get node IP for NodePort access
    NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null)
    if [ -z "$NODE_IP" ]; then
        NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
    fi
    if [ -z "$NODE_IP" ]; then
        NODE_IP="localhost"
    fi
    EXTERNAL_IP="$NODE_IP:$NODEPORT"
fi

# Show status
echo ""
echo "📊 Deployment Status:"
kubectl get pods -n "${NAMESPACE}"
echo ""
echo "🌐 Services:"
kubectl get services -n "${NAMESPACE}"
echo ""
echo "🔗 Ingress:"
kubectl get ingress -n "${NAMESPACE}"

echo ""
echo "🎉 Easy Kanban instance '${INSTANCE_NAME}' is now running!"
echo ""
echo "📍 Instance Details:"
echo "   Instance Name: ${INSTANCE_NAME}"
echo "   Namespace: ${NAMESPACE}"
echo "   Hostname: ${FULL_HOSTNAME}"
echo "   External Access: ${EXTERNAL_IP}"
echo "   Instance Token: ${INSTANCE_TOKEN}"
echo ""
echo "💾 Storage Paths:"
echo "   Database: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
echo "   Attachments: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
echo "   Avatars: /data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
echo ""
echo "🌐 Access URLs:"
echo "   - Primary: https://${FULL_HOSTNAME}"
if [ -n "$NODEPORT" ]; then
    echo "   - Direct: http://${EXTERNAL_IP}"
fi
echo ""
echo "🔧 Management Commands:"
echo "   View logs: kubectl logs -f deployment/easy-kanban-${INSTANCE_NAME} -n ${NAMESPACE}"
echo "   Delete instance: kubectl delete namespace ${NAMESPACE}"
echo "   Scale replicas: kubectl scale deployment easy-kanban-${INSTANCE_NAME} --replicas=1 -n ${NAMESPACE}"

# Clean up temporary files
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf "${TEMP_DIR}"

# Return the IP and port information for programmatic use
echo ""
echo "📤 DEPLOYMENT_RESULT:"
echo "INSTANCE_NAME=${INSTANCE_NAME}"
echo "NAMESPACE=${NAMESPACE}"
echo "HOSTNAME=${FULL_HOSTNAME}"
echo "EXTERNAL_IP=${EXTERNAL_IP}"
echo "NODEPORT=${NODEPORT}"
echo "INSTANCE_TOKEN=${INSTANCE_TOKEN}"
echo "STORAGE_DATA_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
echo "STORAGE_ATTACHMENTS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
echo "STORAGE_AVATARS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
