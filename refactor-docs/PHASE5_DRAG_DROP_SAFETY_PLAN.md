# Phase 5: Drag and Drop Extraction - Safety Plan

## Overview
This document outlines the testing strategy and safety measures to ensure drag and drop functionality remains intact after refactoring.

## Current Drag & Drop Architecture

### Components Involved:
1. **SimpleDragDropManager** (`src/components/dnd/SimpleDragDropManager.tsx`)
   - Handles most drag/drop logic
   - Manages DndContext, sensors, collision detection
   - Already extracted and working

2. **App.tsx Drag State** (to be extracted):
   - `draggedTask`, `draggedColumn`
   - `isHoveringBoardTab`
   - `dragPreview`
   - `isTaskMiniMode`
   - `dragCooldown`, `taskCreationPause`, `boardCreationPause`
   - Refs: `draggedTaskRef`, `boardTabHoverTimeoutRef`, `dragCooldownTimeoutRef`

3. **App.tsx Drag Handlers** (to be extracted):
   - `handleUnifiedTaskDragEnd` (main handler)
   - `handleTaskDragStart`, `handleTaskDragEnd`
   - `handleTaskDragOver`
   - `handleClearDragState`
   - `handleTaskDrop`, `handleTaskDropOnBoard`

## Testing Strategy

### Phase 1: Pre-Extraction Baseline Testing ✅
**Before any changes, document current behavior:**

1. **Task Drag & Drop Tests:**
   - [ ] Drag task within same column (reorder)
   - [ ] Drag task to different column (move)
   - [ ] Drag task to empty column
   - [ ] Drag task to top of column
   - [ ] Drag task to bottom of column
   - [ ] Drag task between columns with many tasks
   - [ ] Drag task to position between two tasks
   - [ ] Rapid drag operations (stress test)
   - [ ] Drag task while another user moves it (WebSocket conflict)

2. **Cross-Board Drag Tests:**
   - [ ] Drag task to different board tab
   - [ ] Drag task to board tab while hovering over column
   - [ ] Drag task to board tab with mouse outside tab area (should reject)
   - [ ] Drag task to same board (should not trigger move)
   - [ ] Drag task across multiple boards quickly

3. **Column Drag Tests:**
   - [ ] Drag column to reorder
   - [ ] Drag column to first position
   - [ ] Drag column to last position
   - [ ] Drag column while tasks are being moved

4. **Edge Cases:**
   - [ ] Drag task while offline (should be blocked)
   - [ ] Drag task during cooldown period
   - [ ] Drag task immediately after creation
   - [ ] Drag task that gets deleted mid-drag
   - [ ] Drag task while board is being deleted
   - [ ] Drag task while column is being deleted
   - [ ] Multiple rapid drags (cooldown behavior)

5. **Visual/UX Tests:**
   - [ ] Drag preview appears correctly
   - [ ] Board tab hover state works
   - [ ] Task mini-mode during drag
   - [ ] Custom cursor during drag
   - [ ] Drag overlay shows correct task info

### Phase 2: Incremental Extraction with Testing

#### Step 2.1: Extract Drag State Only (Low Risk)
**File: `src/hooks/useDragState.ts`**

**What to extract:**
- All drag-related state variables
- All drag-related refs
- State setters (keep in App.tsx initially)

**Testing after Step 2.1:**
- Run all Phase 1 tests
- Verify state updates correctly
- Check React DevTools for state changes

**Rollback plan:**
- If issues: Move state back to App.tsx
- Keep hook file for reference

#### Step 2.2: Extract Simple Handlers (Medium Risk)
**File: `src/hooks/useDragHandlers.ts`**

**What to extract:**
- `handleTaskDragStart` (simple state updates)
- `handleTaskDragEnd` (cleanup)
- `handleClearDragState`
- `handleTaskDragOver` (if simple)

**Testing after Step 2.2:**
- Run all Phase 1 tests
- Focus on drag start/end behavior
- Check state cleanup

**Rollback plan:**
- Move handlers back to App.tsx
- Keep hook for reference

#### Step 2.3: Extract Complex Handler (High Risk)
**File: `src/hooks/useDragHandlers.ts` (continued)**

**What to extract:**
- `handleUnifiedTaskDragEnd` (complex logic)
- `handleTaskDrop`
- `handleTaskDropOnBoard`

**Testing after Step 2.3:**
- **CRITICAL**: Run all Phase 1 tests
- Add console logging to trace execution
- Test with multiple users (WebSocket)
- Test edge cases thoroughly

**Rollback plan:**
- Immediate rollback if any test fails
- Keep both versions (old in App.tsx, new in hook)
- Use feature flag to switch between them

### Phase 3: Integration Testing

#### Test Scenarios:
1. **Real-time Updates During Drag:**
   - User A drags task
   - User B moves same task via WebSocket
   - Verify conflict resolution

2. **Performance Testing:**
   - Drag with 100+ tasks in column
   - Drag with 20+ columns
   - Rapid drag operations

3. **Browser Compatibility:**
   - Chrome/Edge
   - Firefox
   - Safari
   - Mobile browsers (if applicable)

## Safety Mechanisms

### 1. Feature Flag Approach
```typescript
// In App.tsx
const USE_NEW_DRAG_HOOK = false; // Toggle to test

if (USE_NEW_DRAG_HOOK) {
  const dragHandlers = useDragHandlers(...);
  // Use new handlers
} else {
  // Use existing handlers
}
```

### 2. Side-by-Side Comparison
- Keep old code commented in App.tsx
- Run both versions in parallel (if possible)
- Compare behavior

### 3. Comprehensive Logging
```typescript
// Add detailed logging during extraction
console.log('[Drag] handleUnifiedTaskDragEnd:', {
  activeId: active.id,
  overId: over?.id,
  draggedTask,
  targetColumnId,
  // ... all relevant state
});
```

### 4. Type Safety
- Use TypeScript strictly
- Define clear interfaces for hook props
- Use type guards for runtime checks

### 5. Gradual Migration
- Extract one handler at a time
- Test after each extraction
- Don't extract multiple complex handlers at once

## Rollback Procedures

### Immediate Rollback (if critical bug):
1. Revert git commit
2. Restore App.tsx from backup
3. Document the issue
4. Fix in place before re-attempting

### Partial Rollback (if minor issue):
1. Keep extracted hook
2. Move problematic handler back to App.tsx
3. Fix hook, then re-extract

## Success Criteria

✅ All Phase 1 tests pass  
✅ No visual regressions  
✅ No performance degradation  
✅ WebSocket real-time updates work  
✅ Cross-board drag works  
✅ Column reordering works  
✅ Edge cases handled correctly  
✅ No console errors or warnings  

## Post-Extraction Validation

### Automated Checks:
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] No unused variables/imports

### Manual Testing Checklist:
- [ ] Test each drag scenario from Phase 1
- [ ] Test with multiple users
- [ ] Test on different browsers
- [ ] Test on different screen sizes
- [ ] Test with slow network (throttle)

### Performance Validation:
- [ ] Measure drag operation latency
- [ ] Check memory usage during drag
- [ ] Verify no memory leaks

## Timeline Estimate

- **Phase 1 (Baseline Testing)**: 30-60 minutes
- **Step 2.1 (State Extraction)**: 1-2 hours + testing
- **Step 2.2 (Simple Handlers)**: 1-2 hours + testing
- **Step 2.3 (Complex Handler)**: 2-3 hours + extensive testing
- **Phase 3 (Integration Testing)**: 1-2 hours

**Total**: ~6-10 hours (with thorough testing)

## Risk Mitigation

1. **Start with lowest risk** (state extraction)
2. **Test after each step** (don't batch changes)
3. **Keep old code** (comment out, don't delete)
4. **Use feature flags** (easy rollback)
5. **Document everything** (for future reference)
6. **Get user approval** (before proceeding to next step)

## Questions to Answer Before Starting

1. ✅ Do we have a test environment?
2. ✅ Can we test with multiple users?
3. ✅ Do we have time for thorough testing?
4. ✅ Is drag & drop critical for current users?
5. ✅ Can we rollback quickly if needed?

## Next Steps

1. **Review this plan** with team/user
2. **Set up test environment** if needed
3. **Document current behavior** (Phase 1)
4. **Begin Step 2.1** (state extraction only)
5. **Test thoroughly** before proceeding

