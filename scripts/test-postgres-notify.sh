#!/bin/bash

# Test script for PostgreSQL LISTEN/NOTIFY
# 
# Usage:
#   ./scripts/test-postgres-notify.sh [JWT_TOKEN]
#
# If JWT_TOKEN is not provided, you'll need to get one by logging in first.
# You can get a token from the browser's localStorage or by logging in via API.

API_URL="${API_URL:-http://localhost:3222}"
JWT_TOKEN="${1:-}"

if [ -z "$JWT_TOKEN" ]; then
  echo "❌ JWT_TOKEN is required"
  echo ""
  echo "Usage:"
  echo "  ./scripts/test-postgres-notify.sh YOUR_JWT_TOKEN"
  echo ""
  echo "Or set it as an environment variable:"
  echo "  export JWT_TOKEN=your_token_here"
  echo "  ./scripts/test-postgres-notify.sh"
  echo ""
  echo "To get a token, log in via the API:"
  echo "  curl -X POST $API_URL/api/auth/login \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}'"
  exit 1
fi

echo "🧪 Testing PostgreSQL LISTEN/NOTIFY..."
echo ""

# Check notification service status
echo "1️⃣ Checking notification service status..."
STATUS_RESPONSE=$(curl -s -X GET "$API_URL/api/test/notifications/status" \
  -H "Authorization: Bearer $JWT_TOKEN")

echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

# Test publishing a notification
echo "2️⃣ Publishing test notification..."
PUBLISH_RESPONSE=$(curl -s -X POST "$API_URL/api/test/notifications" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "test-channel",
    "message": "Hello from PostgreSQL LISTEN/NOTIFY!"
  }')

echo "$PUBLISH_RESPONSE" | jq '.' 2>/dev/null || echo "$PUBLISH_RESPONSE"
echo ""

echo "✅ Test complete!"
echo ""
echo "If you have a WebSocket client connected, you should see the notification"
echo "appear in real-time. Check your browser console or WebSocket client."

