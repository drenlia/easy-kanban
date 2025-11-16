# better-sqlite3 Upgrade Analysis: 9.6.0 → 12.4.1

## Current Usage in Codebase

The codebase uses standard better-sqlite3 methods that are stable across versions:

### Methods Used:
- ✅ `new Database(dbPath)` - Constructor (stable)
- ✅ `db.prepare(sql)` - Prepared statements (stable)
- ✅ `db.exec(sql)` - Execute SQL (stable)
- ✅ `db.transaction(callback)` - Transactions (stable)
- ✅ `stmt.get()` - Get single row (stable)
- ✅ `stmt.all()` - Get all rows (stable)
- ✅ `stmt.run()` - Execute statement (stable)

**All methods used are part of the stable API and should work without changes.**

---

## Breaking Changes (9.x → 12.x)

### 1. Node.js Version Support ⚠️
- **Removed**: Node.js v18 and earlier
- **Added**: Node.js v24 support
- **Your Status**: ✅ Using Node.js 22 (compatible)

### 2. Prebuilt Binaries
- May require compilation from source if prebuilt binaries aren't available for Node.js 22
- Requires build tools in Docker container (already have for Alpine)

### 3. API Changes
- **No breaking API changes** for the methods you're using
- All `prepare()`, `exec()`, `transaction()`, `get()`, `all()`, `run()` methods remain the same

---

## Version Path Options

### Option 1: Direct to 12.4.1 (Latest)
- **Jump**: 9.6.0 → 12.4.1
- **Risk**: Low-Medium
- **Benefit**: Latest features and optimizations
- **Estimated Savings**: ~5-15MB

### Option 2: Incremental (11.x first)
- **Step 1**: 9.6.0 → 11.10.0
- **Step 2**: 11.10.0 → 12.4.1
- **Risk**: Lower (smaller jumps)
- **Benefit**: Easier to identify issues
- **Estimated Savings**: Same (~5-15MB)

---

## Compatibility Check

### ✅ Compatible
- Node.js 22 (current)
- All API methods used in codebase
- Docker Alpine environment (can compile from source)

### ⚠️ Considerations
- May need to rebuild Docker image (native module)
- Test database operations thoroughly
- Monitor for any edge cases

---

## Recommended Approach

### Phase 3: Upgrade to 12.4.1

**Steps:**
1. Update `package.json`: `"better-sqlite3": "^12.4.1"`
2. Run `npm install`
3. Rebuild Docker image: `docker compose build`
4. Test thoroughly:
   - Database initialization
   - All CRUD operations
   - Transactions
   - Migrations

**Risk Assessment**: **LOW-MEDIUM**
- API is stable ✅
- Node.js version compatible ✅
- May need Docker rebuild ⚠️

**Estimated Memory Savings**: **5-15MB**

---

## Testing Checklist

After upgrade, verify:
- [ ] Database initialization works
- [ ] All queries execute correctly
- [ ] Transactions work properly
- [ ] Migrations run successfully
- [ ] No errors in server logs
- [ ] Memory usage is stable or improved

---

## Rollback Plan

If issues occur:
1. Revert `package.json` to `"better-sqlite3": "^9.6.0"`
2. Run `npm install`
3. Rebuild Docker image
4. Restart container

---

## Conclusion

**Safe to proceed** with upgrade to 12.4.1. The breaking changes don't affect your usage patterns, and you're on a compatible Node.js version.

