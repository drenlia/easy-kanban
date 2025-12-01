# Socket.IO Multi-Tenant Connection Routing

## Overview

In multi-tenant mode, each tenant connects to `/socket.io` through their tenant-specific domain (e.g., `test1.ezkan.cloud/socket.io`). The system routes and isolates connections per tenant using hostname-based tenant identification and tenant-prefixed Socket.IO rooms.

## Connection Flow

### 1. **Client Connection Request**

When a user from tenant `test1` opens the application:
- Frontend connects to: `https://test1.ezkan.cloud/socket.io`
- The Socket.IO client sends the connection request with:
  - **Host header**: `test1.ezkan.cloud` (preserved by nginx ingress)
  - **JWT token**: In `auth.token` (from user's login session)

### 2. **Ingress Routing**

The Kubernetes ingress (`ingress-websocket.yaml`) routes `/socket.io/` requests:
- **Path matching**: All requests to `/socket.io/` are routed to `easy-kanban-service`
- **Host header preservation**: The original hostname (`test1.ezkan.cloud`) is preserved via:
  ```yaml
  nginx.ingress.kubernetes.io/use-forwarded-headers: "true"
  ```
- **Sticky sessions**: Cookie-based affinity ensures all Socket.IO requests from the same client go to the same pod:
  ```yaml
  nginx.ingress.kubernetes.io/affinity: "cookie"
  nginx.ingress.kubernetes.io/affinity-mode: "persistent"
  ```

### 3. **Server-Side Connection Handling**

#### Step 3.1: Request Validation (`allowRequest` hook)
```javascript
// server/services/websocketService.js:39-47
allowRequest: (req, callback) => {
  if (process.env.MULTI_TENANT === 'true') {
    const hostname = req.headers.host || req.headers['x-forwarded-host'] || '';
    const tenantId = extractTenantId(hostname); // Extracts "test1" from "test1.ezkan.cloud"
    console.log(`🔍 Socket.IO request - Host: ${hostname}, Tenant: ${tenantId || 'none'}`);
  }
  callback(null, true); // Allow all requests (authentication happens in middleware)
}
```

#### Step 3.2: Authentication Middleware (`io.use`)
```javascript
// server/services/websocketService.js:97-148
this.io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  // 1. Verify JWT token
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // 2. Extract tenant ID from hostname
  const hostname = socket.handshake.headers.host || socket.handshake.headers['x-forwarded-host'] || '';
  const tenantId = extractTenantId(hostname); // "test1" from "test1.ezkan.cloud"
  
  // 3. In multi-tenant mode, verify user exists in tenant's database
  if (process.env.MULTI_TENANT === 'true' && tenantId) {
    const dbInfo = await getTenantDatabase(tenantId);
    const userInDb = await wrapQuery(dbInfo.db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(decoded.id);
    if (!userInDb) {
      return next(new Error('Invalid token for this tenant'));
    }
  }
  
  // 4. Attach tenant context to socket
  socket.userId = decoded.id;
  socket.userEmail = decoded.email;
  socket.tenantId = tenantId; // "test1" - used for room isolation
  
  next();
});
```

**Key Points:**
- Tenant ID is extracted from the **Host header** (preserved by ingress)
- User is verified to exist in the **tenant's specific database**
- `socket.tenantId` is attached to the socket for all subsequent operations

#### Step 3.3: Connection Established (`io.on('connection')`)
```javascript
// server/services/websocketService.js:158-177
this.io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id} (${socket.userEmail})`);
  console.log(`   📍 Tenant context: ${socket.tenantId}`); // "test1"
  
  // Track connection with tenant context
  this.connectedClients.set(socket.id, { 
    socketId: socket.id, 
    userId: socket.userId,
    userEmail: socket.userEmail,
    tenantId: socket.tenantId // "test1"
  });
  
  // Join tenant-wide namespace for tenant-specific broadcasts
  if (socket.tenantId) {
    socket.join(`tenant-${socket.tenantId}`); // Joins "tenant-test1"
  }
});
```

### 4. **Tenant Isolation via Rooms**

#### 4.1 Tenant-Wide Rooms
When a socket connects, it automatically joins:
- **Room**: `tenant-{tenantId}` (e.g., `tenant-test1`)
- **Purpose**: Broadcast tenant-wide events (user updates, settings changes, etc.)

#### 4.2 Board-Specific Rooms
When a user joins a board:
```javascript
// server/services/websocketService.js:180-207
socket.on('join-board', (boardId) => {
  // Use tenant-prefixed room in multi-tenant mode
  const room = socket.tenantId 
    ? `tenant-${socket.tenantId}-board-${boardId}`  // "tenant-test1-board-123"
    : `board-${boardId}`;                            // "board-123" (single-tenant)
  
  socket.join(room);
});
```

**Example:**
- Tenant `test1`, board `123` → Room: `tenant-test1-board-123`
- Tenant `test2`, board `123` → Room: `tenant-test2-board-123`
- **Isolation**: Even with the same board ID, tenants are isolated

### 5. **Event Broadcasting with Tenant Isolation**

All Redis pub/sub events are broadcast to tenant-specific rooms:

```javascript
// server/services/websocketService.js:268-278
redisService.subscribeToAllTenants('task-updated', (data, tenantId) => {
  if (tenantId) {
    // Multi-tenant: broadcast only to clients of this tenant
    this.io?.to(`tenant-${tenantId}`).emit('task-updated', data);
  } else {
    // Single-tenant: broadcast to all clients
    this.io?.emit('task-updated', data);
  }
});
```

**Board-specific events:**
```javascript
// server/services/websocketService.js:306-312
redisService.subscribeToAllTenants('task-relationship-created', (data, tenantId) => {
  const room = tenantId 
    ? `tenant-${tenantId}-board-${data.boardId}`  // "tenant-test1-board-123"
    : `board-${data.boardId}`;                      // "board-123"
  this.io?.to(room).emit('task-relationship-created', data);
});
```

## Connection Tracking

### In-Memory Tracking
```javascript
// server/services/websocketService.js:166-172
this.connectedClients.set(socket.id, { 
  socketId: socket.id, 
  userId: socket.userId,
  userEmail: socket.userEmail,
  tenantId: socket.tenantId  // "test1" - used for filtering/querying
});
```

### Redis Adapter (Multi-Pod Support)
- **Purpose**: Share Socket.IO sessions across multiple pods
- **Why needed**: Load balancing can route Socket.IO requests to different pods
- **Implementation**: Uses `@socket.io/redis-adapter` to store sessions in Redis
- **Key**: Sessions stored with prefix `socket.io#/#` in Redis

## Tenant ID Extraction

The tenant ID is extracted using the same logic as HTTP requests:

```javascript
// server/middleware/tenantRouting.js:28-57
const extractTenantId = (hostname) => {
  if (!hostname) return null;
  
  // Skip if not in multi-tenant mode
  if (!isMultiTenant()) {
    return null;
  }
  
  // Extract subdomain (tenant ID) from hostname
  const hostnameWithoutPort = hostname.split(':')[0];
  const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
  
  // Check if hostname matches tenant pattern: {tenantId}.{domain}
  if (hostnameWithoutPort.endsWith(`.${domain}`)) {
    const parts = hostnameWithoutPort.split('.');
    if (parts.length >= 2) {
      const tenantId = parts[0]; // "test1" from "test1.ezkan.cloud"
      if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(tenantId)) {
        return tenantId;
      }
    }
  }
  
  return null;
};
```

## Example Flow: Tenant `test1` User Connects

1. **Client**: `https://test1.ezkan.cloud` → Frontend connects to `/socket.io`
2. **Ingress**: Routes to `easy-kanban-service` with `Host: test1.ezkan.cloud`
3. **Socket.IO**: 
   - Extracts `tenantId = "test1"` from hostname
   - Verifies JWT token
   - Verifies user exists in `test1`'s database
   - Attaches `socket.tenantId = "test1"`
4. **Connection**: Socket joins `tenant-test1` room
5. **Board Join**: User joins board `123` → Socket joins `tenant-test1-board-123`
6. **Events**: All broadcasts use `tenant-test1` or `tenant-test1-board-123` rooms

## Key Isolation Mechanisms

1. **Hostname-based routing**: Each tenant uses a unique subdomain
2. **Database verification**: User must exist in tenant's database
3. **Tenant-prefixed rooms**: All rooms include tenant ID
4. **Redis pub/sub filtering**: Events include `tenantId` and broadcast to tenant-specific rooms
5. **Connection tracking**: `connectedClients` Map includes `tenantId` for filtering

## Multi-Pod Considerations

- **Redis Adapter**: Required for multi-pod deployments to share Socket.IO sessions
- **Sticky Sessions**: Ingress uses cookie-based affinity to route all Socket.IO requests from the same client to the same pod
- **Room Broadcasting**: Redis adapter ensures broadcasts work across all pods

## Summary

Each tenant's Socket.IO connections are isolated through:
1. **Hostname extraction** → Tenant ID (`test1` from `test1.ezkan.cloud`)
2. **Database verification** → User must exist in tenant's database
3. **Tenant-prefixed rooms** → `tenant-{tenantId}` and `tenant-{tenantId}-board-{boardId}`
4. **Event filtering** → All broadcasts target tenant-specific rooms
5. **Connection tracking** → `connectedClients` includes `tenantId` for each socket

This ensures complete isolation: tenant `test1` users never receive events from tenant `test2`, even if they're connected to the same Socket.IO server instance.


