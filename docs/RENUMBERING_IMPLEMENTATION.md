# Task Position Renumbering Implementation

## Problem
When tasks are moved using fractional positions, positions can get too close together (< 0.1) or collide (same position), causing sorting issues.

Example:
- task1: position 0
- task2: position 1  
- task3: position 2
- task4: position 3

Move task2 under task3 → task2 becomes 2.5
- task1: 0
- task3: 2
- task2: 2.5
- task4: 3

Move task3 under task2 → both would have 2.5 (collision!)

## Solution
Renumber tasks to sequential integers (0, 1, 2, 3...) when positions get too close or collide.

## Implementation

### Backend Functions (server/utils/sqlManager/tasks.js)
1. `shouldRenumberTasksInColumn(db, columnId)` - Checks if positions are too close (< 0.1) or collide
2. `renumberTasksInColumn(db, columnId)` - Renumbers all tasks in a column to sequential integers

### When Renumbering Happens
**After batch-update-positions completes** - The backend automatically checks each affected column and renumbers if needed. This ensures:
- Frontend and backend stay 100% in sync
- Renumbering happens server-side (single source of truth)
- WebSocket events notify frontend of new positions
- No UI flicker (WebSocket updates happen after API response)

### Frontend Changes
- Frontend uses fractional positions for moves (preserves precision)
- Frontend receives WebSocket updates with renumbered positions
- Frontend sorts by position (handles both fractional and integer positions)

## Critical Note
⚠️ **server/utils/sqlManager/tasks.js was accidentally overwritten** and needs to be restored. The file should contain:
- getTaskWithRelationships
- getTasksForColumn (full version)
- getTasksForColumns
- getAllTasks
- createTask
- getTaskById
- getTasksByIds
- getTasksByIdsBasic
- incrementTaskPositions
- getTaskTicket
- generateTaskTicket
- getTaskByTicket
- getTaskTags
- getOppositeRelationship
- And many more...

The renumbering functions were added but the file structure was lost. These need to be restored from a backup or recreated.
