# Why NFS Works for Easy-Kanban But Not Registry (Yet)

## The Key Difference

### Easy-Kanban NFS Volumes (Working ✅)

**Setup:**
- Paths: `/exports/data`, `/exports/attachments`, `/exports/avatars`
- These were **configured from the beginning** when NFS was first set up
- The init container creates these directories
- The NFS server exports them via environment variables:
  - `NFS_EXPORT_0=/exports/data`
  - `NFS_EXPORT_1=/exports/attachments`
  - `NFS_EXPORT_2=/exports/avatars`

**Why it works:**
1. ✅ Directories exist (created by init container)
2. ✅ Exports are configured (environment variables set)
3. ✅ NFS server started with these exports from day one
4. ✅ Stable configuration - no changes needed

### Registry NFS Volume (Not Working Yet ⚠️)

**Setup:**
- Path: `/exports/registry` (NEW path)
- This is a **new addition** to existing NFS setup
- We're trying to add it to a running system

**Why it's failing:**
1. ⚠️ NFS server pods are crashing (CrashLoopBackOff)
2. ⚠️ The directory might not exist when NFS server starts
3. ⚠️ The NFS server container (`erichough/nfs-server`) validates that directories exist before exporting
4. ⚠️ Multiple NFS server pods might be conflicting

## The Root Cause

The `erichough/nfs-server` container has a validation step:
- It checks if the directory in the export path exists
- If the directory doesn't exist, it logs a warning and skips the export
- If there are issues with the exports, the container might crash

**From the logs:**
```
----> WARNING: skipping NFS_EXPORT_3 environment variable since /exports/registry is not a container directory
```

This means:
1. The init container might not be creating `/exports/registry` properly
2. OR the NFS server is starting before the directory is created
3. OR there's a timing issue

## Solution

The fix requires:
1. ✅ Ensure init container creates `/exports/registry`
2. ✅ Ensure NFS server has the export environment variable
3. ✅ Ensure NFS server starts AFTER directory is created
4. ✅ Fix any pod conflicts (multiple NFS server pods)

## Why Easy-Kanban Didn't Have This Problem

Easy-kanban's NFS setup was:
- **Set up once** at the beginning
- All directories created together
- All exports configured together
- No incremental additions needed

The registry is an **incremental addition**, which requires:
- Updating existing deployment
- Ensuring init container runs first
- Ensuring NFS server picks up new export
- No conflicts with existing setup

## The Fix

We need to:
1. Clean up any duplicate/crashed NFS server pods
2. Ensure the init container command includes `/exports/registry`
3. Ensure the NFS server environment variable is set correctly
4. Restart the NFS server cleanly

This is a **configuration/timing issue**, not a fundamental NFS problem. Once the NFS server is properly configured with the registry export, it will work just like the easy-kanban volumes.

