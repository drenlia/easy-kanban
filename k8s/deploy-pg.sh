#!/bin/bash

# Easy Kanban PostgreSQL Multi-Tenant Kubernetes Deployment Script

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
# Use pg namespace for PostgreSQL deployments
NAMESPACE="easy-kanban-pg"
DOMAIN="ezkan.cloud"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"
# Tenant ID is the instance name (extracted from hostname by middleware)
TENANT_ID="${INSTANCE_NAME}"

# PostgreSQL password (hardcoded for now, will use vault later)
POSTGRES_PASSWORD="kanban_password"

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
    STORAGE_LIMIT="1Gi"
    SUPPORT_TYPE="basic"
else
    USER_LIMIT="50"
    TASK_LIMIT="-1"  # unlimited
    BOARD_LIMIT="-1" # unlimited
    STORAGE_LIMIT="10Gi"
    SUPPORT_TYPE="pro"
fi

# Generate random JWT secret
JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Initialize RECOVERED_TOKEN variable
RECOVERED_TOKEN=""

echo "🚀 Deploying Easy Kanban PostgreSQL instance: ${INSTANCE_NAME}"
echo "📍 Namespace: ${NAMESPACE}"
echo "🌐 Hostname: ${FULL_HOSTNAME}"
echo "📋 Plan: ${PLAN} (${SUPPORT_TYPE})"
echo "👥 User Limit: ${USER_LIMIT}"
echo "📝 Task Limit: ${TASK_LIMIT}"
echo "📊 Board Limit: ${BOARD_LIMIT}"
echo "💾 Storage Limit: ${STORAGE_LIMIT}"

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

# Create temporary directory for generated manifests
TEMP_DIR=$(mktemp -d)
echo "📁 Using temporary directory: ${TEMP_DIR}"

# Function to generate manifests
generate_manifests() {
    echo ""
    echo "🔧 Generating Kubernetes manifests..."
    echo "   📝 Creating deployment manifests in ${TEMP_DIR}..."
    
    # Ensure namespace exists
    if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
        echo "   📦 Creating namespace..."
        kubectl apply -f "${SCRIPT_DIR}/namespace-pg.yaml"
    fi
    
    # Ensure PostgreSQL secret exists (create or update)
    echo "   🔐 Ensuring PostgreSQL secret exists..."
    if kubectl get secret postgres-secret -n "${NAMESPACE}" &>/dev/null; then
        echo "   ✅ PostgreSQL secret already exists"
    else
        # Create secret from template
        sed -e "s/easy-kanban-pg/${NAMESPACE}/g" \
            -e "s/change-me-in-production/${POSTGRES_PASSWORD}/g" \
            "${SCRIPT_DIR}/postgres-secret-pg.yaml" > "${TEMP_DIR}/postgres-secret.yaml"
        kubectl apply -f "${TEMP_DIR}/postgres-secret.yaml"
        echo "   ✅ PostgreSQL secret created"
    fi
    
    # Ensure PostgreSQL is deployed
    echo "   🐘 Ensuring PostgreSQL is deployed..."
    if ! kubectl get deployment postgres -n "${NAMESPACE}" &>/dev/null; then
        echo "   🐘 Deploying PostgreSQL..."
        kubectl apply -f "${SCRIPT_DIR}/postgres-pvc-pg.yaml"
        kubectl apply -f "${SCRIPT_DIR}/postgres-deployment-pg.yaml"
        kubectl apply -f "${SCRIPT_DIR}/postgres-service-pg.yaml"
        echo "   ⏳ Waiting for PostgreSQL to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/postgres -n "${NAMESPACE}" || {
            echo "   ⚠️  PostgreSQL may still be starting"
        }
    else
        echo "   ✅ PostgreSQL already deployed"
    fi
    
    # Ensure Redis is deployed (required for Socket.IO session sharing)
    echo "   🗄️  Ensuring Redis is deployed..."
    if ! kubectl get deployment redis -n "${NAMESPACE}" &>/dev/null; then
        echo "   🗄️  Deploying Redis (required for Socket.IO session sharing)..."
        kubectl apply -f "${SCRIPT_DIR}/redis-deployment-pg.yaml"
        echo "   ⏳ Waiting for Redis to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/redis -n "${NAMESPACE}" || {
            echo "   ⚠️  Redis may still be starting"
        }
    else
        echo "   ✅ Redis already deployed"
    fi
    
    # Generate ConfigMap for PostgreSQL
    # All tenants share the same ConfigMap with MULTI_TENANT=true
    # NOTE: INSTANCE_TOKEN_PLACEHOLDER will be replaced later after checking existing ConfigMap
    sed -e "s/easy-kanban-pg/${NAMESPACE}/g" \
        -e "s/JWT_SECRET_PLACEHOLDER/${JWT_SECRET}/g" \
        -e "s/APP_VERSION_PLACEHOLDER//g" \
        -e "s/STARTUP_TENANT_ID: \"\"/STARTUP_TENANT_ID: \"${TENANT_ID}\"/g" \
        "${SCRIPT_DIR}/configmap-pg.yaml" > "${TEMP_DIR}/configmap.yaml"
    
    # Generate app deployment (shared for all tenants)
    sed -e "s/easy-kanban-pg/${NAMESPACE}/g" \
        "${SCRIPT_DIR}/app-deployment-pg.yaml" > "${TEMP_DIR}/app-deployment.yaml"
    
    # Generate services (shared for all tenants) - both ClusterIP and NodePort
    sed -e "s/easy-kanban-pg/${NAMESPACE}/g" \
        "${SCRIPT_DIR}/service-pg.yaml" > "${TEMP_DIR}/service.yaml"
    
    # Generate ingress rule for this specific tenant hostname
    sed -e "s/easy-kanban-pg/${NAMESPACE}/g" \
        -e "s/easy-kanban.local/${FULL_HOSTNAME}/g" \
        -e "s/name: easy-kanban-ingress/name: easy-kanban-ingress-${INSTANCE_NAME}/g" \
        "${SCRIPT_DIR}/ingress.yaml" > "${TEMP_DIR}/ingress.yaml"
    
    echo "   ✅ Manifests generated successfully"
}

# Generate manifests
generate_manifests

# Apply shared ConfigMap (only if it doesn't exist)
echo ""
echo "📦 Step 1/7: Applying ConfigMap..."
if kubectl get configmap easy-kanban-config-pg -n "${NAMESPACE}" &>/dev/null; then
    echo "   ⚙️  Shared ConfigMap already exists"
    # Check if STARTUP_TENANT_ID is already set
    CURRENT_STARTUP_TENANT=$(kubectl get configmap easy-kanban-config-pg -n "${NAMESPACE}" -o jsonpath='{.data.STARTUP_TENANT_ID}' 2>/dev/null || echo "")
    CURRENT_INSTANCE_TOKEN=$(kubectl get configmap easy-kanban-config-pg -n "${NAMESPACE}" -o jsonpath='{.data.INSTANCE_TOKEN}' 2>/dev/null || echo "")
    
    # Preserve existing INSTANCE_TOKEN to avoid pod restart
    if [ -n "$CURRENT_INSTANCE_TOKEN" ] && [ "$CURRENT_INSTANCE_TOKEN" != "" ] && [ "$CURRENT_INSTANCE_TOKEN" != '""' ]; then
        echo "   ℹ️  INSTANCE_TOKEN already set (shared for all tenants, preserving to avoid pod restart)"
        ESCAPED_TOKEN=$(echo "$CURRENT_INSTANCE_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
        sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
        RECOVERED_TOKEN="$CURRENT_INSTANCE_TOKEN"
    else
        # ConfigMap exists but token is missing - check if pod exists
        if kubectl get deployment easy-kanban -n "${NAMESPACE}" &>/dev/null; then
            echo "   🔍 Attempting to recover INSTANCE_TOKEN from running pod..."
            POD_NAME=$(kubectl get pods -n "${NAMESPACE}" -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
            if [ -n "$POD_NAME" ]; then
                POD_TOKEN=$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- printenv INSTANCE_TOKEN 2>/dev/null || echo "")
                if [ -n "$POD_TOKEN" ] && [ "$POD_TOKEN" != "" ]; then
                    echo "   ✅ Recovered INSTANCE_TOKEN from pod environment: ${POD_TOKEN:0:20}..."
                    ESCAPED_TOKEN=$(echo "$POD_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
                    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                    RECOVERED_TOKEN="$POD_TOKEN"
                else
                    echo "   ⚠️  Could not recover token - generating new one"
                    GENERATED_TOKEN=$(generate_instance_token)
                    ESCAPED_TOKEN=$(echo "$GENERATED_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
                    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                    RECOVERED_TOKEN="$GENERATED_TOKEN"
                fi
            else
                echo "   ⚠️  No running pod found - generating new token"
                GENERATED_TOKEN=$(generate_instance_token)
                ESCAPED_TOKEN=$(echo "$GENERATED_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
                sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
                RECOVERED_TOKEN="$GENERATED_TOKEN"
            fi
        else
            echo "   🔑 Generating new INSTANCE_TOKEN (new deployment)"
            GENERATED_TOKEN=$(generate_instance_token)
            ESCAPED_TOKEN=$(echo "$GENERATED_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
            sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
            RECOVERED_TOKEN="$GENERATED_TOKEN"
        fi
    fi
    
    if [ -z "$CURRENT_STARTUP_TENANT" ]; then
        echo "   📝 Setting STARTUP_TENANT_ID to '${TENANT_ID}' (first tenant)"
        kubectl apply -f "${TEMP_DIR}/configmap.yaml"
        CONFIGMAP_UPDATED=true
    else
        echo "   ℹ️  STARTUP_TENANT_ID already set to '${CURRENT_STARTUP_TENANT}' (preserving to avoid pod restart)"
        if [ -n "$CURRENT_STARTUP_TENANT" ]; then
            sed -i "s/STARTUP_TENANT_ID: \"${TENANT_ID}\"/STARTUP_TENANT_ID: \"${CURRENT_STARTUP_TENANT}\"/g" "${TEMP_DIR}/configmap.yaml"
        fi
        kubectl apply -f "${TEMP_DIR}/configmap.yaml"
        CONFIGMAP_UPDATED=false
    fi
else
    echo "   ⚙️  Creating shared ConfigMap..."
    GENERATED_TOKEN=$(generate_instance_token)
    ESCAPED_TOKEN=$(echo "$GENERATED_TOKEN" | sed 's/[[\.*^$()+?{|]/\\&/g')
    sed -i "s/INSTANCE_TOKEN_PLACEHOLDER/${ESCAPED_TOKEN}/g" "${TEMP_DIR}/configmap.yaml"
    RECOVERED_TOKEN="$GENERATED_TOKEN"
    kubectl apply -f "${TEMP_DIR}/configmap.yaml"
    CONFIGMAP_UPDATED=false
fi
echo "   ✅ ConfigMap ready"

# Get actual token from ConfigMap
ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP=$(kubectl get configmap easy-kanban-config-pg -n "${NAMESPACE}" -o jsonpath='{.data.INSTANCE_TOKEN}' 2>/dev/null || echo "")
if [ -n "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" ] && [ "$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP" != "" ]; then
    ACTUAL_INSTANCE_TOKEN="$ACTUAL_INSTANCE_TOKEN_FROM_CONFIGMAP"
elif [ -n "$RECOVERED_TOKEN" ] && [ "$RECOVERED_TOKEN" != "" ]; then
    ACTUAL_INSTANCE_TOKEN="$RECOVERED_TOKEN"
else
    ACTUAL_INSTANCE_TOKEN=$(generate_instance_token)
fi

# Check storage (NFS for attachments/avatars)
echo ""
echo "📦 Step 2/7: Checking storage..."
echo "   📦 Using shared NFS storage for attachments and avatars"
PVC_ATTACHMENTS_EXISTS=$(kubectl get pvc easy-kanban-shared-pvc-attachments -n easy-kanban &>/dev/null && echo "yes" || echo "no")
PVC_AVATARS_EXISTS=$(kubectl get pvc easy-kanban-shared-pvc-avatars -n easy-kanban &>/dev/null && echo "yes" || echo "no")

if [ "$PVC_ATTACHMENTS_EXISTS" = "yes" ] && [ "$PVC_AVATARS_EXISTS" = "yes" ]; then
    echo "   ✅ All shared PVCs exist"
else
    echo "   ⚠️  Warning: Some shared PVCs not found:"
    [ "$PVC_ATTACHMENTS_EXISTS" = "no" ] && echo "      - easy-kanban-shared-pvc-attachments missing"
    [ "$PVC_AVATARS_EXISTS" = "no" ] && echo "      - easy-kanban-shared-pvc-avatars missing"
fi

# Deploy shared application (only if not already deployed)
echo ""
echo "📦 Step 3/7: Deploying application..."
if kubectl get deployment easy-kanban -n "${NAMESPACE}" &>/dev/null; then
    echo "   🎯 Application already deployed (shared for all tenants)"
    if [ "$CONFIGMAP_UPDATED" = "true" ]; then
        echo "   🔄 ConfigMap updated with STARTUP_TENANT_ID='${TENANT_ID}', restarting pods..."
        kubectl rollout restart deployment/easy-kanban -n "${NAMESPACE}"
        kubectl rollout status deployment/easy-kanban -n "${NAMESPACE}" --timeout=120s || echo "   ⚠️  Rollout may still be in progress"
    else
        echo "   ℹ️  No pod restart needed - tenant schema will be created on first request"
    fi
else
    echo "   🎯 Deploying shared Easy Kanban application (for all tenants)..."
    kubectl apply -f "${TEMP_DIR}/app-deployment.yaml"
    echo "   ✅ Deployment manifest applied"
    echo "   ⏳ Waiting for application to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/easy-kanban -n "${NAMESPACE}" || {
        echo "   ⚠️  Application may still be starting"
    }
fi

# Apply shared services (only if not already deployed)
echo ""
echo "📦 Step 4/7: Applying services..."
if kubectl get service easy-kanban-service -n "${NAMESPACE}" &>/dev/null; then
    echo "   🔗 Shared services already exist, skipping..."
else
    echo "   🔗 Creating shared services..."
    kubectl apply -f "${TEMP_DIR}/service.yaml"
    echo "   ✅ Services created"
fi

# Apply ingress rule for this tenant
echo ""
echo "📦 Step 5/7: Applying ingress..."
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

# Apply WebSocket ingress rule (shared ingress with sticky sessions for all tenants)
echo ""
echo "📦 Step 5b/6: Applying WebSocket ingress..."
WEBSOCKET_INGRESS_NAME="easy-kanban-websocket-ingress-pg"
if kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" &>/dev/null; then
    echo "   🔌 WebSocket ingress already exists, checking if hostname needs to be added..."
    EXISTING_HOST=$(kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" -o jsonpath="{.spec.rules[?(@.host=='${FULL_HOSTNAME}')].host}" 2>/dev/null || echo "")
    if [ -n "$EXISTING_HOST" ]; then
        echo "   ✅ Hostname '${FULL_HOSTNAME}' already exists in WebSocket ingress"
    else
        echo "   ➕ Adding hostname '${FULL_HOSTNAME}' to WebSocket ingress..."
        if ! command -v jq &> /dev/null; then
            echo "   ⚠️  Warning: jq is not installed. Cannot automatically add hostname to WebSocket ingress."
            echo "   💡 Please manually add '${FULL_HOSTNAME}' to the WebSocket ingress rules and TLS hosts"
        else
            CURRENT_INGRESS_JSON=$(kubectl get ingress "${WEBSOCKET_INGRESS_NAME}" -n "${NAMESPACE}" -o json)
            UPDATED_INGRESS=$(echo "$CURRENT_INGRESS_JSON" | jq --arg hostname "$FULL_HOSTNAME" '
                .spec.rules += [{
                    "host": $hostname,
                    "http": {
                        "paths": [{
                            "path": "/socket.io/",
                            "pathType": "Prefix",
                            "backend": {
                                "service": {
                                    "name": "easy-kanban-service",
                                    "port": {
                                        "number": 80
                                    }
                                }
                            }
                        }]
                    }
                }] |
                if .spec.tls and (.spec.tls | length > 0) then
                    .spec.tls[0].hosts += [$hostname]
                else
                    .
                end
            ')
            echo "$UPDATED_INGRESS" | kubectl apply -f -
            echo "   ✅ WebSocket ingress updated with hostname '${FULL_HOSTNAME}'"
        fi
    fi
else
    echo "   🔌 Creating WebSocket ingress with hostname '${FULL_HOSTNAME}'..."
    cat > "${TEMP_DIR}/ingress-websocket.yaml" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${WEBSOCKET_INGRESS_NAME}
  namespace: ${NAMESPACE}
  labels:
    app: easy-kanban
    component: websocket
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/affinity-mode: "persistent"
    nginx.ingress.kubernetes.io/session-cookie-name: "socket-io-route"
    nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
    nginx.ingress.kubernetes.io/session-cookie-path: "/"
    nginx.ingress.kubernetes.io/session-cookie-samesite: "Lax"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/use-forwarded-headers: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: ${FULL_HOSTNAME}
    http:
      paths:
      - path: /socket.io/
        pathType: Prefix
        backend:
          service:
            name: easy-kanban-service
            port:
              number: 80
  tls:
  - hosts:
    - ${FULL_HOSTNAME}
    secretName: easy-kanban-tls
EOF
    kubectl apply -f "${TEMP_DIR}/ingress-websocket.yaml"
    echo "   ✅ WebSocket ingress created"
fi

# Initialize tenant schema in PostgreSQL by making a request to the app
echo ""
echo "📦 Step 7/7: Initializing tenant schema..."
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
done

if [ "$POD_READY" = "true" ] && [ -n "$POD_NAME" ]; then
    echo "   ✅ Pod is ready"
    echo "   🔄 Triggering schema initialization for tenant '${TENANT_ID}'..."
    
    SERVICE_URL="http://easy-kanban-service.${NAMESPACE}.svc.cluster.local"
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
        echo "   ✅ Tenant schema initialized successfully"
    else
        echo "   ⚠️  Could not verify schema initialization (will be created on first request)"
    fi
else
    echo "   ⚠️  Pod not ready after ${MAX_WAIT}s, schema will be created on first request"
fi

# Get the external IP and NodePort information
EXTERNAL_IP=""
NODEPORT=""
INGRESS_IP=$(kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

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

echo ""
echo "✅ Deployment completed successfully!"

# Clean up temporary files
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
echo "STORAGE_DATA_PATH=postgresql://postgres:5432/easykanban (schema: ${INSTANCE_NAME})"
echo "STORAGE_ATTACHMENTS_PATH=/data/nfs-server/attachments/tenants/${INSTANCE_NAME}"
echo "STORAGE_AVATARS_PATH=/data/nfs-server/avatars/tenants/${INSTANCE_NAME}"
