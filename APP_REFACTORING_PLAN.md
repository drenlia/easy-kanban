# App.tsx Refactoring Plan

## Overview
The `src/App.tsx` file is **5920 lines long**. This document outlines a safe, incremental refactoring plan to split it into smaller, more manageable files without breaking functionality.

**Strategy**: Extract from easiest to most difficult, with minimal risk at each step.

---

## Current State Analysis

### Main Responsibilities of App.tsx:
1. **State Management** (~50+ useState hooks)
   - Boards, columns, tasks, members
   - Activity feed state
   - UI state (modals, filters, search)
   - User preferences state
   - Drag and drop state
   - Task linking state
   - Version/instance status

2. **WebSocket Event Handlers** (~30+ handlers)
   - Task events (created, updated, deleted, moved)
   - Column events (created, updated, deleted, reordered)
   - Board events (created, updated, deleted, reordered)
   - Comment events (created, updated, deleted)
   - Member events (created, updated, deleted)
   - Tag/Priority events
   - Settings/Activity events

3. **Business Logic**
   - Task filtering and search
   - Board/Column selection and routing
   - Drag and drop operations
   - Task linking relationships
   - Activity feed management

4. **UI Rendering**
   - Main layout structure
   - Conditional rendering based on page/route
   - Modal management

---

## Refactoring Plan (Easiest → Most Difficult)

### Phase 1: Extract Constants and Utilities ✅ COMPLETED
**Difficulty**: ⭐ Very Easy  
**Risk**: None - No runtime behavior changes  
**Estimated Lines Saved**: ~44 lines (5920 → 5876)

#### 1.1 Extract Constants ✅
- **File**: `src/constants/appConstants.ts` ✅
- **Items Extracted**:
  - `SYSTEM_MEMBER_ID` constant ✅
  - `WEBSOCKET_THROTTLE_MS` constant ✅

#### 1.2 Extract Helper Functions ✅
- **File**: `src/utils/appHelpers.ts` ✅
- **Items Extracted**:
  - `checkInstanceStatusOnError` function ✅ (wrapped as `handleInstanceStatusError` in App.tsx)
  - `getDefaultPriorityName` function ✅ (wrapped as `getDefaultPriority` in App.tsx)

**Notes**: 
- Helper functions were extracted with proper parameter passing (setInstanceStatus, availablePriorities)
- Wrapper functions in App.tsx maintain the same API for existing code
- All references updated successfully
- No linter errors

---

### Phase 2: Extract Simple State Management Hooks (Easy - Low Risk)
**Difficulty**: ⭐⭐ Easy  
**Risk**: Low - Isolated state management  
**Estimated Lines Saved**: ~300-500

#### 2.1 Activity Feed State Hook
- **File**: `src/hooks/useActivityFeed.ts`
- **State to Extract**:
  - `showActivityFeed`
  - `activityFeedMinimized`
  - `activityFeedPosition`
  - `activityFeedDimensions`
  - `activities`
  - `lastSeenActivityId`
  - `clearActivityId`
- **Handlers to Extract**:
  - `handleActivityFeedToggle`
  - `handleActivityFeedMinimizedChange`
  - `handleActivityFeedMarkAsRead`
  - `handleActivityFeedClearAll`

#### 2.2 Version/Instance Status State Hook
- **File**: `src/hooks/useVersionStatus.ts`
- **State to Extract**:
  - `instanceStatus`
  - `showVersionBanner`
  - `versionInfo`
- **Handlers to Extract**:
  - `handleRefreshVersion`
  - `handleDismissVersionBanner`
  - `InstanceStatusBanner` component (if it's only used in App.tsx)

#### 2.3 Modal State Hook
- **File**: `src/hooks/useModalState.ts`
- **State to Extract**:
  - `showHelpModal`
  - `showProfileModal`
  - `isProfileBeingEdited`
- **Note**: Keep modal state together if modals interact

#### 2.4 Task Linking State Hook
- **File**: `src/hooks/useTaskLinking.ts`
- **State to Extract**:
  - `isLinkingMode`
  - `linkingSourceTask`
  - `linkingLine`
  - `linkingFeedbackMessage`
  - `hoveredLinkTask`
  - `taskRelationships`
  - `boardRelationships`
- **Handlers to Extract**:
  - Task linking event handlers
  - Task linking UI logic

---

### Phase 3: Extract Filtering and Search Logic ✅ COMPLETED
**Difficulty**: ⭐⭐⭐ Medium  
**Risk**: Low-Medium - Core filtering logic, but well-isolated  
**Estimated Lines Saved**: ~400-600 (Actual: ~500 lines extracted)

#### 3.1 Filter State Hook ✅
- **File**: `src/hooks/useTaskFilters.ts` ✅ Created
- **State Extracted**:
  - ✅ `selectedMembers`
  - ✅ `includeAssignees`, `includeWatchers`, `includeCollaborators`, `includeRequesters`
  - ✅ `includeSystem`
  - ✅ `isSearchActive`
  - ✅ `isAdvancedSearchExpanded`
  - ✅ `searchFilters`
  - ✅ `selectedSprintId`
  - ✅ `currentFilterView`
  - ✅ `sharedFilterViews`
  - ✅ `taskViewMode`
  - ✅ `viewMode`
  - ✅ `filteredColumns`
- **Logic Extracted**:
  - ✅ Filter application logic (`performFiltering` useEffect)
  - ✅ Search logic (`customFilterTasks` function)
  - ✅ Filter view management (all handlers)
  - ✅ `shouldIncludeTask` helper function

**Implementation Notes**:
- Created comprehensive `useTaskFilters` hook with all filter state, logic, and handlers
- Extracted ~500 lines of filtering code from `App.tsx`
- Updated 200+ references throughout `App.tsx` to use `taskFilters.*`
- Fixed all critical filter-related errors
- Hook properly handles user preferences and state synchronization

**Testing Checklist**:
- [ ] Search functionality works correctly
- [ ] Member filtering (assignees, watchers, collaborators, requesters) works
- [ ] Sprint filtering works
- [ ] Filter views (save/load/delete) work
- [ ] Task view mode switching works
- [ ] View mode switching (kanban/list/gantt) works
- [ ] Filtered columns update correctly when tasks change
- [ ] Real-time updates respect filters

---

### Phase 4: Extract WebSocket Handlers (Medium - Medium Risk)
**Difficulty**: ⭐⭐⭐ Medium  
**Risk**: Medium - Critical real-time functionality  
**Estimated Lines Saved**: ~800-1200

#### 4.1 Task WebSocket Handlers
- **File**: `src/hooks/useTaskWebSocket.ts`
- **Handlers to Extract**:
  - `handleTaskCreated`
  - `handleTaskUpdated`
  - `handleTaskDeleted`
  - `handleTaskMoved`
  - `handleTaskRelationshipCreated`
  - `handleTaskRelationshipDeleted`
  - `handleTaskWatcherAdded`
  - `handleTaskWatcherRemoved`
  - `handleTaskCollaboratorAdded`
  - `handleTaskCollaboratorRemoved`
  - `handleTaskTagAdded`
  - `handleTaskTagRemoved`

#### 4.2 Comment WebSocket Handlers
- **File**: `src/hooks/useCommentWebSocket.ts`
- **Handlers to Extract**:
  - `handleCommentCreated`
  - `handleCommentUpdated`
  - `handleCommentDeleted`

#### 4.3 Column WebSocket Handlers
- **File**: `src/hooks/useColumnWebSocket.ts`
- **Handlers to Extract**:
  - `handleColumnCreated`
  - `handleColumnUpdated`
  - `handleColumnDeleted`
  - `handleColumnReordered`

#### 4.4 Board WebSocket Handlers
- **File**: `src/hooks/useBoardWebSocket.ts`
- **Handlers to Extract**:
  - `handleBoardCreated`
  - `handleBoardUpdated`
- **File**: `src/hooks/useBoardWebSocket.ts`
- **Handlers to Extract**:
  - `handleBoardDeleted`
  - `handleBoardReordered`

#### 4.5 Member WebSocket Handlers
- **File**: `src/hooks/useMemberWebSocket.ts`
- **Handlers to Extract**:
  - `handleMemberCreated`
  - `handleMemberUpdated`
  - `handleMemberDeleted`
  - `handleUserProfileUpdated`

#### 4.6 Settings/Tags/Priorities WebSocket Handlers
- **File**: `src/hooks/useSettingsWebSocket.ts`
- **Handlers to Extract**:
  - `handleTagCreated`
  - `handleTagUpdated`
  - `handleTagDeleted`
  - `handlePriorityCreated`
  - `handlePriorityUpdated`
  - `handlePriorityDeleted`
  - `handlePriorityReordered`
  - `handleSettingsUpdated`
  - `handleInstanceStatusUpdated`
  - `handleVersionUpdated`
  - `handleActivityUpdated`
  - `handleFilterCreated`
  - `handleFilterUpdated`
  - `handleFilterDeleted`

#### 4.7 WebSocket Connection Management
- **File**: `src/hooks/useWebSocketConnection.ts`
- **Handlers to Extract**:
  - `handleWebSocketReady`
  - `handleReconnect`
  - `handleDisconnect`
  - `handleBrowserOnline`
  - `handleBrowserOffline`
  - WebSocket connection setup/teardown logic

**Strategy**: Extract handlers in groups, test after each group. Each handler hook should receive necessary state setters as parameters.

---

### Phase 5: Extract Drag and Drop Logic (Medium-Hard - Medium Risk)
**Difficulty**: ⭐⭐⭐⭐ Medium-Hard  
**Risk**: Medium - Complex interaction logic  
**Estimated Lines Saved**: ~500-800

#### 5.1 Drag State Management
- **File**: `src/hooks/useDragState.ts`
- **State to Extract**:
  - `draggedTask`
  - `draggedColumn`
  - `isHoveringBoardTab`
  - `dragPreview`
  - `isTaskMiniMode`
  - `dragStartedRef`
  - `lastWebSocketUpdateRef`
  - `dragCooldownTimeoutRef`
  - `dragCooldown`
  - `taskCreationPause`
  - `boardCreationPause`

#### 5.2 Drag Handlers
- **File**: `src/hooks/useDragHandlers.ts`
- **Handlers to Extract**:
  - `handleDragStart`
  - `handleDragEnd`
  - `handleDragOver`
  - Drag cooldown logic
  - Task/column reordering logic

**Note**: This is complex because it interacts with multiple state variables. Extract carefully and test thoroughly.

---

### Phase 6: Extract Board/Column Management Logic (Medium-Hard - Medium Risk)
**Difficulty**: ⭐⭐⭐⭐ Medium-Hard  
**Risk**: Medium - Core data management  
**Estimated Lines Saved**: ~400-600

#### 6.1 Board Management Hook
- **File**: `src/hooks/useBoardManagement.ts`
- **State to Extract**:
  - `boards`
  - `selectedBoard`
  - `selectedBoardRef`
  - `boardColumnVisibility`
- **Logic to Extract**:
  - Board selection logic
  - Board creation/deletion
  - Board reordering
  - Board column visibility management

#### 6.2 Column Management Hook
- **File**: `src/hooks/useColumnManagement.ts`
- **State to Extract**:
  - `columns`
  - `columnWarnings`
  - `showColumnDeleteConfirm`
- **Logic to Extract**:
  - Column creation/deletion
  - Column reordering
  - Column update logic

---

### Phase 7: Extract Task Management Logic (Hard - Medium Risk)
**Difficulty**: ⭐⭐⭐⭐⭐ Hard  
**Risk**: Medium-High - Core task operations  
**Estimated Lines Saved**: ~600-900

#### 7.1 Task State Management
- **File**: `src/hooks/useTaskManagement.ts`
- **State to Extract**:
  - `selectedTask`
  - `taskDetailsOptions`
  - `animateCopiedTaskId`
  - `pendingCopyAnimation`
  - `availablePriorities`
  - `availableTags`
- **Handlers to Extract**:
  - `handleSelectTask`
  - `handleTaskDelete`
  - Task creation logic
  - Task update logic
  - Task copy logic

**Note**: This is complex because tasks are central to the app. Test thoroughly.

---

### Phase 8: Extract Routing and Navigation Logic (Hard - Medium Risk)
**Difficulty**: ⭐⭐⭐⭐⭐ Hard  
**Risk**: Medium-High - Critical navigation functionality  
**Estimated Lines Saved**: ~300-500

#### 8.1 Routing Hook
- **File**: `src/hooks/useAppRouting.ts`
- **State to Extract**:
  - `currentPage`
  - `resetToken`
  - `activationToken`
  - `activationEmail`
  - `activationParsed`
- **Logic to Extract**:
  - URL hash parsing
  - Page routing logic
  - Board selection from URL
  - Task selection from URL
  - Project routing

**Note**: This interacts heavily with URL state. Test all navigation paths.

---

### Phase 9: Extract Data Loading Logic (Hard - Medium Risk)
**Difficulty**: ⭐⭐⭐⭐⭐ Hard  
**Risk**: Medium - Critical data initialization  
**Estimated Lines Saved**: ~400-600

#### 9.1 Data Loading Hook
- **File**: `src/hooks/useAppDataLoading.ts`
- **Logic to Extract**:
  - Initial data loading (boards, columns, members, priorities, tags)
  - Data refresh logic
  - Polling setup (if still used)
  - Board auto-selection logic
  - Preference loading

**Note**: This is critical for app startup. Test all initialization scenarios.

---

### Phase 10: Split App Component (Hardest - High Risk)
**Difficulty**: ⭐⭐⭐⭐⭐⭐ Very Hard  
**Risk**: High - Core component structure  
**Estimated Lines Saved**: ~500-800

#### 10.1 Create Page Components
- **Files**: 
  - `src/components/pages/KanbanPage.tsx`
  - `src/components/pages/AdminPage.tsx` (if needed)
  - `src/components/pages/ReportsPage.tsx` (if needed)
  - `src/components/pages/TaskPage.tsx` (may already exist)
- **Extract**: Page-specific rendering logic

#### 10.2 Create App Layout Component
- **File**: `src/components/layout/AppLayout.tsx`
- **Extract**: Main layout structure, header, sidebar, etc.

#### 10.3 Simplify App.tsx
- **Keep in App.tsx**:
  - Top-level state coordination
  - Hook composition
  - Router/provider setup
  - Main render logic

**Final App.tsx should be**: ~300-500 lines (coordinating hooks and rendering)

---

## Implementation Strategy

### Testing Checklist for Each Phase:
1. ✅ All existing functionality works
2. ✅ No console errors or warnings
3. ✅ WebSocket events still work
4. ✅ Drag and drop still works
5. ✅ Navigation still works
6. ✅ Filtering/search still works
7. ✅ Real-time updates still work
8. ✅ No performance regressions

### Best Practices:
1. **Extract incrementally** - One hook/utility at a time
2. **Test after each extraction** - Don't batch multiple extractions
3. **Keep state dependencies explicit** - Pass state setters as parameters
4. **Use TypeScript strictly** - Catch type errors early
5. **Document extracted hooks** - Add JSDoc comments
6. **Maintain backward compatibility** - Don't change existing APIs

### Risk Mitigation:
1. **Start with utilities** - No risk, pure functions
2. **Extract isolated state first** - Activity feed, modals, etc.
3. **Extract WebSocket handlers carefully** - Test real-time updates thoroughly
4. **Extract drag/drop last** - Most complex interaction
5. **Keep App.tsx as coordinator** - Don't split too aggressively

---

## Estimated Impact

### Line Count Reduction:
- **Before**: 5920 lines
- **After Phase 1-2**: ~5500 lines (utilities, simple hooks)
- **After Phase 1**: ~5876 lines (constants, utilities extracted)
- **After Phase 2**: ~5576 lines (activity feed, version status, modals, task linking extracted)
- **After Phase 3**: ~5076 lines (filtering and search logic extracted) ✅
- **After Phase 4**: ~4000 lines (WebSocket handlers)
- **After Phase 5-6**: ~3000 lines (drag/drop, board management)
- **After Phase 7-8**: ~2000 lines (task management, routing)
- **After Phase 9-10**: ~500-800 lines (final App.tsx)

### Total Reduction: ~85-90% of original file size

---

## Notes

- **Don't rush**: This is a large refactoring. Take time to test each phase.
- **Use feature flags if needed**: If you need to ship features during refactoring, use feature flags.
- **Keep git history clean**: Make small, focused commits for each extraction.
- **Document as you go**: Update this plan as you complete each phase.
- **Get code review**: Have someone review each extraction before moving to the next.

---

## Code Splitting (Performance Optimization)

**Status**: Phase 1 completed ✅

### Phase 1: Route-Based Code Splitting ✅ COMPLETED
- **Goal**: Reduce login page bundle size by ~70% (from ~2MB to ~600KB)
- **Approach**: Lazy load heavy pages and components
- **Files Modified**:
  - ✅ `src/components/layout/MainLayout.tsx` - Lazy load Admin, Reports, and KanbanPage
  - ✅ `src/App.tsx` - Lazy load TaskPage and ModalManager
  - ✅ `src/components/layout/KanbanPage.tsx` - Lazy load GanttViewV2
  - ✅ `src/components/layout/ModalManager.tsx` - Lazy load TaskDetails, HelpModal, and Profile

**Implementation Notes**:
- All heavy pages are now lazy-loaded using `React.lazy()`
- Wrapped in `Suspense` boundaries with loading fallbacks
- Login page now only loads essential components
- Components load on-demand:
  - Admin, Reports, TaskPage, and GanttViewV2 load when navigated to
  - KanbanPage loads when authenticated user accesses kanban view
  - ModalManager and its modals (TaskDetails, HelpModal, Profile) load when needed
- Significant reduction in initial bundle size observed in development

**Results**:
- ✅ Login page bundle significantly reduced (user confirmed "big improvement")
- ✅ Initial load time improved
- ✅ Components load only when needed
- ✅ Better code organization and maintainability

**See `CODE_SPLITTING_PLAN.md` for detailed implementation plan.**

---

## Success Criteria

✅ App.tsx is under 1000 lines  
✅ All functionality works as before  
✅ No performance regressions  
✅ Code is more maintainable  
✅ Each hook has a single responsibility  
✅ TypeScript types are strict and correct  
✅ Tests pass (if you have tests)

---

**Last Updated**: 2025-01-XX  
**Status**: 
- ✅ Phase 1-4 Completed (Constants, Utilities, Simple Hooks, Filters, WebSocket Handlers)
- ✅ Code Splitting Phase 1 Completed (Route-based lazy loading with additional component-level optimizations)
- ⏳ Phase 5-10 Pending (App.tsx refactoring continuation)

