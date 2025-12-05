# Testing PostgreSQL LISTEN/NOTIFY

This guide shows you how to test the PostgreSQL notification service.

## Method 1: Check Service Status

Check if the notification service is connected:

```bash
curl http://localhost:3222/api/test/notifications/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "service": "PostgreSQL LISTEN/NOTIFY",
  "connected": true,
  "dbType": "postgresql",
  "postgresHost": "postgres",
  "postgresPort": "5432",
  "postgresDb": "kanban"
}
```

## Method 2: Publish a Test Notification

Publish a test notification that will be received by WebSocket clients:

```bash
curl -X POST http://localhost:3222/api/test/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "test-channel",
    "message": "Hello from PostgreSQL!"
  }'
```

If you have a WebSocket client connected, you should see the notification appear in real-time.

## Method 3: Using the Test Script

Use the provided test script:

```bash
# First, get your JWT token (from browser localStorage or login API)
export JWT_TOKEN=your_token_here

# Run the test script
./scripts/test-postgres-notify.sh
```

## Method 4: Direct PostgreSQL Test

Test LISTEN/NOTIFY directly from PostgreSQL:

### Terminal 1: Listen for notifications
```bash
docker exec -it easy-kanban-postgres psql -U kanban_user -d kanban

# In psql:
LISTEN test_channel;
```

### Terminal 2: Send a notification
```bash
docker exec -it easy-kanban-postgres psql -U kanban_user -d kanban

# In psql:
SELECT pg_notify('test_channel', '{"message": "Hello from psql!"}');
```

You should see the notification appear in Terminal 1.

## Method 5: Test Real Task Updates

The best way to test is to actually update a task and watch for WebSocket events:

1. Open your browser's developer console
2. Watch the Network tab for WebSocket messages
3. Update a task (change title, move it, etc.)
4. You should see `task-updated` events in the WebSocket messages

## Verifying It's Working

### Check Server Logs

Look for these log messages when the server starts:

```
✅ PostgreSQL Notification Service connected
📡 Subscribed to PostgreSQL channel: task-updated
📡 Subscribed to PostgreSQL channel: task-created
...
```

### Check Health Endpoint

```bash
curl http://localhost:3222/health
```

Should show:
```json
{
  "status": "healthy",
  "dbType": "postgresql",
  "postgresNotifications": true,
  ...
}
```

## Troubleshooting

### Service Not Connected

If `postgresNotifications: false`:
- Check PostgreSQL is running: `docker ps | grep postgres`
- Check connection settings in `docker-compose.yml`
- Check server logs for connection errors

### Notifications Not Received

1. Verify the service is connected (check status endpoint)
2. Check WebSocket is connected (check browser console)
3. Verify you're subscribed to the correct channel
4. Check server logs for notification errors

### Testing in Multi-Tenant Mode

In multi-tenant mode, channels are prefixed with tenant ID:
- Channel: `tenant-{tenantId}-task-updated`
- Make sure to include tenant ID when testing

