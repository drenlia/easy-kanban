# Code Splitting Implementation Plan

## Current Problem
All components are statically imported, causing:
- **Login page loads ~2MB+ of unused code** (Admin, Reports, Gantt, TaskDetails, TipTap, etc.)
- **Slow initial load** (~3-5 seconds on slow connections)
- **Wasted bandwidth** for users who may never visit Admin or Reports
- **Poor user experience** on login page

## Recommended Strategy: Tiered Code Splitting

### Tier 1: Critical Path (Load Immediately) ✅
**Keep static imports:**
- `Login`, `ForgotPassword`, `ResetPassword`, etc. (auth pages)
- `Header`, `MainLayout` (skeleton)
- Core hooks: `useAuth`, `useVersionStatus`, `useModalState`
- Core utilities: `api.ts`, `toast.tsx`, `userPreferences.ts`

### Tier 2: Route-Based Splitting (Lazy Load Pages) 🎯 **START HERE**
**Convert to lazy imports:**
- `Admin` - Heavy component with many tabs (~500KB+)
- `Reports` - Multiple report components with Recharts (~400KB+)
- `TaskPage` - Separate route, includes TaskDetails (~600KB+)
- `GanttViewV2` - Heavy charting component (~300KB+)

**Expected Impact:**
- Login page: **~70% smaller** (from ~2MB to ~600KB)
- Initial load: **~2-3x faster**
- Admin/Reports/TaskPage: Load only when navigated to

### Tier 3: Component-Based Splitting (Lazy Load Heavy Components)
**Lazy load within pages:**
- `TaskDetails` - Only when task is selected (includes TipTap editor)
- `TextEditor` - Only when editing (TipTap is ~200KB)
- Admin tabs - Load on demand
- Report components - Load when specific report is viewed

**Expected Impact:**
- Kanban page: **~30% smaller** initial load
- TaskDetails: Loads only when needed

### Tier 4: Library Splitting (Split Heavy Third-Party Libs)
**Dynamic imports for libraries:**
- TipTap extensions - Only when editing
- Recharts - Only in Reports/Gantt
- XLSX - Only when exporting
- Socket.IO - Already loaded, but could be deferred

**Expected Impact:**
- Further reduce bundle sizes by ~200-300KB

## Implementation Steps

### Phase 1: Route-Based Splitting (Recommended First Step)

#### Step 1.1: Lazy Load Admin Component
**File: `src/components/layout/MainLayout.tsx`**
```typescript
import React, { Suspense } from 'react';
import KanbanPage from './KanbanPage';

// Lazy load heavy pages
const Admin = React.lazy(() => import('../Admin'));
const Reports = React.lazy(() => import('../Reports'));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

const MainLayout: React.FC<MainLayoutProps> = ({
  currentPage,
  ...props
}) => {
  return (
    <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-4/5 mx-auto">
        <Suspense fallback={<PageLoader />}>
          {currentPage === 'admin' ? (
            <Admin 
              key={props.adminRefreshKey}
              currentUser={props.currentUser} 
              onUsersChanged={props.onUsersChanged}
              onSettingsChanged={props.onSettingsChanged}
            />
          ) : currentPage === 'reports' ? (
            <Reports currentUser={props.currentUser} />
          ) : (
            <KanbanPage {...props} />
          )}
        </Suspense>
      </div>
    </div>
  );
};
```

#### Step 1.2: Lazy Load TaskPage
**File: `src/App.tsx`**
```typescript
// Replace static import:
// import TaskPage from './components/TaskPage';

// With lazy import:
const TaskPage = React.lazy(() => import('./components/TaskPage'));

// Then wrap in Suspense:
if (currentPage === 'task') {
  return (
    <ThemeProvider>
      <TourProvider currentUser={currentUser}>
        <Suspense fallback={<PageLoader />}>
          <TaskPage {...props} />
        </Suspense>
      </TourProvider>
    </ThemeProvider>
  );
}
```

#### Step 1.3: Lazy Load GanttViewV2
**File: `src/components/layout/KanbanPage.tsx`** (or wherever GanttViewV2 is imported)
```typescript
const GanttViewV2 = React.lazy(() => import('../GanttViewV2'));

// Wrap usage in Suspense when viewMode === 'gantt'
```

### Phase 2: Component-Based Splitting (Optional, After Phase 1)

#### Step 2.1: Lazy Load TaskDetails
**File: `src/components/layout/KanbanPage.tsx` or `MainLayout.tsx`**
```typescript
const TaskDetails = React.lazy(() => import('../TaskDetails'));

// Only load when selectedTask is set
{selectedTask && (
  <Suspense fallback={<TaskDetailsSkeleton />}>
    <TaskDetails task={selectedTask} ... />
  </Suspense>
)}
```

#### Step 2.2: Lazy Load TextEditor
**File: `src/components/TaskDetails.tsx`**
```typescript
const TextEditor = React.lazy(() => import('../TextEditor'));

// Load only when editing
{isEditing && (
  <Suspense fallback={<TextEditorSkeleton />}>
    <TextEditor ... />
  </Suspense>
)}
```

### Phase 3: Library Splitting (Advanced, Optional)

#### Step 3.1: Dynamic Import TipTap
```typescript
// In TextEditor or TaskDetails
const loadTipTap = async () => {
  const { default: TextEditor } = await import('../TextEditor');
  return TextEditor;
};
```

#### Step 3.2: Dynamic Import Recharts
```typescript
// In Reports components
const loadReport = async (reportType: string) => {
  switch (reportType) {
    case 'burndown':
      return await import('./reports/BurndownReport');
    // ...
  }
};
```

## Expected Results

### Before Code Splitting
- **Login page bundle**: ~2.0MB
- **Initial load time**: 3-5 seconds (slow connection)
- **All components loaded**: Yes (even unused ones)

### After Phase 1 (Route-Based Splitting)
- **Login page bundle**: ~600KB (**70% reduction**)
- **Initial load time**: 1-2 seconds (**2-3x faster**)
- **Admin page**: Loads on demand (~500KB when navigated)
- **Reports page**: Loads on demand (~400KB when navigated)
- **TaskPage**: Loads on demand (~600KB when navigated)

### After Phase 2 (Component-Based Splitting)
- **Kanban page**: ~30% smaller
- **TaskDetails**: Loads only when task selected
- **TextEditor**: Loads only when editing

### After Phase 3 (Library Splitting)
- **Further 200-300KB reduction**
- **Libraries load only when needed**

## Implementation Priority

1. **✅ Phase 1 (Route-Based)** - **HIGHEST PRIORITY**
   - Biggest impact
   - Easiest to implement
   - Low risk
   - **Recommended to start here**

2. **Phase 2 (Component-Based)** - Medium priority
   - Good optimization
   - More complex
   - Can be done incrementally

3. **Phase 3 (Library Splitting)** - Low priority
   - Advanced optimization
   - More complex
   - Diminishing returns

## Best Practices

1. **Use Suspense boundaries** - Always wrap lazy components
2. **Provide loading fallbacks** - Better UX than blank screen
3. **Preload on hover** - For better perceived performance
4. **Monitor bundle sizes** - Use `vite-bundle-visualizer`
5. **Test on slow connections** - Ensure good UX

## Migration Notes

- **No breaking changes** - Lazy loading is transparent to components
- **Backward compatible** - Can be done incrementally
- **Easy to rollback** - Just change imports back
- **TypeScript support** - Full type safety maintained

## Next Steps

1. Start with Phase 1, Step 1.1 (Lazy load Admin)
2. Test thoroughly
3. Continue with remaining Phase 1 steps
4. Measure improvements
5. Decide if Phase 2/3 are needed

