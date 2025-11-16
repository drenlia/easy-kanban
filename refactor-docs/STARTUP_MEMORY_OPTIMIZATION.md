# Startup Memory Optimization Plan

## Current Situation
- **Startup**: 460.7MB (89.97%)
- **After 3-5 min**: 183.4MB (35.83%)
- **Goal**: < 256MB at startup

## Root Causes of High Startup Memory

### 1. Module Loading (Biggest Impact)
**Problem**: All routes and services imported synchronously at startup
- 20+ route modules loaded immediately
- All dependencies loaded (Express, Socket.io, Redis, etc.)
- V8 JIT compilation overhead

**Solution**: Lazy load routes and defer non-critical services

### 2. Database Initialization
**Problem**: Full database initialization at startup
- Table creation
- Migration execution
- Default data initialization
- Storage usage calculation

**Solution**: Defer non-critical initialization

### 3. Service Initialization
**Problem**: All services start immediately
- Redis connection
- WebSocket server
- Activity logger
- Notification service
- Scheduler

**Solution**: Lazy initialize services on first use

### 4. Translation Loading
**Problem**: Translation files loaded into memory cache
- Currently lazy, but could be optimized further

**Solution**: Keep lazy, but ensure it's truly on-demand

---

## Optimization Strategies

### Strategy 1: Lazy Route Loading (High Impact)
**Savings**: ~50-100MB at startup

```javascript
// server/index.js - Instead of importing all routes
// Change from:
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
// ... 20+ more imports

// To lazy loading:
app.use('/api/boards', async (req, res, next) => {
  const { default: router } = await import('./routes/boards.js');
  router(req, res, next);
});
```

**Better approach**: Use Express lazy loading pattern
```javascript
const lazyRouter = (modulePath) => {
  let router = null;
  return async (req, res, next) => {
    if (!router) {
      const module = await import(modulePath);
      router = module.default;
    }
    return router(req, res, next);
  };
};

app.use('/api/boards', lazyRouter('./routes/boards.js'));
```

### Strategy 2: Defer Storage Calculation (Medium Impact)
**Savings**: ~10-20MB at startup

```javascript
// server/index.js - Defer storage initialization
// Change from:
server.listen(PORT, '0.0.0.0', async () => {
  initializeStorageUsage(db); // Runs immediately
  await initializeServices();
});

// To:
server.listen(PORT, '0.0.0.0', async () => {
  await initializeServices();
  // Defer storage calculation to first request or after 30 seconds
  setTimeout(() => initializeStorageUsage(db), 30000);
});
```

### Strategy 3: Reduce Heap Size Further (Quick Win)
**Savings**: ~50MB at startup

```yaml
# docker-compose.yml
NODE_OPTIONS=--max-old-space-size=300  # Reduced from 400
```

**Trade-off**: May need to increase if memory grows during operation

### Strategy 4: Lazy Service Initialization (Medium Impact)
**Savings**: ~20-30MB at startup

```javascript
// Defer Redis/WebSocket until first request
let servicesInitialized = false;

async function ensureServicesInitialized() {
  if (!servicesInitialized) {
    await redisService.connect();
    websocketService.initialize(server);
    servicesInitialized = true;
  }
}

// Initialize on first API request
app.use('/api/*', async (req, res, next) => {
  await ensureServicesInitialized();
  next();
});
```

### Strategy 5: Optimize Database Initialization (Low Impact)
**Savings**: ~5-10MB

- Already optimized, but could defer demo data initialization
- Only initialize if database is empty

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Immediate)
1. ✅ Reduce `NODE_OPTIONS=--max-old-space-size=300`
2. ✅ Defer storage calculation by 30 seconds

**Expected**: ~60-70MB reduction → ~390MB startup

### Phase 2: Lazy Loading (High Impact)
3. ✅ Implement lazy route loading for non-critical routes
4. ✅ Lazy initialize Redis/WebSocket on first request

**Expected**: ~70-130MB reduction → ~260-320MB startup

### Phase 3: Fine-tuning
5. ✅ Optimize translation loading (already lazy)
6. ✅ Review and defer other non-critical initializations

**Expected**: ~10-20MB reduction → **~250MB startup** ✅

---

## Implementation Plan

### Step 1: Quick Wins (5 minutes)
```yaml
# docker-compose.yml
NODE_OPTIONS=--max-old-space-size=300
```

```javascript
// server/index.js - Defer storage calculation
setTimeout(() => initializeStorageUsage(db), 30000);
```

### Step 2: Lazy Route Loading (30 minutes)
Implement lazy loading for routes that aren't needed immediately:
- `/api/debug` - Only needed for debugging
- `/api/reports` - Only needed when reports page is accessed
- `/api/admin/*` - Only needed when admin panel is accessed

### Step 3: Lazy Service Initialization (15 minutes)
Defer Redis/WebSocket until first API request

---

## Expected Results

| Phase | Startup Memory | After Warmup |
|-------|---------------|--------------|
| Current | 460MB | 183MB |
| Phase 1 | ~390MB | ~183MB |
| Phase 2 | ~260-320MB | ~183MB |
| Phase 3 | **~250MB** ✅ | ~183MB |

**Goal Achieved**: < 256MB at startup ✅

---

## Trade-offs

### Pros
- ✅ Lower startup memory
- ✅ Faster container startup
- ✅ Better resource utilization

### Cons
- ⚠️ Slightly slower first request (lazy loading overhead)
- ⚠️ Need to monitor if heap size is too low
- ⚠️ More complex code (lazy loading pattern)

---

## Monitoring

After implementation, monitor:
1. Startup memory usage
2. First request latency
3. Memory after warmup
4. Any OOM errors (if heap too low)

