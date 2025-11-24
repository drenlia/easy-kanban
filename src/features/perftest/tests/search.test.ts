import api from '../../../api';
import { filterTasks } from '../../../utils/taskUtils';

/**
 * Search/Filter Performance Test
 * Tests search and filtering with large dataset
 */

export async function runSearchTest() {
  const startTime = performance.now();
  const searchQueries = ['test', 'task', 'project', 'urgent', 'completed'];

  try {
    // Get boards
    const boardsResponse = await api.get('/boards');
    const boards = boardsResponse.data;
    
    if (boards.length === 0) {
      throw new Error('No boards found');
    }

    const board = boards[0];
    const results: any[] = [];

    // Get all tasks first (baseline)
    const allTasksStart = performance.now();
    const allTasksResponse = await api.get(`/tasks/by-board/${board.id}`);
    const allTasks = allTasksResponse?.data || [];
    const allTasksDuration = performance.now() - allTasksStart;
    
    results.push({
      type: 'baseline',
      operation: 'getAll',
      duration: allTasksDuration,
      resultsCount: allTasks.length
    });

    // Test 1: Client-side search (simulating app behavior)
    for (const query of searchQueries) {
      const searchStart = performance.now();
      const filteredTasks = filterTasks(allTasks, { text: query }, true);
      const searchDuration = performance.now() - searchStart;
      
      results.push({
        type: 'search',
        query,
        duration: searchDuration,
        resultsCount: filteredTasks.length
      });
    }

    // Test 2: Filter by column (client-side)
    const columnsResponse = await api.get(`/boards/${board.id}/columns`);
    const columns = columnsResponse.data;
    
    if (columns.length > 0) {
      const filterStart = performance.now();
      const filteredTasks = allTasks.filter(task => task.columnId === columns[0].id);
      const filterDuration = performance.now() - filterStart;
      
      results.push({
        type: 'filter',
        filter: 'column',
        duration: filterDuration,
        resultsCount: filteredTasks.length
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    const avgSearchTime = results
      .filter(r => r.type === 'search')
      .reduce((sum, r) => sum + r.duration, 0) / searchQueries.length;

    return {
      duration,
      message: `Completed ${results.length} search/filter operations`,
      details: {
        searchQueries: searchQueries.length,
        avgSearchTime: Math.round(avgSearchTime),
        totalTasks: allTasks.length,
        results
      }
    };
  } catch (error: any) {
    throw new Error(`Search test failed: ${error.message}`);
  }
}

