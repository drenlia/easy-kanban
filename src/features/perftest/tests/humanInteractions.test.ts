import api from '../../../api';
import { Board, Task, Column } from '../../../types';

/**
 * Human Interactions Test
 * Simulates realistic user interactions: move/edit/delete tasks, columns, boards, relationships
 */

export async function runHumanInteractionsTest() {
  const actions: string[] = [];
  const startTime = performance.now();

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
    }

    // Test 4: Update a column
    await api.put(`/columns/${sourceColumn.id}`, {
      ...sourceColumn,
      title: `${sourceColumn.title} (test)`
    });
    actions.push('Updated column');

    // Test 5: Reorder tasks
    if (tasks.length >= 2) {
      const updates = tasks.slice(0, 3).map((t, index) => ({
        id: t.id,
        position: index,
        columnId: t.columnId
      }));
      await api.post('/tasks/batch-update-positions', { updates });
      actions.push('Reordered tasks');
    }

    // Test 6: Delete a task relationship (if we created one)
    if (tasks.length >= 2) {
      const relationshipsResponse = await api.get(`/tasks/${task.id}/relationships`);
      const relationships = relationshipsResponse.data;
      if (relationships.length > 0) {
        await api.delete(`/tasks/${task.id}/relationships/${relationships[0].id}`);
        actions.push('Deleted task relationship');
      }
    }

    // Restore original column title
    await api.put(`/columns/${sourceColumn.id}`, {
      ...sourceColumn,
      title: sourceColumn.title.replace(' (test)', '')
    });

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
    throw new Error(`Human interactions test failed: ${error.message}`);
  }
}

