# Real-Time Update Flow Explanation

> **Multi-tenant PostgreSQL on Kubernetes** (multiple pods, Redis Socket.IO adapter, NOTIFY fan-out): see [`REALTIME_UPDATE_FLOW-MULTI-TENANCY.md`](./REALTIME_UPDATE_FLOW-MULTI-TENANCY.md).

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
// Always PostgreSQL LISTEN/NOTIFY (Redis is only for the Socket.IO adapter)
async publish(channel, data, tenantId = null) {
  // Adds _rtId (and _notifyTenantId in multi-tenant) then:
  return await postgresNotificationService.publish(channel, payload, tenantId);
}
```

**App events always use PostgreSQL LISTEN/NOTIFY.** Redis is not used as a notification bus.

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

## Summary: **PostgreSQL LISTEN/NOTIFY** ✅

**Answer to your question:** The real-time update was provided by **PostgreSQL LISTEN/NOTIFY**, not Redis pub/sub.

### Why PostgreSQL?
The stack is PostgreSQL-only for app data and app event fan-out:
1. **PostgreSQL `pg_notify()`** to publish notifications
2. **PostgreSQL `LISTEN`** to subscribe to notifications
3. **WebSocket service** to forward notifications to connected clients
4. **Redis Socket.IO adapter** (when multi-pod) so room emits reach clients on other pods

### Benefits of PostgreSQL LISTEN/NOTIFY:
- ✅ **Transactional**: Notifications only fire after database commit
- ✅ **Ordered**: PostgreSQL guarantees message order on a connection
- ✅ **No Redis pub/sub dependency** for app events (Redis still used for Socket.IO adapter)
- ✅ **Schema-based Isolation**: Multi-tenant isolation at the database level
- ✅ **Low Latency**: Direct database-to-application communication

### Redis role today:
- Socket.IO adapter across pods (required when `MULTI_TENANT=true` / multi-replica)
- **Not** the application notification bus

---

## Visual Flow Diagram

```
Admin Updates Display Name
         ↓
PUT /api/admin/users/:userId/member-name
         ↓
notificationService.publish('member-updated', data)
         ↓
postgresNotificationService.publish()
         ↓
PostgreSQL pg_notify('member-updated', payload)
         ↓
PostgreSQL LISTEN connection receives notification
         ↓
websocketService.setupPostgresSubscriptions() callback
         ↓
Socket.IO broadcast: io.emit / io.to('tenant-…').emit
         ↓
(Redis adapter fans rooms across pods when multi-replica)
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

- **Route Handler**: `server/routes/adminUsers.js`
- **Notification Service**: `server/services/notificationService.js`
- **PostgreSQL Publisher**: `server/services/postgresNotificationService.js`
- **WebSocket Subscription**: `server/services/websocketService.js`
- **Frontend Handler**: `src/hooks/useMemberWebSocket.ts`

---

## Testing

To verify NOTIFY is in use, check server logs for PostgreSQL subscription / publish lines (not “Publishing … to Redis” for app events).
