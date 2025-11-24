import api from '../../../api';

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

    // Test 1: Search tasks
    for (const query of searchQueries) {
      const searchStart = performance.now();
      const searchResponse = await api.get(`/boards/${board.id}/tasks?search=${query}`);
      const searchDuration = performance.now() - searchStart;
      
      results.push({
        type: 'search',
        query,
        duration: searchDuration,
        resultsCount: searchResponse.data.length
      });
    }

    // Test 2: Filter by status (if we have columns)
    const columnsResponse = await api.get(`/boards/${board.id}/columns`);
    const columns = columnsResponse.data;
    
    if (columns.length > 0) {
      const filterStart = performance.now();
      const filterResponse = await api.get(`/boards/${board.id}/tasks?columnId=${columns[0].id}`);
      const filterDuration = performance.now() - filterStart;
      
      results.push({
        type: 'filter',
        filter: 'column',
        duration: filterDuration,
        resultsCount: filterResponse.data.length
      });
    }

    // Test 3: Get all tasks (baseline)
    const allTasksStart = performance.now();
    const allTasksResponse = await api.get(`/boards/${board.id}/tasks`);
    const allTasksDuration = performance.now() - allTasksStart;
    
    results.push({
      type: 'baseline',
      operation: 'getAll',
      duration: allTasksDuration,
      resultsCount: allTasksResponse.data.length
    });

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
        totalTasks: allTasksResponse.data.length,
        results
      }
    };
  } catch (error: any) {
    throw new Error(`Search test failed: ${error.message}`);
  }
}

