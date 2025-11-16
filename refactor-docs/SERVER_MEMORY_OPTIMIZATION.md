# Server-Side Memory Optimization Guide

**Focus**: Node.js backend memory in Docker/K8s pods only (not browser/client)

## 🚀 Quick Wins (Low Effort, High Impact)

### 1. ✅ Node.js Memory Limit (Already Done)
```yaml
NODE_OPTIONS=--max-old-space-size=400
```
**Savings**: Prevents OOM, better GC behavior

### 2. Limit Database Query Results (BIGGEST IMPACT)
**Problem**: `/api/boards` fetches ALL tasks with ALL relationships for ALL boards at once
**Current**: If you have 10 boards × 100 tasks = 1000 tasks loaded into server memory per request

**Solution**: Add optional `boardId` filter to only fetch selected board

```javascript
// server/routes/boards.js
router.get('/', authenticateToken, (req, res) => {
  const { db } = req.app.locals;
  const boardId = req.query.boardId; // Optional filter
  
  let boards;
  if (boardId) {
    // Only fetch the requested board
    boards = wrapQuery(
      db.prepare('SELECT * FROM boards WHERE id = ? ORDER BY CAST(position AS INTEGER) ASC'),
      'SELECT'
    ).all(boardId);
  } else {
    // Fetch all boards (backward compatible)
    boards = wrapQuery(
      db.prepare('SELECT * FROM boards ORDER BY CAST(position AS INTEGER) ASC'),
      'SELECT'
    ).all();
  }
  
  // Rest of the code...
});
```
**Savings**: ~50-200MB per request (if many boards/tasks)

### 3. Add TTL to Server-Side Caches
**Problem**: `global.oauthConfigCache` and `translationsCache` never expire

**Solution**: Add TTL with automatic cleanup

```javascript
// server/utils/i18n.js
let translationsCache = {
  en: { data: null, timestamp: null },
  fr: { data: null, timestamp: null }
};
const CACHE_TTL = 3600000; // 1 hour

function loadTranslations(lang) {
  const normalizedLang = lang?.toUpperCase() === 'FR' ? 'fr' : 'en';
  const cached = translationsCache[normalizedLang];
  
  // Check if cache is valid
  if (cached.data && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  // Load and cache with timestamp
  const translations = /* ... load from file ... */;
  translationsCache[normalizedLang] = {
    data: translations,
    timestamp: Date.now()
  };
  return translations;
}
```

```javascript
// server/routes/auth.js - Add TTL to OAuth cache
if (global.oauthConfigCache && 
    !global.oauthConfigCache.invalidated &&
    Date.now() - global.oauthConfigCache.timestamp < 3600000) { // 1 hour TTL
  return global.oauthConfigCache.settings;
}
```
**Savings**: ~1-5MB

### 4. Limit WebSocket Connection Memory
**Problem**: `connectedClients` Map grows unbounded, each connection holds data in memory

**Solution**: Add connection limits and cleanup

```javascript
// server/services/websocketService.js
constructor() {
  this.io = null;
  this.connectedClients = new Map();
  this.maxConnections = 1000; // Limit connections
}

initialize(server) {
  this.io = new SocketIOServer(server, {
    maxHttpBufferSize: 1e6, // 1MB max message size
    pingTimeout: 60000,
    pingInterval: 25000,
    // Limit per-connection memory
    perMessageDeflate: true, // Enable compression
  });
  
  // ... existing code ...
  
  socket.on('disconnect', (reason) => {
    console.log(`🔴 Client disconnected: ${socket.id} - Reason: ${reason}`);
    this.connectedClients.delete(socket.id); // ✅ Already cleaning up
    
    // Force cleanup of socket rooms
    socket.rooms.forEach(room => {
      socket.leave(room);
    });
  });
}
```
**Savings**: ~5-20MB (prevents connection accumulation)

### 5. Stream Large File Downloads
**Problem**: Large files loaded entirely into server memory before sending

**Solution**: Use streaming (check if already implemented)

```javascript
// server/routes/files.js
router.get('/:id', authenticateToken, (req, res) => {
  // Check if already using streams
  const filePath = path.join(attachmentsDir, id);
  const stat = fs.statSync(filePath);
  
  // Use streams instead of loading entire file
  const fileStream = fs.createReadStream(filePath);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', getContentType(filename));
  fileStream.pipe(res); // Stream directly to response
});
```
**Savings**: ~10-50MB per large file download

### 6. Clean Up Temporary Maps/Sets
**Problem**: Temporary Maps/Sets created in routes may not be garbage collected quickly

**Solution**: Explicitly clear after use (though GC should handle this)

```javascript
// server/routes/tasks.js - After using Maps
const tasksByBoard = new Map();
// ... use Map ...
tasksByBoard.clear(); // Explicit cleanup (optional, GC will handle)
```
**Savings**: ~1-5MB (faster GC)

### 7. Limit Query Result Size
**Problem**: Some queries fetch unlimited results

**Solution**: Add LIMIT clauses where appropriate

```javascript
// server/routes/activity.js
router.get('/', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const activities = wrapQuery(
    db.prepare(`
      SELECT * FROM activity 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `),
    'SELECT'
  ).all(limit, offset);
  
  res.json(activities);
});
```
**Savings**: ~5-20MB (smaller query results)

---

## 🔧 Medium Effort (Moderate Impact)

### 8. Optimize Database Query Columns
**Problem**: Using `SELECT *` fetches all columns, even unused ones

**Solution**: Select only needed columns

```javascript
// server/routes/boards.js
// Instead of: SELECT * FROM tasks
// Use: SELECT id, title, columnId, position, memberId, priority FROM tasks
// Only fetch full task data (description, comments) when viewing task details
```
**Savings**: ~10-50MB (smaller query results)

### 9. Implement Request Deduplication (Server-Side)
**Problem**: Multiple simultaneous requests for same data

**Solution**: Cache in-flight requests (already doing for settings, expand)

```javascript
// server/routes/boards.js
const pendingBoardRequests = new Map();

router.get('/', authenticateToken, async (req, res) => {
  const cacheKey = req.query.boardId || 'all';
  
  // Check if request is already in flight
  if (pendingBoardRequests.has(cacheKey)) {
    const result = await pendingBoardRequests.get(cacheKey);
    return res.json(result);
  }
  
  // Create request promise
  const requestPromise = (async () => {
    // ... fetch boards ...
    return boardsWithData;
  })();
  
  pendingBoardRequests.set(cacheKey, requestPromise);
  
  try {
    const result = await requestPromise;
    res.json(result);
  } finally {
    pendingBoardRequests.delete(cacheKey);
  }
});
```
**Savings**: ~10-30MB (prevents duplicate queries)

### 10. Compress WebSocket Messages
**Problem**: Large WebSocket messages consume server memory

**Solution**: Enable compression

```javascript
// server/services/websocketService.js
this.io = new SocketIOServer(server, {
  perMessageDeflate: true, // Enable compression
  maxHttpBufferSize: 1e6, // 1MB limit
});
```
**Savings**: ~5-20MB (smaller message buffers)

### 11. Clean Up Old Notification Data
**Problem**: Notification throttler may accumulate old data

**Solution**: Ensure cleanup runs regularly (check if already implemented)

```javascript
// server/services/notificationThrottler.js
// Verify cleanupOldNotifications() is called regularly
cleanupOldNotifications() {
  // Should delete old notifications from database
  // Check if this is being called on schedule
}
```
**Savings**: ~5-20MB (prevents data accumulation)

### 12. Limit Prepared Statement Cache
**Problem**: better-sqlite3 caches prepared statements

**Solution**: SQLite handles this, but ensure we're not creating too many

```javascript
// better-sqlite3 automatically manages prepared statement cache
// Just ensure we're reusing prepared statements (already doing this ✓)
```
**Savings**: ~1-5MB (minimal, but good practice)

---

## 🎯 Advanced Techniques (Higher Effort, Good Impact)

### 13. Implement Response Caching (Redis)
**Problem**: Same data fetched repeatedly

**Solution**: Cache frequently accessed data in Redis

```javascript
// server/routes/boards.js
router.get('/', authenticateToken, async (req, res) => {
  const cacheKey = `boards:${req.user.id}:${req.query.boardId || 'all'}`;
  
  // Check Redis cache
  const cached = await redisService.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Fetch from database
  const boards = /* ... fetch ... */;
  
  // Cache in Redis (5 minute TTL)
  await redisService.setex(cacheKey, 300, JSON.stringify(boards));
  
  res.json(boards);
});
```
**Savings**: ~20-100MB (moves data to Redis, reduces DB queries)

### 14. Paginate Large Database Queries
**Problem**: Some queries fetch all records

**Solution**: Add pagination support

```javascript
// server/routes/tasks.js
router.get('/', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  const tasks = wrapQuery(
    db.prepare('SELECT * FROM tasks LIMIT ? OFFSET ?'),
    'SELECT'
  ).all(limit, offset);
  
  res.json(tasks);
});
```
**Savings**: ~10-50MB (smaller result sets)

### 15. Use Database Connection Pooling
**Problem**: better-sqlite3 uses single connection (not a pool)

**Solution**: SQLite doesn't need pooling, but ensure we're not creating multiple DB instances

```javascript
// Already using single DB instance (good ✓)
// Just ensure we're not accidentally creating multiple connections
```
**Savings**: ~1-5MB (minimal, but ensures no leaks)

### 16. Monitor and Limit Memory Usage
**Problem**: No visibility into memory usage

**Solution**: Add memory monitoring endpoint

```javascript
// server/routes/debug.js (or create new)
router.get('/memory', authenticateToken, requireRole('admin'), (req, res) => {
  const usage = process.memoryUsage();
  res.json({
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB',
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    connectedClients: websocketService.getClientCount(),
  });
});
```
**Savings**: Enables monitoring (no direct savings, but helps identify issues)

### 17. Clean Up Event Listeners
**Problem**: Event listeners may not be cleaned up, causing memory leaks

**Solution**: Audit all event listeners

```javascript
// Check all places where we add listeners:
// - Redis subscriptions
// - WebSocket events
// - Database event handlers
// Ensure all are properly cleaned up
```
**Savings**: ~5-20MB (prevents leaks)

### 18. Limit Concurrent Request Processing
**Problem**: Too many concurrent requests consume memory

**Solution**: Add request queue/limiting

```javascript
// server/index.js
import express from 'express';
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```
**Savings**: ~10-50MB (reduces concurrent request memory)

---

## 📊 Expected Total Savings (Server-Side Only)

| Category | Savings | Effort |
|----------|---------|--------|
| Quick Wins | 80-300MB | Low |
| Medium Effort | 30-150MB | Medium |
| Advanced | 50-200MB | High |
| **Total Potential** | **160-650MB** | - |

**Note**: Some optimizations overlap. Realistic savings: **100-300MB**

---

## 🎯 Priority Recommendations (Server-Side)

1. **#2 - Limit Database Query Results** ⭐ (Biggest impact, easy)
   - Only fetch tasks for selected board
   - **Savings: 50-200MB**

2. **#3 - Add TTL to Caches** (Easy, prevents growth)
   - Add expiration to OAuth and translation caches
   - **Savings: 1-5MB**

3. **#8 - Optimize Query Columns** (Medium effort, good impact)
   - Select only needed columns
   - **Savings: 10-50MB**

4. **#13 - Response Caching with Redis** (Medium effort, high impact)
   - Cache frequently accessed data
   - **Savings: 20-100MB**

5. **#4 - Limit WebSocket Memory** (Easy, prevents accumulation)
   - Add connection limits and cleanup
   - **Savings: 5-20MB**

**Start with #2 for maximum impact!**

---

## 🔍 Server-Side Memory Monitoring

### Add Memory Endpoint
```javascript
// server/routes/debug.js
router.get('/memory', authenticateToken, requireRole('admin'), (req, res) => {
  const usage = process.memoryUsage();
  const db = req.app.locals.db;
  
  // Get database size
  const dbSize = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();
  
  res.json({
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB',
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    connectedClients: websocketService.getClientCount(),
    dbSize: Math.round(dbSize.size / 1024 / 1024) + 'MB',
  });
});
```

### Monitor in Production
```bash
# Watch memory usage
watch -n 5 'curl -s http://localhost:3222/api/debug/memory | jq'
```

