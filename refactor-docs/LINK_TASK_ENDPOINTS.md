# Link Task Functionality - Complete Endpoint List

## UI Flow Overview
1. User clicks link button on Task A → `handleLinkMouseDown` fires
2. User drags mouse (beyond 5px threshold) → `onStartLinking` called → Linking mode activated
3. User hovers over link button on Task B → `onLinkToolHover` called → Loads relationships for Task B
4. User releases mouse on Task B → `onFinishLinking` called → Creates relationship
5. After relationship created → Board relationships reloaded

## Backend API Endpoints

### 1. **POST `/api/tasks/:taskId/relationships`** - Create Task Relationship
   - **Purpose**: Creates a relationship between two tasks
   - **Method**: POST
   - **Route**: `server/routes/tasks.js:1665`
   - **Auth**: `authenticateToken` ✓
   - **Called from**: `src/App.tsx:handleFinishLinking` (line 1196)
   - **Request Body**:
     ```json
     {
       "relationship": "parent" | "child" | "related",
       "toTaskId": "target-task-id"
     }
     ```
   - **Response**: `{ success: true, message: 'Task relationship created successfully' }`
   - **Status**: ✅ Fixed - Added `await` to `checkForCycles()` call (line 1702)

### 2. **GET `/api/tasks/:taskId/relationships`** - Get Task Relationships
   - **Purpose**: Gets all relationships for a specific task
   - **Method**: GET
   - **Route**: `server/routes/tasks.js:1629`
   - **Auth**: `authenticateToken` ✓
   - **Called from**: 
     - `src/App.tsx:handleLinkToolHover` (line 1288) - When hovering over link button
     - `src/components/TaskDetails.tsx` (line 269) - When loading task details
     - `src/components/TaskPage.tsx` (line 208) - When loading task page
   - **Response**: Array of relationship objects
   - **Status**: ✅ All `wrapQuery` calls properly awaited

### 3. **GET `/api/tasks/:taskId/available-for-relationship`** - Get Available Tasks
   - **Purpose**: Gets list of tasks that can be linked (excludes current task and already related tasks)
   - **Method**: GET
   - **Route**: `server/routes/tasks.js:1861`
   - **Auth**: `authenticateToken` ✓
   - **Called from**: 
     - `src/components/TaskDetails.tsx` (line 296, 770, 826) - When loading/managing child tasks
   - **Response**: Array of available task objects
   - **Status**: ✅ Fixed - Added `await` to `wrapQuery` call (line 1868)

### 4. **DELETE `/api/tasks/:taskId/relationships/:relationshipId`** - Delete Task Relationship
   - **Purpose**: Deletes a relationship between two tasks
   - **Method**: DELETE
   - **Route**: `server/routes/tasks.js:1794`
   - **Auth**: `authenticateToken` ✓ (Fixed)
   - **Called from**: 
     - `src/components/TaskDetails.tsx:handleRemoveChildTask` (line 796)
   - **Response**: `{ success: true, message: 'Task relationship deleted successfully' }`
   - **Status**: ✅ Fixed - Added `authenticateToken` and `await` to all `wrapQuery` calls (lines 1810, 1816, 1820)

### 5. **GET `/api/boards/:boardId/relationships`** - Get Board Relationships
   - **Purpose**: Gets all relationships for tasks in a board (for visualization)
   - **Method**: GET
   - **Route**: `server/routes/boards.js:406`
   - **Auth**: `authenticateToken` ✓
   - **Called from**: 
     - `src/App.tsx` (line 1776) - When board is selected/loaded
   - **Response**: Array of relationship objects
   - **Status**: ✅ All `wrapQuery` calls properly awaited

## Frontend API Functions (src/api.ts)

1. **`getTaskRelationships(taskId)`** → `GET /api/tasks/:taskId/relationships`
2. **`getAvailableTasksForRelationship(taskId)`** → `GET /api/tasks/:taskId/available-for-relationship`
3. **`addTaskRelationship(taskId, relationship, toTaskId)`** → `POST /api/tasks/:taskId/relationships`
4. **`removeTaskRelationship(taskId, relationshipId)`** → `DELETE /api/tasks/:taskId/relationships/:relationshipId`
5. **`getBoardTaskRelationships(boardId)`** → `GET /api/boards/:boardId/relationships`

## UI Event Flow

### Step 1: Click Link Button
- **Component**: `TaskCardToolbar.tsx`
- **Handler**: `handleLinkMouseDown` (line 110)
- **Action**: Sets `isDragPrepared = true`, stores mouse position
- **No API call** at this stage

### Step 2: Drag Detection
- **Component**: `TaskCardToolbar.tsx`
- **Handler**: `useEffect` with global mouse move listener (line 125)
- **Action**: If drag > 5px threshold, calls `onStartLinking(task, startPosition)`
- **No API call** at this stage

### Step 3: Start Linking Mode
- **Component**: `App.tsx`
- **Handler**: `handleStartLinking` (line 1153)
- **Action**: Sets linking mode state, stores source task
- **No API call** at this stage

### Step 4: Hover Over Link Button (Optional)
- **Component**: `TaskCardToolbar.tsx`
- **Handler**: `onMouseEnter` → `onLinkToolHover?.(task)` (line 378)
- **Component**: `App.tsx`
- **Handler**: `handleLinkToolHover` (line 1282)
- **API Call**: `GET /api/tasks/:taskId/relationships` (if not cached)
- **Purpose**: Load relationships to show visual indicators

### Step 5: Release Mouse on Target Task
- **Component**: `TaskCard.tsx`
- **Handler**: `onMouseUp` (line 1225)
- **Action**: Calls `onFinishLinking(task)` if different task
- **Component**: `App.tsx`
- **Handler**: `handleFinishLinking` (line 1180)
- **API Call**: `POST /api/tasks/:taskId/relationships` (line 1196)
- **Purpose**: Create the relationship

### Step 6: After Relationship Created
- **WebSocket Event**: `task-relationship-created` published
- **Component**: `useTaskWebSocket.ts`
- **Handler**: `handleTaskRelationshipCreated` (line 699)
- **API Call**: `GET /api/boards/:boardId/relationships` (line 714)
- **Purpose**: Reload board relationships for visualization

## Potential Issues to Check

1. **Button Click Not Working**: Check if `onStartLinking` prop is passed correctly
2. **Drag Detection Not Working**: Check if mouse events are being blocked
3. **API Call Failing**: Check browser console for errors, verify authentication token
4. **Relationship Not Created**: Check backend logs for errors in `checkForCycles` or transaction
5. **Visual Feedback Missing**: Check if `handleLinkToolHover` is loading relationships correctly

## All Fixed Issues

✅ **POST `/api/tasks/:taskId/relationships`**:
   - Added `await` to `checkForCycles()` call (line 1702)

✅ **DELETE `/api/tasks/:taskId/relationships/:relationshipId`**:
   - Added missing `authenticateToken` middleware
   - Added `await` to all `wrapQuery` calls (lines 1810, 1816, 1820)

✅ **GET `/api/tasks/:taskId/available-for-relationship`**:
   - Added `await` to `wrapQuery` call (line 1868)

