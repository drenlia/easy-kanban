import api from '../../../api';
import { deleteTag, deleteSprint, updateTask, getTaskById } from '../../../api';

/**
 * Backend performance tests
 * These tests call backend APIs and measure response time
 */

// Store created IDs for cleanup
let createdTagIds: number[] = [];
let createdSprintIds: string[] = [];
let assignedTaskIds: string[] = [];

export async function runDemoContentTest() {
  const response = await api.post('/admin/perftest/demo-content');
  return response.data;
}

export async function runTagsTest() {
  // Clean up any previous tags first
  await cleanupTags();
  
  try {
    const response = await api.post('/admin/perftest/tags');
    // Store created tag IDs for cleanup
    if (response.data.createdTagIds) {
      createdTagIds = response.data.createdTagIds;
    }
    
    // Clean up immediately after test (for rerun capability)
    await cleanupTags();
    
    return {
      ...response.data,
      message: response.data.message + ' (cleaned up)'
    };
  } catch (error) {
    // Clean up on error
    await cleanupTags();
    throw error;
  }
}

export async function runSprintsTest() {
  // Clean up any previous sprints first
  await cleanupSprints();
  
  try {
    const response = await api.post('/admin/perftest/sprints');
    // Store created sprint IDs and assigned task IDs for cleanup
    if (response.data.createdSprintIds) {
      createdSprintIds = response.data.createdSprintIds;
    }
    if (response.data.assignedTaskIds) {
      assignedTaskIds = response.data.assignedTaskIds;
    }
    
    // Clean up immediately after test (for rerun capability)
    await cleanupSprints();
    
    return {
      ...response.data,
      message: response.data.message + ' (cleaned up)'
    };
  } catch (error) {
    // Clean up on error
    await cleanupSprints();
    throw error;
  }
}

export async function runBulkTasksTest() {
  const response = await api.post('/admin/perftest/bulk-tasks', { count: 50 });
  return response.data;
}

export async function runDeleteAllContentTest() {
  const response = await api.post('/admin/perftest/delete-all-content');
  // Clear stored IDs after delete all
  createdTagIds = [];
  createdSprintIds = [];
  assignedTaskIds = [];
  return response.data;
}

// Cleanup functions
export async function cleanupTags() {
  if (createdTagIds.length === 0) return;
  
  try {
    // Delete tags (this will cascade delete task_tags associations)
    for (const tagId of createdTagIds) {
      try {
        await deleteTag(tagId);
      } catch (error) {
        // Ignore individual delete errors (tag might already be deleted)
      }
    }
    createdTagIds = [];
  } catch (error) {
    console.error('Error cleaning up tags:', error);
  }
}

export async function cleanupSprints() {
  try {
    // Unassign tasks from sprints first
    if (assignedTaskIds.length > 0) {
      for (const taskId of assignedTaskIds) {
        try {
          // Get the task first to get full object, then update with sprintId: null
          const task = await getTaskById(taskId);
          if (task) {
            await updateTask({ ...task, sprintId: null });
          }
        } catch (error) {
          // Ignore individual update errors (task might not exist)
        }
      }
      assignedTaskIds = [];
    }
    
    // Delete sprints
    if (createdSprintIds.length > 0) {
      for (const sprintId of createdSprintIds) {
        try {
          await deleteSprint(sprintId);
        } catch (error) {
          // Ignore individual delete errors (sprint might already be deleted)
        }
      }
      createdSprintIds = [];
    }
  } catch (error) {
    console.error('Error cleaning up sprints:', error);
  }
}

// Auto-cleanup before running tests
export async function cleanupBeforeTest() {
  await cleanupTags();
  await cleanupSprints();
}

