#!/bin/bash

# Easy Kanban Multi-Tenant Kubernetes Deployment Script

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <instance_name> <plan>"
    echo ""
    echo "Parameters:"
    echo "  instance_name  - The instance hostname (e.g., my-instance-name)"
    echo "  plan          - License plan: 'basic' or 'pro'"
    echo ""
    echo "Example:"
    echo "  $0 my-company basic"
    echo "  $0 enterprise pro"
    echo ""
    echo "This will deploy Easy Kanban accessible at: https://my-company.ezkan.cloud"
    echo ""
    echo "Note: Instance token is automatically generated on first deployment"
    echo "      and preserved for all subsequent deployments."
    exit 1
}

# Function to generate a secure random token
generate_instance_token() {
    # Generate a 64-character hexadecimal token (256 bits of entropy)
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    elif command -v shuf &> /dev/null; then
        # Fallback: use /dev/urandom with shuf
        cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1
    else
        # Last resort: use /dev/urandom with od
        od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    fi
}

# Check parameters
if [ $# -ne 2 ]; then
    echo "❌ Error: Missing required parameters"
    usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="$1"
PLAN="$2"
# Use shared namespace for multi-tenancy with NFS
# All tenants share the same namespace, deployment, and storage
NAMESPACE="easy-kanban"
DOMAIN="ezkan.cloud"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"
# Tenant ID is the instance name (extracted from hostname by middleware)
TENANT_ID="${INSTANCE_NAME}"

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

# Initialize RECOVERED_TOKEN variable (used as fallback if ConfigMap read fails)
RECOVERED_TOKEN=""

echo "🚀 Deploying Easy Kanban instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo "🌐 Hostname: ${FULL_HOSTNAME}"
# Instance token will be generated or retrieved from ConfigMap
# Don't display it here as it may not be set yet
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
    
    echo ""
    echo "🔍 Monitoring pod health for ${deployment_name}..."
    echo "   Timeout: ${timeout}s, Check interval: ${check_interval}s"
    
    # Wait a moment for pod to be created
    echo "   ⏳ Waiting 3 seconds for pod to be created..."
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
        
        # Show progress every 5 seconds (more frequent updates)
        if [ $((elapsed % 5)) -eq 0 ]; then
            echo "   ⏳ [${elapsed}s/${timeout}s] Status: ${pod_status:-Unknown}, Ready: ${pod_ready:-False}"
            if [ -n "$waiting_reason" ] && [ "$waiting_reason" != "<no value>" ]; then
                echo "      ⚠️  Waiting reason: ${waiting_reason}"
            fi
            if [ -n "$pod_name" ]; then
                echo "      📦 Pod: ${pod_name}"
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

# Function to generate manifests for shared multi-tenant deployment
generate_manifests() {
    echo ""
    echo "🔧 Generating Kubernetes manifests..."
    echo "   📝 Creating deployment manifests in ${TEMP_DIR}..."
    
    # Generate namespace
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/namespace.yaml > "${TEMP_DIR}/namespace.yaml"
    
    # Generate Redis deployment (shared)
    sed "s/easy-kanban/${NAMESPACE}/g" ${SCRIPT_DIR}/redis-deployment.yaml > "${TEMP_DIR}/redis-deployment.yaml"
    
    # Generate shared ConfigMap for multi-tenant mode
    # All tenants share the same ConfigMap with MULTI_TENANT=true
    # Note: License limits (USER_LIMIT, etc.) are NOT in ConfigMap - they're stored per-tenant in database
    # INSTANCE_NAME is set to generic "easy-kanban-app" (tenant hostnames come from request)
    # STARTUP_TENANT_ID is set to the current instance's tenant ID to pre-initialize its database
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/INSTANCE_TOKEN_PLACEHOLDER/${INSTANCE_TOKEN}/g" \
        -e "s/JWT_SECRET_PLACEHOLDER/${JWT_SECRET}/g" \
        -e "s/APP_VERSION_PLACEHOLDER//g" \
        -e "s/MULTI_TENANT: \"false\"/MULTI_TENANT: \"true\"/g" \
        -e "s/STARTUP_TENANT_ID: \"\"/STARTUP_TENANT_ID: \"${TENANT_ID}\"/g" \
        ${SCRIPT_DIR}/configmap.yaml > "${TEMP_DIR}/configmap.yaml"
    
    # Generate shared app deployment (deployed once for all tenants)
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/DEPLOYMENT_NAME_PLACEHOLDER/easy-kanban/g" \
        -e "s/IMAGE_NAME_PLACEHOLDER/easy-kanban:latest/g" \
        -e "s/name: easy-kanban-config-INSTANCE_NAME_PLACEHOLDER/name: easy-kanban-config/g" \
        ${SCRIPT_DIR}/app-deployment.yaml > "${TEMP_DIR}/app-deployment.yaml"
    
    # Generate shared services (one service for all tenants)
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/instance: INSTANCE_NAME_PLACEHOLDER/app: easy-kanban/g" \
        ${SCRIPT_DIR}/service.yaml > "${TEMP_DIR}/service.yaml"
    
    # Generate ingress rule for this specific tenant hostname
    # Each tenant gets their own ingress rule pointing to the shared service
    sed -e "s/easy-kanban/${NAMESPACE}/g" \
        -e "s/easy-kanban.local/${FULL_HOSTNAME}/g" \
        -e "s/name: easy-kanban-ingress/name: easy-kanban-ingress-${INSTANCE_NAME}/g" \
        ${SCRIPT_DIR}/ingress.yaml > "${TEMP_DIR}/ingress.yaml"
    
    echo "   ✅ Manifests generated successfully"
}

# Generate manifests
generate_manifests

# Apply the namespace first (shared namespace for multi-tenancy)
echo ""
echo "📦 Step 1/7: Applying namespace..."
echo "   Using shared namespace: ${NAMESPACE}"
kubectl apply -f "${TEMP_DIR}/namespace.yaml"
echo "   ✅ Namespace ready"

# Check if Redis already exists in shared namespace (shared Redis for multi-tenancy)
echo ""
echo "📦 Step 2/7: Checking Redis deployment..."
if kubectl get deployment redis -n "${NAMESPACE}" &>/dev/null; then
    echo "   🗄️  Redis already exists in shared namespace, reusing it..."
else
    echo "   🗄️  Deploying Redis (shared for all instances)..."
    kubectl apply -f "${TEMP_DIR}/redis-deployment.yaml"
    
    # Wait for Redis to be ready
    echo "   ⏳ Waiting for Redis to be ready (timeout: 300s)..."
    if kubectl wait --for=condition=available --timeout=300s deployment/redis -n "${NAMESPACE}" 2>&1; then
        echo "   ✅ Redis is ready"
    else
        echo "   ❌ Redis failed to become ready"
        exit 1
    fi
fi

# Apply shared ConfigMap (only if it doesn't exist)
echo ""
echo "📦 Step 3/7: Applying ConfigMap..."
if kubectl get configmap easy-kanban-config -n "${NAMESPACE}" &>/dev/null; then
    echo "   ⚙️  Shared ConfigMap already exists"
    # Check if STARTUP_TENANT_ID is already set
    CURRENT_STARTUP_TENANT=$(kubectl get configmap easy-kanban-config -n "${NAMESPACE}" -o jsonpath='{.data.STARTUP_TENANT_ID}' 2>/dev/null || echo "")
    CURRENT_INSTANCE_TOKEN=$(kubectl get configmap easy-kanban-config -n "${NAMESPACE}" -o jsonpath='{.data.INSTANCE_TOKEN}' 2>/dev/null || echo "")
    
    # Preserve existing INSTANCE_TOKEN to avoid pod restart
    # INSTANCE_TOKEN is shared across all tenants in multi-tenant mode
    # CRITICAL: Token only changes when a new pod is created (first deployment)
    # If pod already exists, we MUST preserve the existing token
    if [ -n "$CURRENT_INSTANCE_TOKEN" ] && [ "$CURRENT_INSTANCE_TOKEN" != "" ]; then
        echo "   ℹ️  INSTANCE_TOKEN already set (shared for all tenants, preserving to avoid pod restart)"
        # Update the new ConfigMap to preserve existing INSTANCE_TOKEN
        sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${CURRENT_INSTANCE_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
        RECOVERED_TOKEN="$CURRENT_INSTANCE_TOKEN"
    else
        # ConfigMap exists but token is missing or empty - check if pod exists
        # If pod exists, try to get the token from the pod's environment
        # If no pod exists, we can generate a new token
        if kubectl get deployment easy-kanban -n "${NAMESPACE}" &>/dev/null; then
            echo "   ⚠️  Warning: ConfigMap exists but INSTANCE_TOKEN is missing or empty, and pod already exists"
            echo "   🔍 Attempting to recover INSTANCE_TOKEN from running pod..."
            
            # Try to get token from pod's environment variable
            POD_NAME=$(kubectl get pods -n "${NAMESPACE}" -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
            if [ -n "$POD_NAME" ]; then
                POD_TOKEN=$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- printenv INSTANCE_TOKEN 2>/dev/null || echo "")
                if [ -n "$POD_TOKEN" ] && [ "$POD_TOKEN" != "" ]; then
                    echo "   ✅ Recovered INSTANCE_TOKEN from pod environment: ${POD_TOKEN:0:20}..."
                    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${POD_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                    RECOVERED_TOKEN="$POD_TOKEN"
                else
                    echo "   ⚠️  Could not recover token from pod - generating new one"
                    echo "   ⚠️  Note: This will require pod restart and admin portal will need to update token"
                    GENERATED_TOKEN=$(generate_instance_token)
                    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${GENERATED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                    RECOVERED_TOKEN="$GENERATED_TOKEN"
                fi
            else
                echo "   ⚠️  No running pod found - generating new token"
                GENERATED_TOKEN=$(generate_instance_token)
                sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${GENERATED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                RECOVERED_TOKEN="$GENERATED_TOKEN"
            fi
        else
            echo "   ℹ️  ConfigMap exists but INSTANCE_TOKEN is missing, and no pod exists yet"
            echo "   🔑 Generating new INSTANCE_TOKEN (new deployment)"
            GENERATED_TOKEN=$(generate_instance_token)
            sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${GENERATED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
            RECOVERED_TOKEN="$GENERATED_TOKEN"
        fi
    fi
    
    if [ -z "$CURRENT_STARTUP_TENANT" ]; then
        # No STARTUP_TENANT_ID set yet - set it to this tenant (first tenant)
        echo "   📝 Setting STARTUP_TENANT_ID to '${TENANT_ID}' (first tenant)"
        kubectl apply -f "${TEMP_DIR}/configmap.yaml"
        CONFIGMAP_UPDATED=true
    else
        # STARTUP_TENANT_ID already set - only update other fields, don't change STARTUP_TENANT_ID
        # This avoids restarting pods for every new tenant
        echo "   ℹ️  STARTUP_TENANT_ID already set to '${CURRENT_STARTUP_TENANT}' (preserving to avoid pod restart)"
        echo "   📝 Updating other ConfigMap fields only..."
        # Update the new ConfigMap to preserve existing STARTUP_TENANT_ID
        if [ -n "$CURRENT_STARTUP_TENANT" ]; then
            sed -i "s/STARTUP_TENANT_ID: \"${TENANT_ID}\"/STARTUP_TENANT_ID: \"${CURRENT_STARTUP_TENANT}\"/g" "${TEMP_DIR}/configmap.yaml"
        fi
        kubectl apply -f "${TEMP_DIR}/configmap.yaml"
        CONFIGMAP_UPDATED=false
    fi
else
    echo "   ⚙️  Creating shared ConfigMap..."
    # First deployment: generate a new token
    echo "   🔑 Generating new INSTANCE_TOKEN (first deployment)"
    GENERATED_TOKEN=$(generate_instance_token)
    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${GENERATED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
    RECOVERED_TOKEN="$GENERATED_TOKEN"
    kubectl apply -f "${TEMP_DIR}/configmap.yaml"
    CONFIGMAP_UPDATED=false
fi
echo "   ✅ ConfigMap ready"

# CRITICAL: After ConfigMap is applied, re-read the actual token from ConfigMap
# This ensures we always output the token that's actually in the ConfigMap (preserved or new)
# This is the token that pods will use (after restart if needed)
ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP=$(kubectl get configmap easy-kanban-config -n "${NAMESPACE}" -o jsonpath='{.data.INSTANCE_TOKEN}' 2>/dev/null || echo "")
if [ -n "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" ] && [ "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" != "" ]; then
    # ConfigMap has a token - this is the one that's actually configured
    # Store it for later output (this is the source of truth)
    ACTUAL_INSTANCE_TOKEN="$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP"
elif [ -n "$RECOVERED_TOKEN" ] && [ "$RECOVERED_TOKEN" != "" ]; then
    # ConfigMap doesn't have a token but we recovered one from pod
    # Use the recovered token (it should be in ConfigMap after apply, but use recovered as fallback)
    echo "   ⚠️  Warning: INSTANCE_TOKEN not found in ConfigMap after apply, using recovered token"
    ACTUAL_INSTANCE_TOKEN="$RECOVERED_TOKEN"
else
    # ConfigMap doesn't have a token and we couldn't recover one (shouldn't happen, but fallback)
    # Generate a token as last resort
    echo "   ⚠️  Warning: INSTANCE_TOKEN not found in ConfigMap and couldn't recover from pod, generating fallback"
    ACTUAL_INSTANCE_TOKEN=$(generate_instance_token)
fi

# Skip instance-specific storage for multi-tenant mode with shared NFS
# All instances use the shared NFS PVCs (data, attachments, avatars) which are already created
echo ""
echo "📦 Step 4/7: Checking storage..."
echo "   📦 Using shared NFS storage for multi-tenant deployment"
echo "   Shared PVCs: easy-kanban-shared-pvc-data, easy-kanban-shared-pvc-attachments, easy-kanban-shared-pvc-avatars"
echo "   Tenant data will be stored at: /app/server/data/tenants/${TENANT_ID}/"
PVC_DATA_EXISTS=$(kubectl get pvc easy-kanban-shared-pvc-data -n "${NAMESPACE}" &>/dev/null && echo "yes" || echo "no")
PVC_ATTACHMENTS_EXISTS=$(kubectl get pvc easy-kanban-shared-pvc-attachments -n "${NAMESPACE}" &>/dev/null && echo "yes" || echo "no")
PVC_AVATARS_EXISTS=$(kubectl get pvc easy-kanban-shared-pvc-avatars -n "${NAMESPACE}" &>/dev/null && echo "yes" || echo "no")

if [ "$PVC_DATA_EXISTS" = "yes" ] && [ "$PVC_ATTACHMENTS_EXISTS" = "yes" ] && [ "$PVC_AVATARS_EXISTS" = "yes" ]; then
    echo "   ✅ All shared PVCs exist"
else
    echo "   ⚠️  Warning: Some shared PVCs not found:"
    [ "$PVC_DATA_EXISTS" = "no" ] && echo "      - easy-kanban-shared-pvc-data missing"
    [ "$PVC_ATTACHMENTS_EXISTS" = "no" ] && echo "      - easy-kanban-shared-pvc-attachments missing"
    [ "$PVC_AVATARS_EXISTS" = "no" ] && echo "      - easy-kanban-shared-pvc-avatars missing"
    echo "      Deployment may fail"
fi

# Deploy shared application (only if not already deployed)
echo ""
echo "📦 Step 5/7: Deploying application..."
if kubectl get deployment easy-kanban -n "${NAMESPACE}" &>/dev/null; then
    echo "   🎯 Application already deployed (shared for all tenants)"
    # Only restart pods if STARTUP_TENANT_ID was actually updated (first tenant only)
    if [ "$CONFIGMAP_UPDATED" = "true" ]; then
        echo "   🔄 ConfigMap updated with STARTUP_TENANT_ID='${TENANT_ID}', restarting pods to apply changes..."
        kubectl rollout restart deployment/easy-kanban -n "${NAMESPACE}"
        echo "   ⏳ Waiting for pods to restart..."
        sleep 5
        # Wait for rollout to complete (but don't fail if it takes a while)
        kubectl rollout status deployment/easy-kanban -n "${NAMESPACE}" --timeout=120s || echo "   ⚠️  Rollout may still be in progress"
    else
        echo "   ℹ️  No pod restart needed - tenant database will be created on first request"
    fi
else
    echo "   🎯 Deploying shared Easy Kanban application (for all tenants)..."
    kubectl apply -f "${TEMP_DIR}/app-deployment.yaml"
    echo "   ✅ Deployment manifest applied"
    
    # Wait for the app to be ready and check pod health
    if ! check_pod_health "easy-kanban" "${NAMESPACE}"; then
        echo ""
        echo "   ❌ Deployment failed: Pod did not become healthy"
        echo ""
        echo "   💡 Troubleshooting steps:"
        echo "      1. Check pod logs: kubectl logs -n ${NAMESPACE} -l app=easy-kanban"
        echo "      2. Check pod events: kubectl describe pod -n ${NAMESPACE} -l app=easy-kanban"
        echo "      3. Check resource constraints: kubectl top nodes"
        echo "      4. Verify image exists: kubectl get pods -n ${NAMESPACE} -l app=easy-kanban -o jsonpath='{.items[0].spec.containers[0].image}'"
        exit 1
    fi
    echo "   ✅ Application is ready"
fi

# Apply shared services (only if not already deployed)
echo ""
echo "📦 Step 6/7: Applying services..."
if kubectl get service easy-kanban-service -n "${NAMESPACE}" &>/dev/null; then
    echo "   🔗 Shared services already exist, skipping..."
else
    echo "   🔗 Creating shared services..."
    kubectl apply -f "${TEMP_DIR}/service.yaml"
    echo "   ✅ Services created"
fi

# Apply ingress rule for this tenant (each tenant gets their own ingress rule)
echo ""
echo "📦 Step 7/8: Applying ingress..."
INGRESS_NAME="easy-kanban-ingress-${INSTANCE_NAME}"
if kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" &>/dev/null; then
    echo "   🌐 Ingress rule '${INGRESS_NAME}' already exists, updating..."
    kubectl apply -f "${TEMP_DIR}/ingress.yaml"
    echo "   ✅ Ingress rule updated"
else
    echo "   🌐 Creating ingress rule for tenant: ${FULL_HOSTNAME}..."
    kubectl apply -f "${TEMP_DIR}/ingress.yaml"
    echo "   ✅ Ingress rule created"
fi

# Initialize tenant database by making a request to the app
# This ensures the database exists before the admin portal tries to connect
echo ""
echo "📦 Step 8/8: Initializing tenant database..."
echo "   🔄 Waiting for pod to be ready..."
POD_READY=false
MAX_WAIT=60
WAIT_COUNT=0
POD_NAME=""
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    POD_NAME=$(kubectl get pods -n "${NAMESPACE}" -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$POD_NAME" ]; then
        POD_STATUS=$(kubectl get pod "${POD_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
        if [ "$POD_STATUS" = "Running" ]; then
            READY=$(kubectl get pod "${POD_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "false")
            if [ "$READY" = "true" ]; then
                POD_READY=true
                break
            fi
        fi
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ $((WAIT_COUNT % 5)) -eq 0 ]; then
        echo "   ⏳ Still waiting... (${WAIT_COUNT}s)"
    fi
done

if [ "$POD_READY" = "true" ] && [ -n "$POD_NAME" ]; then
    echo "   ✅ Pod is ready"
    echo "   🔄 Triggering database initialization for tenant '${TENANT_ID}'..."
    
    # Make a request to the health endpoint from within the pod
    # This will trigger the tenantRouting middleware which creates the database if needed
    # We use the service ClusterIP and set the Host header to the tenant's hostname
    SERVICE_URL="http://easy-kanban-service.${NAMESPACE}.svc.cluster.local"
    
    # Try using Node.js to make the request (Node.js is definitely available in the pod)
    INIT_SUCCESS=false
    INIT_OUTPUT=$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- \
        node -e "
        const http = require('http');
        const options = {
            hostname: 'easy-kanban-service.${NAMESPACE}.svc.cluster.local',
            port: 80,
            path: '/health',
            method: 'GET',
            headers: {
                'Host': '${FULL_HOSTNAME}',
                'X-Forwarded-Host': '${FULL_HOSTNAME}'
            },
            timeout: 5000
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 503) {
                    console.log('SUCCESS');
                } else {
                    console.log('FAILED: ' + res.statusCode);
                }
            });
        });
        req.on('error', (e) => { console.log('ERROR: ' + e.message); });
        req.on('timeout', () => { req.destroy(); console.log('TIMEOUT'); });
        req.end();
        " 2>&1)
    
    if echo "$INIT_OUTPUT" | grep -q "SUCCESS"; then
        INIT_SUCCESS=true
    fi
    
    if [ "$INIT_SUCCESS" = "true" ]; then
        echo "   ✅ Tenant database initialized successfully"
    else
        echo "   ⚠️  Could not verify database initialization (will be created on first request)"
        echo "   ℹ️  Database will be automatically created when admin portal connects"
    fi
else
    echo "   ⚠️  Pod not ready after ${MAX_WAIT}s, database will be created on first request"
    echo "   ℹ️  Database will be automatically created when admin portal connects"
fi

echo ""
echo "✅ Deployment completed successfully!"

# Extract IP and port information
echo ""
echo "📊 Gathering deployment details..."

# Get the external IP and NodePort information
EXTERNAL_IP=""
NODEPORT=""
INGRESS_IP=$(kubectl get ingress easy-kanban-ingress-${INSTANCE_NAME} -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

# Always get NodePort information for admin portal (frontend port for web access)
NODEPORT=$(kubectl get service easy-kanban-nodeport -n "${NAMESPACE}" -o jsonpath='{.spec.ports[?(@.name=="frontend")].nodePort}' 2>/dev/null || echo "")
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

# Get the actual INSTANCE_TOKEN being used
# This should already be set from the ConfigMap read above (after ConfigMap was applied)
# But re-read it here to be absolutely sure we have the latest value from ConfigMap
# This is the token that's actually in the ConfigMap (which the pod will use after restart)
ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP=$(kubectl get configmap easy-kanban-config -n "${NAMESPACE}" -o jsonpath='{.data.INSTANCE_TOKEN}' 2>/dev/null || echo "")
if [ -n "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" ] && [ "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" != "" ]; then
    # ConfigMap has a valid token - use it
    ACTUAL_INSTANCE_TOKEN="$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP"
elif [ -n "$RECOVERED_TOKEN" ] && [ "$RECOVERED_TOKEN" != "" ]; then
    # ConfigMap doesn't have a token but we recovered one earlier - use it
    echo "   ⚠️  Warning: INSTANCE_TOKEN not found in ConfigMap, using recovered token from pod"
    ACTUAL_INSTANCE_TOKEN="$RECOVERED_TOKEN"
else
    # Last resort: generate a new token (shouldn't happen)
    echo "   ⚠️  Warning: INSTANCE_TOKEN not found in ConfigMap and couldn't recover, generating fallback"
    ACTUAL_INSTANCE_TOKEN=$(generate_instance_token)
fi

echo ""
echo "🎉 Easy Kanban instance '${INSTANCE_NAME}' is now running!"
echo ""
echo "📍 Instance Details:"
echo "   Instance Name: ${INSTANCE_NAME}"
echo "   Namespace: ${NAMESPACE}"
echo "   Hostname: ${FULL_HOSTNAME}"
echo "   External Access: ${EXTERNAL_IP}"
echo "   Instance Token: ${ACTUAL_INSTANCE_TOKEN}"
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
echo "INSTANCE_TOKEN=${ACTUAL_INSTANCE_TOKEN}"
echo "STORAGE_DATA_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-data"
echo "STORAGE_ATTACHMENTS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-attachments"
echo "STORAGE_AVATARS_PATH=/data/easy-kanban-pv/easy-kanban-${INSTANCE_NAME}-avatars"
