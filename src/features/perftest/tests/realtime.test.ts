import api from '../../../api';
import websocketClient from '../../../services/websocketClient';

/**
 * Real-time Update Stress Test
 * Triggers many rapid updates and measures WebSocket broadcast latency
 */

export async function runRealtimeTest() {
  const startTime = performance.now();
  const updateCount = 20;
  const latencies: number[] = [];

  try {
    // Get a board and tasks
    const boardsResponse = await api.get('/boards');
    const boards = boardsResponse.data;
    
    if (boards.length === 0) {
      throw new Error('No boards found');
    }

    const board = boards[0];
    const tasksResponse = await api.get(`/boards/${board.id}/tasks`);
    const tasks = tasksResponse.data;
    
    if (tasks.length === 0) {
      throw new Error('No tasks found for testing');
    }

    // Set up WebSocket listener to measure latency
    let receivedUpdates = 0;
    const updateTimes = new Map<string, number>();

    const updateListener = (data: any) => {
      const taskId = data.task?.id;
      if (taskId && updateTimes.has(taskId)) {
        const sentTime = updateTimes.get(taskId)!;
        const latency = performance.now() - sentTime;
        latencies.push(latency);
        receivedUpdates++;
      }
    };

    websocketClient.onTaskUpdated(updateListener);

    // Perform rapid updates
    const task = tasks[0];
    for (let i = 0; i < updateCount; i++) {
      const updateStartTime = performance.now();
      updateTimes.set(task.id, updateStartTime);

      await api.put(`/tasks/${task.id}`, {
        ...task,
        title: `${task.title} (update ${i + 1})`
      });

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Wait for all updates to be received (with timeout)
    const maxWaitTime = 5000; // 5 seconds
    const waitStart = performance.now();
    while (receivedUpdates < updateCount && (performance.now() - waitStart) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up listener
    websocketClient.offTaskUpdated(updateListener);

    // Restore original task title
    await api.put(`/tasks/${task.id}`, {
      ...task,
      title: task.title.replace(/ \(update \d+\)/g, '')
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    return {
      duration,
      message: `Received ${receivedUpdates}/${updateCount} updates`,
      details: {
        updatesSent: updateCount,
        updatesReceived: receivedUpdates,
        avgLatency: Math.round(avgLatency),
        minLatency: Math.round(minLatency),
        maxLatency: Math.round(maxLatency),
        latencies: latencies.slice(0, 10) // Sample of first 10 latencies
      }
    };
  } catch (error: any) {
    throw new Error(`Real-time test failed: ${error.message}`);
  }
}

