import api from '../../../api';

/**
 * Backend performance tests
 * These tests call backend APIs and measure response time
 */

export async function runDemoContentTest() {
  const response = await api.post('/admin/perftest/demo-content');
  return response.data;
}

export async function runTagsTest() {
  const response = await api.post('/admin/perftest/tags');
  return response.data;
}

export async function runSprintsTest() {
  const response = await api.post('/admin/perftest/sprints');
  return response.data;
}

export async function runBulkTasksTest() {
  const response = await api.post('/admin/perftest/bulk-tasks', { count: 50 });
  return response.data;
}

export async function runDeleteAllContentTest() {
  const response = await api.post('/admin/perftest/delete-all-content');
  return response.data;
}

