# Tasks.js Restoration Plan

The file `server/utils/sqlManager/tasks.js` was accidentally overwritten and needs to be restored.

## Functions That Need to Be Restored

Based on grep results from `server/routes/tasks.js`, these functions are being called:

1. `getTaskWithRelationships(db, taskId)` - Line 94
2. `getTasksByIds(db, taskIds)` - Line 175
3. `getOppositeRelationship(db, taskId, relationship, targetId)` - Line 407
4. `getTaskTicket(db, taskId)` - Lines 410, 411, 425
5. `generateTaskTicket(db, prefix)` - Line 432
6. `getAllTasks(db)` - Line 497
7. `getTaskByTicket(db, ticket)` - Line 530
8. `getTaskTags(db, taskId)` - Line 584
9. `createTask(db, taskData)` - Lines 675, 811, 1011
10. `incrementTaskPositions(db, columnId)` - Lines 810, 2499
11. `getTaskById(db, taskId)` - Lines 1118, 1262, 1753
12. `getTaskWithBoardColumnInfo(db, taskId)` - Line 1261
13. `updateTask(db, taskId, updates)` - Line 1384
14. `getTasksByIdsBasic(db, taskIds)` - Lines 1597, 1907
15. `deleteTask(db, taskId)` - Line 1814
16. `getRemainingTasksInColumn(db, columnId, boardId)` - Line 1825
17. `getTasksByBoard(db, boardId)` - Line 2607
18. `getTaskBoardId(db, taskId)` - Line 2626
19. `updateTaskPositionAndColumn(db, taskId, position, columnId)` - Line 2502
20. `getTasksForColumns(db, columnIds)` - Called from boards.js line 39
21. `getTasksForColumn(db, columnId)` - Full version with relationships

## New Functions Added (Keep These)
- `renumberTasksInColumn(db, columnId)` - NEW
- `shouldRenumberTasksInColumn(db, columnId)` - NEW
- `getTasksForColumnBasic(db, columnId)` - NEW (simplified version for renumbering)

## Next Steps
1. Restore all missing functions from backup or reconstruct from codebase
2. Keep the new renumbering functions
3. Test all endpoints to ensure they work
