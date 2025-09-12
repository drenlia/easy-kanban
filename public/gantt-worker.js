// Gantt Chart Web Worker
// Handles heavy computations off the main thread

// Message types
const MESSAGE_TYPES = {
  GENERATE_DATES: 'GENERATE_DATES',
  CALCULATE_INTERSECTIONS: 'CALCULATE_INTERSECTIONS',
  PROCESS_TASK_POSITIONS: 'PROCESS_TASK_POSITIONS',
  BATCH_OPERATIONS: 'BATCH_OPERATIONS'
};

// Generate date range function (moved from main thread)
function generateDateRange(startDaysOffset, numDays) {
  const dates = [];
  const today = new Date();
  const todayString = today.toDateString();
  
  // Pre-allocate array for better performance
  dates.length = numDays;
  
  for (let i = 0; i < numDays; i++) {
    const currentDate = new Date(
      today.getFullYear(), 
      today.getMonth(), 
      today.getDate() + startDaysOffset + i
    );
    
    const dayOfWeek = currentDate.getDay();
    
    dates[i] = {
      date: currentDate.toISOString(), // Serialize date for transfer
      isToday: currentDate.toDateString() === todayString,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    };
  }
  
  return dates;
}

// Calculate task-viewport intersections
function calculateTaskIntersections(tasks, viewportStart, viewportEnd, dateRange) {
  const intersectingTasks = [];
  const buffer = 10; // Buffer for smooth scrolling
  
  for (const task of tasks) {
    if (!task.startDate || !task.endDate) continue;
    
    // Convert task dates to indices in the date range
    let taskStartIndex = -1;
    let taskEndIndex = -1;
    
    for (let i = 0; i < dateRange.length; i++) {
      const rangeDate = new Date(dateRange[i].date);
      const rangeDateStr = rangeDate.toISOString().split('T')[0];
      const taskStartStr = new Date(task.startDate).toISOString().split('T')[0];
      const taskEndStr = new Date(task.endDate).toISOString().split('T')[0];
      
      if (taskStartIndex === -1 && rangeDateStr === taskStartStr) {
        taskStartIndex = i;
      }
      if (rangeDateStr === taskEndStr) {
        taskEndIndex = i;
      }
    }
    
    // Skip if task dates are not in current date range
    if (taskStartIndex === -1 && taskEndIndex === -1) continue;
    
    // Handle partial intersections
    if (taskStartIndex === -1) taskStartIndex = 0;
    if (taskEndIndex === -1) taskEndIndex = dateRange.length - 1;
    
    // Check if task overlaps with viewport
    if (taskStartIndex <= viewportEnd + buffer && taskEndIndex >= viewportStart - buffer) {
      intersectingTasks.push({
        ...task,
        computedStartIndex: taskStartIndex,
        computedEndIndex: taskEndIndex
      });
    }
  }
  
  return intersectingTasks;
}

// Process task grid positions
function processTaskPositions(tasks, dateRange) {
  const processedTasks = [];
  
  for (const task of tasks) {
    if (!task.startDate || !task.endDate) {
      processedTasks.push({ ...task, gridPosition: null });
      continue;
    }
    
    // Find start and end day indices
    let startDayIndex = -1;
    let endDayIndex = -1;
    
    for (let i = 0; i < dateRange.length; i++) {
      const rangeDate = new Date(dateRange[i].date);
      const rangeDateStr = rangeDate.toISOString().split('T')[0];
      const taskStartStr = new Date(task.startDate).toISOString().split('T')[0];
      const taskEndStr = new Date(task.endDate).toISOString().split('T')[0];
      
      if (startDayIndex === -1 && rangeDateStr === taskStartStr) {
        startDayIndex = i;
      }
      if (rangeDateStr === taskEndStr) {
        endDayIndex = i;
      }
    }
    
    let gridPosition = null;
    
    if (startDayIndex !== -1 || endDayIndex !== -1) {
      // Handle cases where dates are outside visible range
      if (startDayIndex === -1) {
        const firstDate = new Date(dateRange[0].date);
        const taskStart = new Date(task.startDate);
        const daysDiff = Math.floor((firstDate.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24));
        startDayIndex = -daysDiff;
      }
      
      if (endDayIndex === -1) {
        const lastDate = new Date(dateRange[dateRange.length - 1].date);
        const taskEnd = new Date(task.endDate);
        const daysDiff = Math.floor((taskEnd.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        endDayIndex = dateRange.length - 1 + daysDiff;
      }
      
      gridPosition = {
        startDayIndex,
        endDayIndex,
        gridColumnStart: startDayIndex + 2, // +2 to account for task info column
        gridColumnEnd: endDayIndex + 3       // +3 for inclusive end
      };
      
      // Handle 1-day tasks
      if (startDayIndex === endDayIndex) {
        gridPosition.gridColumnEnd = gridPosition.gridColumnStart + 1;
      }
    }
    
    processedTasks.push({
      ...task,
      gridPosition
    });
  }
  
  return processedTasks;
}

// Batch multiple operations for efficiency
function processBatchOperations(operations) {
  const results = {};
  
  for (const operation of operations) {
    const { id, type, data } = operation;
    
    try {
      switch (type) {
        case MESSAGE_TYPES.GENERATE_DATES:
          results[id] = generateDateRange(data.startDaysOffset, data.numDays);
          break;
          
        case MESSAGE_TYPES.CALCULATE_INTERSECTIONS:
          results[id] = calculateTaskIntersections(
            data.tasks, 
            data.viewportStart, 
            data.viewportEnd, 
            data.dateRange
          );
          break;
          
        case MESSAGE_TYPES.PROCESS_TASK_POSITIONS:
          results[id] = processTaskPositions(data.tasks, data.dateRange);
          break;
          
        default:
          results[id] = { error: `Unknown operation type: ${type}` };
      }
    } catch (error) {
      results[id] = { error: error.message };
    }
  }
  
  return results;
}

// Main message handler
self.onmessage = function(e) {
  const { type, data, id } = e.data;
  
  try {
    let result;
    const startTime = performance.now();
    
    switch (type) {
      case MESSAGE_TYPES.GENERATE_DATES:
        result = generateDateRange(data.startDaysOffset, data.numDays);
        break;
        
      case MESSAGE_TYPES.CALCULATE_INTERSECTIONS:
        result = calculateTaskIntersections(
          data.tasks, 
          data.viewportStart, 
          data.viewportEnd, 
          data.dateRange
        );
        break;
        
      case MESSAGE_TYPES.PROCESS_TASK_POSITIONS:
        result = processTaskPositions(data.tasks, data.dateRange);
        break;
        
      case MESSAGE_TYPES.BATCH_OPERATIONS:
        result = processBatchOperations(data.operations);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    const duration = performance.now() - startTime;
    
    // Send result back to main thread
    self.postMessage({
      id,
      type,
      success: true,
      data: result,
      performance: {
        duration,
        timestamp: Date.now()
      }
    });
    
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      id,
      type,
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
};

// Export message types for main thread (this won't work in worker, but helps with intellisense)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MESSAGE_TYPES };
}
