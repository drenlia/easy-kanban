import api from '../../../api';
import { Board, Task, Column } from '../../../types';

/**
 * Human Interactions Test
 * Simulates realistic user interactions: move/edit/delete tasks, columns, boards, relationships
 */

export async function runHumanInteractionsTest() {
  const actions: string[] = [];
  const startTime = performance.now();
  
  // Store original state for restoration
  let originalTaskState: Task | null = null;
  let originalTaskPositions: Array<{ taskId: string; position: number; columnId: string }> = [];
  let createdRelationshipId: string | null = null;

  try {
    // Get boards
    const boardsResponse = await api.get('/boards');
    const boards: Board[] = boardsResponse.data;
    
    if (boards.length === 0) {
      throw new Error('No boards found');
    }

    const board = boards[0];
    actions.push('Fetched boards');

    // Get columns
    const columnsResponse = await api.get(`/boards/${board.id}/columns`);
    const columns: Column[] = columnsResponse.data;
    
    if (columns.length < 2) {
      throw new Error('Need at least 2 columns for testing');
    }

    actions.push('Fetched columns');

    // Get tasks
    const tasksResponse = await api.get(`/tasks/by-board/${board.id}`);
    const tasks: Task[] = tasksResponse.data;
    
    if (tasks.length === 0) {
      throw new Error('No tasks found for testing');
    }

    actions.push('Fetched tasks');

    const task = tasks[0];
    const sourceColumn = columns[0];
    const targetColumn = columns[1];
    
    // Store original task state
    originalTaskState = { ...task };
    originalTaskPositions = tasks.slice(0, 3).map(t => ({
      taskId: t.id,
      position: t.position || 0,
      columnId: t.columnId
    }));

    // Test 1: Move a task between columns
    await api.put(`/tasks/${task.id}`, {
      ...task,
      columnId: targetColumn.id,
      position: 0
    });
    actions.push('Moved task between columns');

    // Test 2: Edit a task
    await api.put(`/tasks/${task.id}`, {
      ...task,
      title: `${task.title} (edited)`,
      description: `${task.description || ''}\n\nEdited during performance test`
    });
    actions.push('Edited task');

    // Test 3: Create a task relationship (if we have at least 2 tasks)
    if (tasks.length >= 2) {
      const task2 = tasks[1];
      await api.post(`/tasks/${task.id}/relationships`, {
        relationship: 'related',
        toTaskId: task2.id
      });
      actions.push('Created task relationship');
      
      // Get the relationship ID for cleanup
      const relationshipsResponse = await api.get(`/tasks/${task.id}/relationships`);
      const relationships = relationshipsResponse.data;
      if (relationships.length > 0) {
        createdRelationshipId = relationships[relationships.length - 1].id;
      }
    }

    // Test 4: Update a column
    await api.put(`/columns/${sourceColumn.id}`, {
      title: `${sourceColumn.title} (test)`,
      is_finished: sourceColumn.is_finished,
      is_archived: sourceColumn.is_archived
    });
    actions.push('Updated column');

    // Test 5: Reorder tasks
    if (tasks.length >= 2) {
      const updates = tasks.slice(0, 3).map((t, index) => ({
        taskId: t.id,
        position: index,
        columnId: t.columnId
      }));
      await api.post('/tasks/batch-update-positions', { updates });
      actions.push('Reordered tasks');
    }

    // Restore original state
    actions.push('Restoring original state...');
    
    // Restore original column title
    await api.put(`/columns/${sourceColumn.id}`, {
      title: sourceColumn.title,
      is_finished: sourceColumn.is_finished,
      is_archived: sourceColumn.is_archived
    });
    actions.push('Restored column title');
    
    // Restore original task state
    if (originalTaskState) {
      await api.put(`/tasks/${originalTaskState.id}`, {
        ...originalTaskState,
        title: originalTaskState.title.replace(' (edited)', ''),
        description: originalTaskState.description?.replace('\n\nEdited during performance test', '') || originalTaskState.description
      });
      actions.push('Restored task title and description');
    }
    
    // Restore original task positions
    if (originalTaskPositions.length > 0) {
      await api.post('/tasks/batch-update-positions', { updates: originalTaskPositions });
      actions.push('Restored task positions');
    }
    
    // Delete created relationship
    if (createdRelationshipId) {
      try {
        await api.delete(`/tasks/${task.id}/relationships/${createdRelationshipId}`);
        actions.push('Deleted created relationship');
      } catch (error) {
        // Relationship might have been deleted already, ignore
      }
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    return {
      duration,
      message: `Completed ${actions.length} actions`,
      actions,
      details: {
        tasksProcessed: Math.min(tasks.length, 3),
        columnsProcessed: 2
      }
    };
  } catch (error: any) {
    // Try to restore state even on error
    if (originalTaskState) {
      try {
        await api.put(`/tasks/${originalTaskState.id}`, {
          ...originalTaskState,
          title: originalTaskState.title.replace(' (edited)', ''),
          description: originalTaskState.description?.replace('\n\nEdited during performance test', '') || originalTaskState.description
        });
      } catch (restoreError) {
        // Ignore restore errors
      }
    }
    if (originalTaskPositions.length > 0) {
      try {
        await api.post('/tasks/batch-update-positions', { updates: originalTaskPositions });
      } catch (restoreError) {
        // Ignore restore errors
      }
    }
    if (createdRelationshipId && originalTaskState) {
      try {
        await api.delete(`/tasks/${originalTaskState.id}/relationships/${createdRelationshipId}`);
      } catch (restoreError) {
        // Ignore restore errors
      }
    }
    
    throw new Error(`Human interactions test failed: ${error.message}`);
  }
}

