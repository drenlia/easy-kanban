# Real-Time Update Flow Explanation

## How Display Name Updates Reach Other Users

When you update a user's display name in the admin panel, here's the complete flow of how another logged-in user receives the update in real-time:

---

## Step-by-Step Flow

### 1. **Admin Updates Display Name** (Frontend)
- Admin user changes display name in the UI
- Frontend sends `PUT /api/admin/users/:userId/member-name` request

### 2. **Backend Route Handler** (`server/routes/adminUsers.js`)
```javascript
// Line 73-137: PUT /:userId/member-name
router.put('/:userId/member-name', ...)
```

**What happens:**
- Updates the `members` table in PostgreSQL
- Publishes notification via unified notification service:
```javascript
await notificationService.publish('member-updated', {
  memberId: member.id,
  member: { id: member.id, name: trimmedDisplayName, color: member.color },
  timestamp: new Date().toISOString()
}, getTenantId(req));
```

### 3. **Unified Notification Service** (`server/services/notificationService.js`)
```javascript
// Automatically routes to PostgreSQL or Redis based on DB_TYPE
async publish(channel, data, tenantId = null) {
  const usePostgres = process.env.DB_TYPE === 'postgresql';
  
  if (usePostgres) {
    // ✅ YOU ARE USING THIS PATH
    return await postgresNotificationService.publish(channel, data, tenantId);
  } else {
    // Fall back to Redis pub/sub
    return await redisService.publish(channel, data, tenantId);
  }
}
```

**Since `DB_TYPE=postgresql`**, it uses **PostgreSQL LISTEN/NOTIFY**.

### 4. **PostgreSQL NOTIFY** (`server/services/postgresNotificationService.js`)
```javascript
async publish(channel, data, tenantId = null) {
  // Uses PostgreSQL's native pg_notify() function
  const fullChannel = tenantId ? `tenant-${tenantId}-${channel}` : channel;
  const payload = JSON.stringify({ data, tenantId, timestamp: new Date().toISOString() });
  
  // Execute: SELECT pg_notify('member-updated', '{"data": {...}, "tenantId": ...}')
  await client.query('SELECT pg_notify($1, $2)', [fullChannel, payload]);
}
```

**What happens:**
- PostgreSQL executes `pg_notify('member-updated', payload)`
- This sends a notification to all connections that are `LISTEN`ing to that channel
- The notification is **transactional** (only fires after commit)
- The notification is **ordered** (PostgreSQL guarantees message order)

### 5. **WebSocket Service Subscription** (`server/services/websocketService.js`)
```javascript
// Line 402-408: Subscribes to PostgreSQL notifications
setupPostgresSubscriptions() {
  postgresNotificationService.subscribeToAllTenants('member-updated', (data, tenantId) => {
    if (tenantId) {
      // Multi-tenant: broadcast only to clients of this tenant
      this.io?.to(`tenant-${tenantId}`).emit('member-updated', data);
    } else {
      // Single-tenant: broadcast to all clients
      this.io?.emit('member-updated', data);
    }
  });
}
```

**What happens:**
- The WebSocket service has a **dedicated PostgreSQL connection** that is `LISTEN`ing to all notification channels
- When PostgreSQL sends the `NOTIFY`, the listener receives it
- The callback function is executed
- The WebSocket service broadcasts the event to all connected Socket.IO clients

### 6. **Socket.IO Broadcast** (WebSocket)
```javascript
this.io?.emit('member-updated', data);
```

**What happens:**
- Socket.IO broadcasts the `member-updated` event to all connected clients
- In multi-tenant mode, it only broadcasts to clients in the same tenant room
- The event includes the updated member data

### 7. **Frontend WebSocket Client** (`src/services/websocketClient.ts`)
```javascript
// Line 403: Listens for member-updated events
onMemberUpdated(callback: (data: any) => void) {
  this.addEventListener('member-updated', callback);
}
```

**What happens:**
- The frontend WebSocket client receives the `member-updated` event
- It triggers the registered callback

### 8. **React Hook Handler** (`src/hooks/useMemberWebSocket.ts`)
```javascript
// Line 40-67: Handles member-updated events
const handleMemberUpdated = useCallback(async (data: any) => {
  if (data.member) {
    setMembers(prevMembers => {
      // Update the specific member in the members list
      const memberExists = prevMembers.some(member => member.id === data.member.id);
      
      if (memberExists) {
        // Update existing member
        return prevMembers.map(member => 
          member.id === data.member.id ? { ...member, ...data.member } : member
        );
      } else {
        // Member doesn't exist, add it to the list
        return [...prevMembers, data.member];
      }
    });
  }
}, [setMembers]);
```

**What happens:**
- Updates the React state with the new member data
- The UI automatically re-renders with the updated display name

### 9. **UI Update** (React)
- React detects the state change
- Components that display the member's name automatically update
- The other logged-in user sees the new display name immediately

---

## Summary: **PostgreSQL PUB/SUB** ✅

**Answer to your question:** The real-time update was provided by **PostgreSQL LISTEN/NOTIFY**, not Redis.

### Why PostgreSQL?
Since you have `DB_TYPE=postgresql` set in your environment, the system uses:
1. **PostgreSQL `pg_notify()`** to publish notifications
2. **PostgreSQL `LISTEN`** to subscribe to notifications
3. **WebSocket service** to forward notifications to connected clients

### Benefits of PostgreSQL LISTEN/NOTIFY:
- ✅ **Transactional**: Notifications only fire after database commit
- ✅ **Ordered**: PostgreSQL guarantees message order
- ✅ **No External Dependency**: No need for Redis (though Redis is still available for other uses)
- ✅ **Schema-based Isolation**: Multi-tenant isolation at the database level
- ✅ **Low Latency**: Direct database-to-application communication

### Redis is Still Available:
- Redis is still running in your Docker setup
- It's used for other purposes (caching, session storage, etc.)
- But for pub/sub notifications, PostgreSQL is being used

---

## Visual Flow Diagram

```
Admin Updates Display Name
         ↓
PUT /api/admin/users/:userId/member-name
         ↓
notificationService.publish('member-updated', data)
         ↓
postgresNotificationService.publish()  [DB_TYPE=postgresql]
         ↓
PostgreSQL pg_notify('member-updated', payload)
         ↓
PostgreSQL LISTEN connection receives notification
         ↓
websocketService.setupPostgresSubscriptions() callback
         ↓
Socket.IO broadcast: io.emit('member-updated', data)
         ↓
Frontend WebSocket client receives event
         ↓
useMemberWebSocket.handleMemberUpdated()
         ↓
React state update: setMembers(...)
         ↓
UI re-renders with new display name
         ↓
Other user sees updated display name ✨
```

---

## Code Locations

- **Route Handler**: `server/routes/adminUsers.js:73-137`
- **Notification Service**: `server/services/notificationService.js:23-33`
- **PostgreSQL Publisher**: `server/services/postgresNotificationService.js:100-150`
- **WebSocket Subscription**: `server/services/websocketService.js:402-408`
- **Frontend Handler**: `src/hooks/useMemberWebSocket.ts:40-67`

---

## Testing

To verify which system is being used, check your server logs:
- Look for: `📤 Publishing member-updated to Redis` (old, if using Redis)
- Look for: `📡 Subscribed to PostgreSQL channel: member-updated` (current, using PostgreSQL)

Or check your environment:
```bash
echo $DB_TYPE
# Should output: postgresql
```

