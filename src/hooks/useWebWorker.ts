import { useCallback, useRef, useEffect } from 'react';

// Message types (should match worker)
export const MESSAGE_TYPES = {
  GENERATE_DATES: 'GENERATE_DATES',
  CALCULATE_INTERSECTIONS: 'CALCULATE_INTERSECTIONS',
  PROCESS_TASK_POSITIONS: 'PROCESS_TASK_POSITIONS',
  BATCH_OPERATIONS: 'BATCH_OPERATIONS'
} as const;

type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

interface WorkerMessage {
  id: string;
  type: MessageType;
  data: any;
}

interface WorkerResponse {
  id: string;
  type: MessageType;
  success: boolean;
  data?: any;
  error?: string;
  performance?: {
    duration: number;
    timestamp: number;
  };
}

interface PendingOperation {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout?: number;
}

interface UseWebWorkerOptions {
  workerPath?: string;
  timeout?: number; // Default timeout for operations (ms)
  maxRetries?: number; // Max retry attempts for failed operations
  fallbackToMainThread?: boolean; // Fallback if worker fails
}

export const useWebWorker = (options: UseWebWorkerOptions = {}) => {
  const {
    workerPath = '/gantt-worker.js',
    timeout = 10000, // 10 seconds
    maxRetries = 2,
    fallbackToMainThread = true
  } = options;

  const workerRef = useRef<Worker | null>(null);
  const pendingOperationsRef = useRef<Map<string, PendingOperation>>(new Map());
  const messageIdCounterRef = useRef(0);
  const isWorkerSupportedRef = useRef(true);

  // Initialize worker
  useEffect(() => {
    if (!('Worker' in window)) {
      console.warn('Web Workers not supported in this browser');
      isWorkerSupportedRef.current = false;
      return;
    }

    try {
      const worker = new Worker(workerPath);
      
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, success, data, error, performance } = e.data;
        const pending = pendingOperationsRef.current.get(id);
        
        if (pending) {
          pendingOperationsRef.current.delete(id);
          
          if (success) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(error || 'Worker operation failed'));
          }
          
          // Log performance if available
          if (performance) {
            console.debug(`Worker operation completed in ${performance.duration.toFixed(2)}ms`);
          }
        }
      };
      
      worker.onerror = (error) => {
        console.error('Worker error:', error);
        // Reject all pending operations
        pendingOperationsRef.current.forEach((pending) => {
          pending.reject(new Error('Worker encountered an error'));
        });
        pendingOperationsRef.current.clear();
      };
      
      workerRef.current = worker;
      
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      isWorkerSupportedRef.current = false;
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Reject all pending operations
      pendingOperationsRef.current.forEach((pending) => {
        pending.reject(new Error('Worker terminated'));
      });
      pendingOperationsRef.current.clear();
    };
  }, [workerPath]);

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${++messageIdCounterRef.current}`;
  }, []);

  // Send message to worker with promise interface
  const sendMessage = useCallback(<T = any>(
    type: MessageType, 
    data: any, 
    operationTimeout = timeout
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!isWorkerSupportedRef.current || !workerRef.current) {
        if (fallbackToMainThread) {
          // TODO: Implement main thread fallbacks
          reject(new Error('Worker not available and main thread fallback not implemented'));
        } else {
          reject(new Error('Worker not available'));
        }
        return;
      }

      const id = generateMessageId();
      const message: WorkerMessage = { id, type, data };
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        const pending = pendingOperationsRef.current.get(id);
        if (pending) {
          pendingOperationsRef.current.delete(id);
          reject(new Error(`Worker operation timed out after ${operationTimeout}ms`));
        }
      }, operationTimeout);
      
      // Store pending operation
      pendingOperationsRef.current.set(id, {
        resolve: (value: T) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now(),
        timeout: operationTimeout
      });
      
      // Send message to worker
      workerRef.current.postMessage(message);
    });
  }, [timeout, fallbackToMainThread, generateMessageId]);

  // Specific worker operations
  const generateDates = useCallback((startDaysOffset: number, numDays: number) => {
    return sendMessage(MESSAGE_TYPES.GENERATE_DATES, { startDaysOffset, numDays });
  }, [sendMessage]);

  const calculateIntersections = useCallback((
    tasks: any[], 
    viewportStart: number, 
    viewportEnd: number, 
    dateRange: any[]
  ) => {
    return sendMessage(MESSAGE_TYPES.CALCULATE_INTERSECTIONS, {
      tasks,
      viewportStart,
      viewportEnd,
      dateRange
    });
  }, [sendMessage]);

  const processTaskPositions = useCallback((tasks: any[], dateRange: any[]) => {
    return sendMessage(MESSAGE_TYPES.PROCESS_TASK_POSITIONS, { tasks, dateRange });
  }, [sendMessage]);

  // Batch operations for efficiency
  const batchOperations = useCallback((operations: Array<{
    id: string;
    type: MessageType;
    data: any;
  }>) => {
    return sendMessage(MESSAGE_TYPES.BATCH_OPERATIONS, { operations });
  }, [sendMessage]);

  // Get worker status
  const getWorkerStatus = useCallback(() => ({
    isSupported: isWorkerSupportedRef.current,
    isActive: !!workerRef.current,
    pendingOperations: pendingOperationsRef.current.size,
    queuedMessages: Array.from(pendingOperationsRef.current.entries()).map(([id, op]) => ({
      id,
      age: Date.now() - op.timestamp,
      timeout: op.timeout
    }))
  }), []);

  // Clear all pending operations
  const clearPendingOperations = useCallback(() => {
    pendingOperationsRef.current.forEach((pending) => {
      pending.reject(new Error('Operations cleared by user'));
    });
    pendingOperationsRef.current.clear();
  }, []);

  return {
    // Core operations
    generateDates,
    calculateIntersections,
    processTaskPositions,
    batchOperations,
    
    // Generic message sending
    sendMessage,
    
    // Worker management
    getWorkerStatus,
    clearPendingOperations,
    
    // Status
    isWorkerSupported: isWorkerSupportedRef.current,
    isWorkerActive: !!workerRef.current
  };
};
