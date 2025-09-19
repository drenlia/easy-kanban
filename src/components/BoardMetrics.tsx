import React from 'react';
import { Columns, Task } from '../types';

interface BoardMetricsProps {
  columns: Columns;
  filteredColumns?: Columns;
}

const BoardMetrics: React.FC<BoardMetricsProps> = ({ columns, filteredColumns = columns }) => {
  // Calculate metrics from all tasks across all columns
  const allTasks = Object.values(filteredColumns).flatMap(column => column.tasks || []);
  const totalTasks = allTasks.length;
  
  // Count completed tasks (tasks in finished columns)
  const completedTasks = Object.values(filteredColumns)
    .filter(column => column.is_finished)
    .flatMap(column => column.tasks || [])
    .length;
  
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
        <div className="p-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg mb-4 border border-gray-100 dark:border-gray-700 w-full max-w-[120px]">
      <div className="space-y-3">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
            Progress
          </h3>
        </div>
        
        {/* Progress */}
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {completedTasks}/{totalTasks} <span className="text-xs font-normal text-gray-600 dark:text-gray-400">({completionPercentage}%)</span>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardMetrics;
