#!/bin/bash

# Configure Kubernetes DNS on worker nodes
# This script configures systemd-resolved to forward Kubernetes service DNS queries

set -e

echo "🔧 Configuring Kubernetes DNS resolution..."
echo ""

# Get Kubernetes DNS IP
KUBE_DNS_IP=$(kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")

if [ -z "$KUBE_DNS_IP" ]; then
    echo "❌ Could not find Kubernetes DNS service"
    exit 1
fi

echo "📋 Kubernetes DNS IP: ${KUBE_DNS_IP}"
echo ""

# Configure systemd-resolved
echo "📝 Configuring systemd-resolved..."
sudo mkdir -p /etc/systemd/resolved.conf.d

sudo bash -c "cat > /etc/systemd/resolved.conf.d/k8s-dns.conf <<EOF
[Resolve]
DNS=${KUBE_DNS_IP}
Domains=~cluster.local ~svc.cluster.local ~default.svc.cluster.local
EOF
"

echo "✅ DNS configuration created"
echo ""

# Restart systemd-resolved
echo "🔄 Restarting systemd-resolved..."
sudo systemctl restart systemd-resolved
sleep 2

# Verify configuration
echo "🔍 Verifying DNS configuration..."
resolvectl status | grep -A 5 "DNS Servers" || true

# Test DNS resolution
echo ""
echo "🧪 Testing DNS resolution..."
if resolvectl query internal-registry.kube-system.svc.cluster.local 2>&1 | grep -q "10\."; then
    echo "✅ DNS resolution working!"
else
    echo "⚠️  DNS resolution test failed, but configuration is set"
fi

echo ""
echo "🎉 DNS configuration complete!"
echo ""
echo "📋 To apply on other nodes, run:"
echo "   ssh <node> 'sudo bash -s' < $0"
echo ""

