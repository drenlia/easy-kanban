# Node.js 24 Memory Issue Analysis

## Problem
After upgrading to Node.js 24, memory usage increased to 97.91% (501.3MiB / 512MiB limit).

## Investigation

### Process Memory (Low)
- **RSS**: 47MB (actual process memory)
- **Heap Total**: 5.5MB
- **Heap Used**: 3.7MB
- **External**: 1.3MB

### Container Memory (High)
- **Total**: 501.3MB / 512MB (97.91%)
- **Issue**: Container overhead + native modules + V8 engine

## Root Cause Analysis

Node.js 24 (V8 13.6) appears to have:
1. **Higher baseline memory usage** - V8 engine overhead
2. **Larger native module footprint** - better-sqlite3 compiled binaries
3. **More aggressive memory allocation** - Different GC behavior

## Solutions

### Option 1: Reduce Node.js Heap Limit (Quick Fix) ✅ APPLIED
```yaml
NODE_OPTIONS=--max-old-space-size=350  # Reduced from 400
```
**Action**: Applied to docker-compose.yml
**Expected**: Frees ~50MB, but may not be enough

### Option 2: Rollback to Node.js 22 (Recommended)
**Why**: Node.js 22 was working fine, Node.js 24 shows higher memory usage
**Steps**:
1. Revert Dockerfiles to `node:22-alpine`
2. Revert `@types/node` to `^22.0.0`
3. Rebuild containers

### Option 3: Increase Container Memory Limit
**Why**: If Node.js 24 benefits are worth it, increase limit
**Action**: Change `memory: 512M` to `memory: 640M` or `768M`

## Recommendation

**Rollback to Node.js 22** because:
- ✅ Node.js 22 was stable at ~400MB usage
- ✅ Node.js 24 shows ~100MB increase with no clear benefit
- ✅ Memory optimization was the goal, not performance at memory cost
- ✅ Node.js 22 is still LTS until April 2027

**Keep Node.js 24** only if:
- You need specific Node.js 24 features
- You can increase container memory limit
- Performance gains justify the memory cost

## Next Steps

1. **Immediate**: Applied reduced heap limit (350MB)
2. **Test**: Monitor if memory usage improves
3. **Decision**: If still high, rollback to Node.js 22

