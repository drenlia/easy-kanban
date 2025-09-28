#!/bin/bash

# Docker Security Script for Easy Kanban
# Protects against supply chain attacks like Shai-Hulud worm

echo "🐳 Running Docker security checks..."

# Check if container is running
if ! docker compose ps | grep -q "kanban-app.*Up"; then
    echo "❌ Container is not running. Start it with: docker compose up -d"
    exit 1
fi

echo "✅ Container is running"

# Run security checks inside container
echo "🔒 Running security scan inside container..."
docker compose exec kanban-app npm run security:offline

# Check container health
echo "🏥 Checking container health..."
docker compose exec kanban-app ps aux | grep -E "(node|npm)" || echo "⚠️ No Node.js processes found"

# Check for suspicious network activity
echo "🌐 Checking for suspicious network activity..."
docker compose exec kanban-app netstat -tuln | grep -E "(LISTEN|ESTABLISHED)" || echo "✅ No suspicious network activity"

# Check file system integrity
echo "📁 Checking file system integrity..."
docker compose exec kanban-app find /app -name "*.js" -newer /app/package-lock.json 2>/dev/null | head -10 || echo "✅ No unexpected new files"

# Check for unexpected processes
echo "🔍 Checking for unexpected processes..."
docker compose exec kanban-app ps aux | grep -v -E "(node|npm|sh|ps|grep)" | grep -v "PID" || echo "✅ No unexpected processes"

echo "🎉 Docker security check complete!"
echo ""
echo "📋 Docker Security Recommendations:"
echo "1. Run this script regularly: ./scripts/docker-security.sh"
echo "2. Never run npm install without --frozen-lockfile"
echo "3. Monitor container logs: docker compose logs kanban-app"
echo "4. Keep container images updated"
echo "5. Use read-only containers in production"
