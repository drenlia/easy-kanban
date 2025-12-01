#!/bin/sh
# Wait for a service to be ready
# Usage: wait-for-service.sh <service-name> <namespace> <port> [timeout]

SERVICE_NAME=${1}
NAMESPACE=${2:-default}
PORT=${3:-80}
TIMEOUT=${4:-300}
INTERVAL=5
ELAPSED=0

echo "⏳ Waiting for service ${SERVICE_NAME}.${NAMESPACE} on port ${PORT} (timeout: ${TIMEOUT}s)..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Try to connect to the service
  if nc -z "${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local" "${PORT}" 2>/dev/null; then
    echo "✅ Service ${SERVICE_NAME} is ready!"
    exit 0
  fi
  
  # Also try via IP if DNS doesn't work yet
  SERVICE_IP=$(getent hosts "${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local" 2>/dev/null | awk '{print $1}')
  if [ -n "$SERVICE_IP" ] && nc -z "$SERVICE_IP" "${PORT}" 2>/dev/null; then
    echo "✅ Service ${SERVICE_NAME} is ready (via IP ${SERVICE_IP})!"
    exit 0
  fi
  
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "   Still waiting... (${ELAPSED}s/${TIMEOUT}s)"
done

echo "❌ Timeout waiting for service ${SERVICE_NAME} after ${TIMEOUT}s"
exit 1

