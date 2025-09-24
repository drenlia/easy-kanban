import React from 'react';
import { TaskJumpDropdown } from './TaskJumpDropdown';

interface GanttTask {
  id: string;
  title: string;
  ticket: string;
  startDate: Date | null;
  endDate: Date | null;
  priority: string;
  status: string;
  columnId: string;
  columnPosition: number;
  taskPosition: number;
}

interface GanttHeaderProps {
  // Date range and formatting
  dateRange: Array<{ date: Date }>;
  formatDate: (date: Date) => string;
  
  // Tasks
  ganttTasks: GanttTask[];
  
  // Navigation functions
  scrollToToday: () => void;
  scrollEarlier: () => void;
  scrollLater: () => void;
  scrollToTask: (startDate: Date, endDate: Date, position?: string) => void;
  
  // Relationship mode
  isRelationshipMode: boolean;
  setIsRelationshipMode: (mode: boolean) => void;
  
  // Multi-select mode
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
  selectedTasks: string[];
  setSelectedTasks: (tasks: string[]) => void;
  setHighlightedTaskId?: (taskId: string | null) => void;
  resetArrowKeyState?: () => void;
  
  // Loading state
  isLoading: boolean;
  
  // Task jump handler
  onJumpToTask: (task: GanttTask) => void;
  
  // Relationship mode handlers
  selectedParentTask?: string | null;
  setSelectedParentTask?: (taskId: string | null) => void;
}

export const GanttHeader: React.FC<GanttHeaderProps> = ({
  dateRange,
  formatDate,
  ganttTasks,
  scrollToToday,
  scrollEarlier,
  scrollLater,
  scrollToTask,
  isRelationshipMode,
  setIsRelationshipMode,
  isMultiSelectMode,
  setIsMultiSelectMode,
  selectedTasks,
  setSelectedTasks,
  setHighlightedTaskId,
  resetArrowKeyState,
  isLoading,
  onJumpToTask,
  selectedParentTask,
  setSelectedParentTask
}) => {
  return (
    <div className="border-b border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        {/* Title and Description */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gantt Chart</h2>
          <p className="text-sm text-gray-600 mt-1">
            {dateRange.length > 0 ? (
              `Timeline view from ${formatDate(dateRange[0].date)} to ${formatDate(dateRange[dateRange.length - 1].date)}`
            ) : (
              'Loading timeline...'
            )}
          </p>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-4">
          {/* Multi-Select Mode Toggle */}
              <button
                onClick={() => {
                  if (isMultiSelectMode) {
                    // Exit multi-select mode and clear selections
                    setIsMultiSelectMode(false);
                    setSelectedTasks([]);
                    setHighlightedTaskId?.(null); // Clear any highlighted tasks
                    resetArrowKeyState?.(); // Reset arrow key state to prevent frozen tasks
                  } else {
                    // Enter multi-select mode
                    setIsMultiSelectMode(true);
                  }
                }}
                className={`px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                  isMultiSelectMode
                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title={isMultiSelectMode ? 'Exit multi-select mode' : 'Select multiple tasks for bulk operations'}
              >
            <svg className="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isMultiSelectMode ? 'Exit' : 'Select'}
            {selectedTasks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-200 text-green-800 rounded-full">
                {selectedTasks.length}
              </span>
            )}
          </button>
          
          {/* Multi-Select Actions */}
          {isMultiSelectMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allTaskIds = ganttTasks.map(task => task.id);
                  if (selectedTasks.length === allTaskIds.length) {
                    // Deselect all
                    setSelectedTasks([]);
                  } else {
                    // Select all
                    setSelectedTasks(allTaskIds);
                  }
                }}
                className="px-2 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded transition-colors"
                title={selectedTasks.length === ganttTasks.length ? 'Deselect all' : 'Select all'}
              >
                {selectedTasks.length === ganttTasks.length ? 'Deselect All' : 'Select All'}
              </button>
              
            </div>
          )}
          
          {/* Relationship Mode Toggle */}
          <button
            onClick={() => {
              if (isRelationshipMode) {
                // Exit relationship mode and clear selected parent
                setIsRelationshipMode(false);
                if (setSelectedParentTask) {
                  setSelectedParentTask(null);
                }
              } else {
                // Enter relationship mode
                setIsRelationshipMode(true);
              }
            }}
            className={`px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
              isRelationshipMode
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-800'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
            title={isRelationshipMode ? 'Exit relationship mode' : 'Create task relationships'}
          >
            <svg className="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {isRelationshipMode ? 'Exit' : 'Link'}
          </button>
          
          {/* Task Navigation: < Task > */}
          <div className="flex items-center gap-1">
            {/* Jump to Earliest Task */}
            <button
              onClick={() => {
                if (ganttTasks.length > 0) {
                  const earliestTask = ganttTasks.reduce((earliest, task) => 
                    (!earliest.startDate || (task.startDate && task.startDate < earliest.startDate)) ? task : earliest
                  );
                  if (earliestTask.startDate) {
                    scrollToTask(earliestTask.startDate, earliestTask.endDate || earliestTask.startDate, 'start-left');
                  }
                }
              }}
              disabled={ganttTasks.length === 0}
              className="p-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Jump to earliest task"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Task Label */}
            <span className="text-sm text-gray-600 font-medium px-2">Task</span>

            {/* Jump to Latest Task */}
            <button
              onClick={() => {
                if (ganttTasks.length > 0) {
                  const latestTask = ganttTasks.reduce((latest, task) => 
                    (!latest.endDate || (task.endDate && task.endDate > latest.endDate)) ? task : latest
                  );
                  if (latestTask.endDate) {
                    scrollToTask(latestTask.startDate || latestTask.endDate, latestTask.endDate, 'end-right');
                  }
                }
              }}
              disabled={ganttTasks.length === 0}
              className="p-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Jump to latest task"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Date Navigation: < Earlier Today Later > */}
          <div className="flex items-center gap-2">
            {/* Earlier Button */}
            <button
              onClick={scrollEarlier}
              disabled={isLoading}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                isLoading 
                  ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed' 
                  : 'text-gray-700 bg-white hover:bg-gray-50 border border-gray-300'
              }`}
              title="Scroll to earlier dates"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Earlier
            </button>

            {/* Today Button */}
            <button
              onClick={scrollToToday}
              disabled={isLoading}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                isLoading 
                  ? 'text-gray-400 bg-gray-300 cursor-not-allowed' 
                  : 'text-white bg-blue-500 hover:bg-blue-600'
              }`}
              title="Scroll to today"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Today
            </button>

            {/* Later Button */}
            <button
              onClick={scrollLater}
              disabled={isLoading}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                isLoading 
                  ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed' 
                  : 'text-gray-700 bg-white hover:bg-gray-50 border border-gray-300'
              }`}
              title="Scroll to later dates"
            >
              Later
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Loading Indicator - Fixed position to prevent layout shift */}
          <div className="relative w-20 flex justify-center">
            {isLoading && (
              <div className="absolute flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md whitespace-nowrap">
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                Loading
              </div>
            )}
          </div>

          {/* Task Jump Dropdown */}
          {ganttTasks.length > 0 && (
            <div className="flex-shrink-0">
              <TaskJumpDropdown
                tasks={ganttTasks.filter(task => task.startDate && task.endDate)}
                onTaskSelect={onJumpToTask}
                className="w-56"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
