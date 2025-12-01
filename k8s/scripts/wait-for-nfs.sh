#!/bin/sh
# Wait for NFS server to be accessible
# Usage: wait-for-nfs.sh <nfs-service> <namespace> [timeout]

NFS_SERVICE=${1:-nfs-server}
NAMESPACE=${2:-easy-kanban}
TIMEOUT=${3:-300}
INTERVAL=5
ELAPSED=0

echo "⏳ Waiting for NFS server ${NFS_SERVICE}.${NAMESPACE} (timeout: ${TIMEOUT}s)..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Try to connect to NFS port (2049)
  if nc -z "${NFS_SERVICE}.${NAMESPACE}.svc.cluster.local" 2049 2>/dev/null; then
    # Also verify we can see exports
    if showmount -e "${NFS_SERVICE}.${NAMESPACE}.svc.cluster.local" 2>/dev/null | grep -q "/exports"; then
      echo "✅ NFS server ${NFS_SERVICE} is ready and exports are available!"
      exit 0
    fi
  fi
  
  # Try via IP if DNS doesn't work yet
  SERVICE_IP=$(getent hosts "${NFS_SERVICE}.${NAMESPACE}.svc.cluster.local" 2>/dev/null | awk '{print $1}')
  if [ -n "$SERVICE_IP" ]; then
    if nc -z "$SERVICE_IP" 2049 2>/dev/null; then
      if showmount -e "$SERVICE_IP" 2>/dev/null | grep -q "/exports"; then
        echo "✅ NFS server ${NFS_SERVICE} is ready (via IP ${SERVICE_IP})!"
        exit 0
      fi
    fi
  fi
  
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "   Still waiting... (${ELAPSED}s/${TIMEOUT}s)"
done

echo "❌ Timeout waiting for NFS server ${NFS_SERVICE} after ${TIMEOUT}s"
exit 1

