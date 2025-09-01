import { Task, SearchFilters, Columns, Board } from '../types';

/**
 * Filter tasks based on search criteria
 */
export const filterTasks = (tasks: Task[], searchFilters: SearchFilters, isSearchActive: boolean): Task[] => {
  if (!isSearchActive) return tasks;

  return tasks.filter(task => {
    // Text search (title or description)
    if (searchFilters.text) {
      const searchText = searchFilters.text.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(searchText);
      const descriptionMatch = task.description.toLowerCase().includes(searchText);
      if (!titleMatch && !descriptionMatch) return false;
    }

    // Date range filter (start date)
    if (searchFilters.dateFrom || searchFilters.dateTo) {
      const taskDate = new Date(task.startDate);
      if (searchFilters.dateFrom) {
        const fromDate = new Date(searchFilters.dateFrom);
        if (taskDate < fromDate) return false;
      }
      if (searchFilters.dateTo) {
        const toDate = new Date(searchFilters.dateTo);
        if (taskDate > toDate) return false;
      }
    }

    // Members filter
    if (searchFilters.selectedMembers.length > 0) {
      if (!searchFilters.selectedMembers.includes(task.memberId || '') && 
          !searchFilters.selectedMembers.includes(task.requesterId || '')) {
        return false;
      }
    }

    // Priority filter
    if (searchFilters.selectedPriorities.length > 0) {
      if (!searchFilters.selectedPriorities.includes(task.priority)) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Get filtered columns for display
 */
export const getFilteredColumns = (columns: Columns, searchFilters: SearchFilters, isSearchActive: boolean): Columns => {
  if (!isSearchActive) return columns;

  const filteredColumns: Columns = {};
  Object.entries(columns).forEach(([columnId, column]) => {
    filteredColumns[columnId] = {
      ...column,
      tasks: filterTasks(column.tasks, searchFilters, isSearchActive)
    };
  });
  return filteredColumns;
};

/**
 * Get filtered task count for a board (for tab pills)
 */
export const getFilteredTaskCountForBoard = (board: Board, searchFilters: SearchFilters, isSearchActive: boolean): number => {
  if (!isSearchActive) return 0; // Don't show count when no filters active
  
  let totalCount = 0;
  Object.values(board.columns || {}).forEach(column => {
    totalCount += filterTasks(column.tasks, searchFilters, isSearchActive).length;
  });
  return totalCount;
};

/**
 * Check if any filters are active
 */
export const hasActiveFilters = (searchFilters: SearchFilters, isSearchActive: boolean): boolean => {
  return isSearchActive && (
    searchFilters.text || 
    searchFilters.dateFrom || 
    searchFilters.dateTo || 
    searchFilters.selectedMembers.length > 0 || 
    searchFilters.selectedPriorities.length > 0
  );
};
