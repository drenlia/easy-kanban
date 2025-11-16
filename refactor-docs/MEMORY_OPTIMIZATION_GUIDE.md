# Memory Optimization Tricks & Techniques

## 🚀 Quick Wins (Low Effort, High Impact)

### 1. ✅ Node.js Memory Limit (Already Done)
```yaml
NODE_OPTIONS=--max-old-space-size=400
```
**Savings**: Prevents OOM, better GC behavior

### 2. Limit Database Query Results
**Problem**: `/api/boards` fetches ALL tasks with ALL relationships for ALL boards
**Solution**: Only fetch tasks for visible/selected board

```javascript
// server/routes/boards.js - Add boardId filter
router.get('/', authenticateToken, (req, res) => {
  const boardId = req.query.boardId; // Optional filter
  // Only fetch tasks for specific board if provided
});
```
**Savings**: ~50-200MB (if you have many boards with many tasks)

### 3. Paginate Activity Feed
**Problem**: Activity feed loads all activities
**Solution**: Already limited to 20, but add pagination for scrolling

```javascript
// Already doing: getActivityFeed(20)
// Add: getActivityFeed(20, offset) for infinite scroll
```
**Savings**: ~5-20MB

### 4. Clean Up Timers/Intervals
**Problem**: 229 setTimeout/setInterval calls - some may not be cleaned up
**Solution**: Audit and ensure all timers are cleared

```javascript
// Pattern to follow:
useEffect(() => {
  const timer = setTimeout(() => {}, 1000);
  return () => clearTimeout(timer); // ✅ Always cleanup
}, []);
```
**Savings**: ~1-5MB (prevents memory leaks)

### 5. Limit WebSocket Message Buffer
**Problem**: WebSocket may buffer messages if client is slow
**Solution**: Add message queue limits

```javascript
// server/services/websocketService.js
this.io = new SocketIOServer(server, {
  maxHttpBufferSize: 1e6, // 1MB max message size
  pingTimeout: 60000,
  // Add per-connection message queue limit
});
```
**Savings**: ~5-20MB (prevents message accumulation)

### 6. Use WeakMap for Caches
**Problem**: Translation cache and OAuth cache never expire
**Solution**: Use WeakMap or add TTL

```javascript
// server/utils/i18n.js
const translationsCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

function loadTranslations(lang) {
  const cached = translationsCache.get(lang);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  // ... load and cache with timestamp
}
```
**Savings**: ~1-5MB

### 7. Stream Large File Downloads
**Problem**: Large files are loaded entirely into memory
**Solution**: Use streaming for file downloads

```javascript
// server/routes/files.js
router.get('/:id', (req, res) => {
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res); // Stream instead of loading entire file
});
```
**Savings**: ~10-50MB (for large file downloads)

---

## 🔧 Medium Effort (Moderate Impact)

### 8. Virtualize Large Lists
**Problem**: Rendering all tasks/boards at once
**Solution**: Use react-window (already imported!)

```javascript
// Already have react-window imported!
// Use it for:
// - Task lists in ListView
// - Board tabs (if many boards)
// - Activity feed items
```
**Savings**: ~10-50MB (only render visible items)

### 9. Lazy Load Heavy Components
**Problem**: All components loaded upfront
**Solution**: Already doing this for TaskPage, but expand:

```javascript
// Lazy load Reports, GanttView, Admin components
const Reports = lazyWithRetry(() => import('./components/Reports'));
const GanttView = lazyWithRetry(() => import('./components/GanttViewV2'));
```
**Savings**: ~20-50MB (bundle size reduction)

### 10. Memoize Expensive Computations
**Problem**: Recomputing filtered tasks on every render
**Solution**: Use useMemo for expensive filters

```javascript
// Already using useMemo in some places, expand:
const filteredTasks = useMemo(() => {
  return filterTasks(tasks, filters); // Expensive operation
}, [tasks, filters]);
```
**Savings**: ~5-20MB (prevents temporary object creation)

### 11. Debounce/Throttle Frequent Updates
**Problem**: WebSocket updates trigger frequent re-renders
**Solution**: Already throttling, but verify all updates are throttled

```javascript
// Already have: WEBSOCKET_THROTTLE_MS
// Ensure all WebSocket handlers use throttling
```
**Savings**: ~5-15MB (reduces temporary state objects)

### 12. Use Object Pooling for Frequent Allocations
**Problem**: Creating many temporary objects (tasks, events)
**Solution**: Reuse objects where possible

```javascript
// For frequently created objects:
const taskPool = [];
function getTaskObject() {
  return taskPool.pop() || {};
}
function releaseTaskObject(task) {
  taskPool.push(Object.assign(task, {})); // Clear and reuse
}
```
**Savings**: ~5-20MB (reduces GC pressure)

### 13. Optimize Database Queries
**Problem**: Some queries fetch more data than needed
**Solution**: Select only needed columns

```javascript
// Instead of: SELECT * FROM tasks
// Use: SELECT id, title, columnId, position FROM tasks
// Only fetch full task data when viewing details
```
**Savings**: ~10-50MB (smaller query results)

### 14. Compress WebSocket Messages
**Problem**: WebSocket messages are JSON (uncompressed)
**Solution**: Use compression for large messages

```javascript
// server/services/websocketService.js
this.io = new SocketIOServer(server, {
  perMessageDeflate: true, // Enable compression
});
```
**Savings**: ~5-20MB (smaller message buffers)

---

## 🎯 Advanced Techniques (Higher Effort, Good Impact)

### 15. Implement Request Deduplication
**Problem**: Multiple components may request same data simultaneously
**Solution**: Cache in-flight requests

```javascript
// Already doing this in api.ts for settings!
// Expand to other endpoints:
const pendingRequests = new Map();

async function getBoards() {
  const key = 'boards';
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }
  const promise = api.get('/boards');
  pendingRequests.set(key, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}
```
**Savings**: ~10-30MB (prevents duplicate data in memory)

### 16. Use IndexedDB for Large Client-Side Data
**Problem**: All tasks/boards stored in React state
**Solution**: Store large datasets in IndexedDB, only keep active in state

```javascript
// Store inactive boards in IndexedDB
// Only keep selected board's tasks in React state
// Load other boards on-demand
```
**Savings**: ~50-200MB (moves data to disk)

### 17. Implement Data Compression for Storage
**Problem**: Large task descriptions/comments in memory
**Solution**: Compress before storing in state

```javascript
// Use pako or similar for compression
import pako from 'pako';

function compressTask(task) {
  return {
    ...task,
    description: pako.deflate(task.description), // Compress
  };
}
```
**Savings**: ~20-100MB (smaller state objects)

### 18. Split Large State Objects
**Problem**: Single large columns object with all tasks
**Solution**: Split by board, only load active board

```javascript
// Instead of: columns = { all boards }
// Use: columnsByBoard = { [boardId]: columns }
// Only keep active board in memory
```
**Savings**: ~50-200MB (only active data in memory)

### 19. Use Web Workers for Heavy Processing
**Problem**: Heavy computations block main thread and use memory
**Solution**: Move to Web Workers (already have useWebWorker!)

```javascript
// Already have useWebWorker hook!
// Use it for:
// - Task filtering (if very large)
// - Gantt calculations (already doing this)
// - Report generation
```
**Savings**: ~10-50MB (offloads to separate thread)

### 20. Implement Incremental Loading
**Problem**: Loading all data upfront
**Solution**: Load data incrementally as needed

```javascript
// Load boards list first
// Load columns when board selected
// Load tasks when column visible
// Load task details when task opened
```
**Savings**: ~50-200MB (only load what's needed)

---

## 🔍 Monitoring & Debugging

### 21. Add Memory Monitoring
```javascript
// Add memory usage endpoint
router.get('/api/debug/memory', (req, res) => {
  const usage = process.memoryUsage();
  res.json({
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB',
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
  });
});
```

### 22. Profile Memory Usage
```bash
# Use Chrome DevTools Memory Profiler
# Or Node.js memory profiler:
node --inspect server/index.js
# Then use Chrome DevTools > Memory tab
```

---

## 📊 Expected Total Savings

| Category | Savings | Effort |
|----------|---------|--------|
| Quick Wins | 70-300MB | Low |
| Medium Effort | 50-200MB | Medium |
| Advanced | 100-500MB | High |
| **Total Potential** | **220-1000MB** | - |

**Note**: Some optimizations overlap, so actual savings may be less. But even 50-100MB savings is significant!

---

## 🎯 Priority Recommendations

1. **#2 - Limit Database Query Results** (Biggest impact, easy)
2. **#8 - Virtualize Large Lists** (Good impact, already have library)
3. **#15 - Request Deduplication** (Easy, expand existing pattern)
4. **#18 - Split Large State Objects** (Medium effort, good impact)
5. **#4 - Clean Up Timers** (Easy, prevents leaks)

Start with these 5 for maximum impact with minimal effort!

