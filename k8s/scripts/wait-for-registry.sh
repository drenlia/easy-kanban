#!/bin/sh
# Wait for Docker registry to be accessible
# Usage: wait-for-registry.sh <registry-service> <namespace> [timeout]

REGISTRY_SERVICE=${1:-internal-registry}
NAMESPACE=${2:-kube-system}
TIMEOUT=${3:-300}
INTERVAL=5
ELAPSED=0

echo "⏳ Waiting for registry ${REGISTRY_SERVICE}.${NAMESPACE} (timeout: ${TIMEOUT}s)..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Try to connect to registry port (5000)
  if nc -z "${REGISTRY_SERVICE}.${NAMESPACE}.svc.cluster.local" 5000 2>/dev/null; then
    # Verify registry API is responding
    if wget -q -O- "http://${REGISTRY_SERVICE}.${NAMESPACE}.svc.cluster.local:5000/v2/" 2>/dev/null | grep -q "{}"; then
      echo "✅ Registry ${REGISTRY_SERVICE} is ready!"
      exit 0
    fi
  fi
  
  # Try via IP if DNS doesn't work yet
  SERVICE_IP=$(getent hosts "${REGISTRY_SERVICE}.${NAMESPACE}.svc.cluster.local" 2>/dev/null | awk '{print $1}')
  if [ -n "$SERVICE_IP" ]; then
    if nc -z "$SERVICE_IP" 5000 2>/dev/null; then
      if wget -q -O- "http://${SERVICE_IP}:5000/v2/" 2>/dev/null | grep -q "{}"; then
        echo "✅ Registry ${REGISTRY_SERVICE} is ready (via IP ${SERVICE_IP})!"
        exit 0
      fi
    fi
  fi
  
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "   Still waiting... (${ELAPSED}s/${TIMEOUT}s)"
done

echo "❌ Timeout waiting for registry ${REGISTRY_SERVICE} after ${TIMEOUT}s"
exit 1

