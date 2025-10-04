#!/bin/bash

# Easy Kanban Storage Setup Script
# Creates the base storage directory for multi-tenant deployments

set -e

echo "📁 Setting up Easy Kanban storage directory..."

# Create the base storage directory
sudo mkdir -p /data/easy-kanban-pv
sudo chmod 755 /data/easy-kanban-pv

echo "✅ Storage directory created: /data/easy-kanban-pv"
echo ""
echo "📋 Storage Structure:"
echo "   Base directory: /data/easy-kanban-pv/"
echo "   Per-instance directories will be created automatically:"
echo "     - /data/easy-kanban-pv/easy-kanban-{instance}-data"
echo "     - /data/easy-kanban-pv/easy-kanban-{instance}-attachments"
echo "     - /data/easy-kanban-pv/easy-kanban-{instance}-avatars"
echo ""
echo "🚀 Ready for deployments! Run:"
echo "   ./deploy-instance.sh my-company token-12345 basic"
