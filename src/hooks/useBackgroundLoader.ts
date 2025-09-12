import { useCallback, useRef } from 'react';

interface BackgroundTask {
  id: string;
  task: () => Promise<void> | void;
  priority: 'high' | 'medium' | 'low';
}

interface UseBackgroundLoaderOptions {
  timeout?: number; // Fallback timeout for requestIdleCallback (default: 5000ms)
}

export const useBackgroundLoader = (options: UseBackgroundLoaderOptions = {}) => {
  const { timeout = 5000 } = options;
  
  const taskQueueRef = useRef<BackgroundTask[]>([]);
  const isProcessingRef = useRef(false);

  // Modern browsers support requestIdleCallback, fallback for others
  const requestIdleCallback = (
    callback: (deadline: { timeRemaining: () => number; didTimeout: boolean }) => void,
    options?: { timeout?: number }
  ) => {
    if ('requestIdleCallback' in window) {
      return window.requestIdleCallback(callback, options);
    } else {
      // Fallback for browsers without requestIdleCallback
      return setTimeout(() => {
        const start = Date.now();
        callback({
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          didTimeout: false
        });
      }, 1);
    }
  };

  const cancelIdleCallback = (handle: number) => {
    if ('cancelIdleCallback' in window) {
      window.cancelIdleCallback(handle);
    } else {
      clearTimeout(handle);
    }
  };

  // Process tasks during idle time
  const processQueue = useCallback(() => {
    if (isProcessingRef.current || taskQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    const processChunk = (deadline: { timeRemaining: () => number; didTimeout: boolean }) => {
      // Process tasks while we have idle time or until timeout
      while (
        (deadline.timeRemaining() > 0 || deadline.didTimeout) && 
        taskQueueRef.current.length > 0
      ) {
        const task = taskQueueRef.current.shift();
        if (task) {
          try {
            const result = task.task();
            // Handle both sync and async tasks
            if (result instanceof Promise) {
              result.catch(error => {
                console.warn(`Background task ${task.id} failed:`, error);
              });
            }
          } catch (error) {
            console.warn(`Background task ${task.id} failed:`, error);
          }
        }
        
        // Safety break to prevent blocking
        if (deadline.timeRemaining() < 1 && !deadline.didTimeout) {
          break;
        }
      }

      // Schedule next chunk if there are more tasks
      if (taskQueueRef.current.length > 0) {
        requestIdleCallback(processChunk, { timeout });
      } else {
        isProcessingRef.current = false;
      }
    };

    requestIdleCallback(processChunk, { timeout });
  }, [timeout]);

  // Add a task to the background queue
  const addTask = useCallback((task: BackgroundTask) => {
    // Insert task based on priority
    const queue = taskQueueRef.current;
    
    if (task.priority === 'high') {
      // High priority tasks go to the front
      queue.unshift(task);
    } else if (task.priority === 'medium') {
      // Medium priority tasks go in the middle
      const highPriorityCount = queue.findIndex(t => t.priority !== 'high');
      const insertIndex = highPriorityCount === -1 ? queue.length : highPriorityCount;
      queue.splice(insertIndex, 0, task);
    } else {
      // Low priority tasks go to the end
      queue.push(task);
    }

    // Start processing if not already running
    if (!isProcessingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  // Add multiple tasks at once
  const addTasks = useCallback((tasks: BackgroundTask[]) => {
    tasks.forEach(task => addTask(task));
  }, [addTask]);

  // Clear all pending tasks
  const clearQueue = useCallback(() => {
    taskQueueRef.current = [];
  }, []);

  // Get queue status
  const getQueueStatus = useCallback(() => ({
    pending: taskQueueRef.current.length,
    isProcessing: isProcessingRef.current,
    byPriority: {
      high: taskQueueRef.current.filter(t => t.priority === 'high').length,
      medium: taskQueueRef.current.filter(t => t.priority === 'medium').length,
      low: taskQueueRef.current.filter(t => t.priority === 'low').length,
    }
  }), []);

  return {
    addTask,
    addTasks,
    clearQueue,
    getQueueStatus,
    isProcessing: () => isProcessingRef.current
  };
};
