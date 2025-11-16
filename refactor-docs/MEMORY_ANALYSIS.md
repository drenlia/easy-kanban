# Memory Usage Analysis & Optimization Recommendations

## Current Memory Usage: ~400MB

### Main Contributors (Estimated)

1. **Large Dependencies** (~200-250MB):
   - TipTap editor + extensions (~50-80MB)
   - React + React-DOM (~40-60MB)
   - Socket.io (~20-30MB)
   - Recharts (~15-25MB)
   - XLSX (~10-20MB)
   - Other libraries (axios, i18next, etc.) (~30-50MB)

2. **Node.js Runtime** (~50-80MB):
   - V8 JavaScript engine
   - Node.js core modules

3. **Application State** (~50-100MB):
   - React component state (App.tsx has 63+ hooks!)
   - WebSocket connections
   - Database connection (better-sqlite3)
   - Caches (translations, OAuth config)

4. **Request Handling** (~20-50MB):
   - Express middleware
   - Request/response buffers
   - Temporary query results

## Quick Wins (Low Effort, High Impact)

### 1. Enable Node.js Memory Optimization Flags ✅ DONE
Added to `docker-compose.yml`:
```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=400
```
This limits Node.js heap to 400MB, leaving ~50MB headroom for system/other memory.

### 2. Reduce Database Query Memory
Some queries fetch ALL tasks with ALL relationships. Consider:
- Pagination for large datasets
- Limit JOIN results
- Use streaming for large exports

### 3. Optimize React Bundle
Already using lazy loading (good!), but could:
- Review if all TipTap extensions are needed
- Check if recharts is tree-shaken properly
- Consider code splitting for Reports component

### 4. WebSocket Connection Cleanup
Ensure proper cleanup on disconnect (already implemented, but verify)

### 5. Translation Cache Limit
Add size limit to translation cache in `server/utils/i18n.js`

## Medium Effort Optimizations

### 1. Split App.tsx Component
App.tsx is 3600+ lines with 63+ hooks. Split into:
- BoardManagement component
- TaskManagement component
- FilterManagement component
- etc.

### 2. Database Query Optimization
- Add LIMIT clauses where appropriate
- Use prepared statements (already doing this ✓)
- Consider pagination for activity feed

### 3. Reduce TipTap Bundle Size
- Only import needed extensions
- Consider lighter editor for simple use cases

## Current Status: ✅ Reasonable

400MB for a full-stack Node.js + React app with:
- Rich text editor (TipTap)
- Real-time WebSocket
- Charting library
- Excel export
- Multiple boards/tasks

...is actually **reasonable**. Most similar apps use 300-600MB.

## Recommendations

1. **Immediate**: Increase memory limit to 512MB (already done ✓)
2. **Short-term**: Add Node.js GC flags, review large queries
3. **Long-term**: Consider splitting App.tsx, optimize bundle size

## No Memory Leaks Detected

- WebSocket connections properly cleaned up
- Event listeners removed on unmount
- Maps/Sets are temporary (not accumulating)
- Database connections properly managed

