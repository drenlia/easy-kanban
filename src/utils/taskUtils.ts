import { Task, SearchFilters, Columns, Board, TeamMember } from '../types';
import { getTaskWatchers, getTaskCollaborators } from '../api';

/**
 * Filter tasks based on search criteria
 */
export const filterTasks = (tasks: Task[], searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[]): Task[] => {
  if (!isSearchActive) return tasks;

  return tasks.filter(task => {
    // Enhanced text search (title, description, comments, requester name)
    if (searchFilters.text) {
      const searchText = searchFilters.text.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(searchText);
      const descriptionMatch = task.description.toLowerCase().includes(searchText);
      
      // Search in comments
      const commentsMatch = task.comments?.some(comment => 
        comment.text?.toLowerCase().includes(searchText)
      ) || false;
      
      // Search in requester name
      let requesterMatch = false;
      if (task.requesterId && members) {
        const requester = members.find(m => m.id === task.requesterId);
        if (requester) {
          requesterMatch = requester.name.toLowerCase().includes(searchText);
        }
      }
      
      if (!titleMatch && !descriptionMatch && !commentsMatch && !requesterMatch) return false;
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

    // Due date range filter
    if (searchFilters.dueDateFrom || searchFilters.dueDateTo) {
      if (!task.dueDate) return false; // No due date set
      const taskDueDate = new Date(task.dueDate);
      if (searchFilters.dueDateFrom) {
        const fromDate = new Date(searchFilters.dueDateFrom);
        if (taskDueDate < fromDate) return false;
      }
      if (searchFilters.dueDateTo) {
        const toDate = new Date(searchFilters.dueDateTo);
        if (taskDueDate > toDate) return false;
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

    // Tags filter
    if (searchFilters.selectedTags.length > 0) {
      if (!task.tags || task.tags.length === 0) {
        return false; // Task has no tags but filter requires tags
      }
      const taskTagIds = task.tags.map(tag => tag.id.toString());
      const hasMatchingTag = searchFilters.selectedTags.some(selectedTagId => 
        taskTagIds.includes(selectedTagId)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Get filtered columns for display
 */
export const getFilteredColumns = (columns: Columns, searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[]): Columns => {
  if (!isSearchActive) return columns;

  const filteredColumns: Columns = {};
  Object.entries(columns).forEach(([columnId, column]) => {
    filteredColumns[columnId] = {
      ...column,
      tasks: filterTasks(column.tasks, searchFilters, isSearchActive, members)
    };
  });
  return filteredColumns;
};

/**
 * Get filtered columns for display (async version with watchers/collaborators search)
 */
export const getFilteredColumnsAsync = async (columns: Columns, searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[]): Promise<Columns> => {
  if (!isSearchActive) return columns;

  const filteredColumns: Columns = {};
  
  for (const [columnId, column] of Object.entries(columns)) {
    filteredColumns[columnId] = {
      ...column,
      tasks: await filterTasksAsync(column.tasks, searchFilters, isSearchActive, members)
    };
  }
  
  return filteredColumns;
};

/**
 * Enhanced async filter with watchers and collaborators search
 */
export const filterTasksAsync = async (tasks: Task[], searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[]): Promise<Task[]> => {
  if (!isSearchActive) return tasks;

  const filteredTasks: Task[] = [];
  
  for (const task of tasks) {
    let includeTask = true;
    
    // Enhanced text search (title, description, comments, requester name, watchers, collaborators)
    if (searchFilters.text && includeTask) {
      const searchText = searchFilters.text.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(searchText);
      const descriptionMatch = task.description.toLowerCase().includes(searchText);
      
      // Search in comments
      const commentsMatch = task.comments?.some(comment => 
        comment.text?.toLowerCase().includes(searchText)
      ) || false;
      
      // Search in requester name
      let requesterMatch = false;
      if (task.requesterId && members) {
        const requester = members.find(m => m.id === task.requesterId);
        if (requester) {
          requesterMatch = requester.name.toLowerCase().includes(searchText);
        }
      }
      
      // Search in watchers names
      let watchersMatch = false;
      try {
        const watchers = await getTaskWatchers(task.id);
        if (watchers && watchers.length > 0) {
          watchersMatch = watchers.some((watcher: TeamMember) => 
            watcher.name.toLowerCase().includes(searchText)
          );
        }
      } catch (error) {
        console.error('Error loading watchers for search:', error);
      }
      
      // Search in collaborators names
      let collaboratorsMatch = false;
      try {
        const collaborators = await getTaskCollaborators(task.id);
        if (collaborators && collaborators.length > 0) {
          collaboratorsMatch = collaborators.some((collaborator: TeamMember) => 
            collaborator.name.toLowerCase().includes(searchText)
          );
        }
      } catch (error) {
        console.error('Error loading collaborators for search:', error);
      }
      
      if (!titleMatch && !descriptionMatch && !commentsMatch && !requesterMatch && !watchersMatch && !collaboratorsMatch) {
        includeTask = false;
      }
    }

    // Apply other filters (reuse existing logic)
    if (includeTask) {
      // Date range filter (start date)
      if (searchFilters.dateFrom || searchFilters.dateTo) {
        const taskDate = new Date(task.startDate);
        if (searchFilters.dateFrom) {
          const fromDate = new Date(searchFilters.dateFrom);
          if (taskDate < fromDate) includeTask = false;
        }
        if (searchFilters.dateTo) {
          const toDate = new Date(searchFilters.dateTo);
          if (taskDate > toDate) includeTask = false;
        }
      }

      // Due date range filter
      if (includeTask && (searchFilters.dueDateFrom || searchFilters.dueDateTo)) {
        if (!task.dueDate) includeTask = false;
        else {
          const taskDueDate = new Date(task.dueDate);
          if (searchFilters.dueDateFrom) {
            const fromDate = new Date(searchFilters.dueDateFrom);
            if (taskDueDate < fromDate) includeTask = false;
          }
          if (searchFilters.dueDateTo) {
            const toDate = new Date(searchFilters.dueDateTo);
            if (taskDueDate > toDate) includeTask = false;
          }
        }
      }

      // Members filter
      if (includeTask && searchFilters.selectedMembers.length > 0) {
        if (!searchFilters.selectedMembers.includes(task.memberId || '') && 
            !searchFilters.selectedMembers.includes(task.requesterId || '')) {
          includeTask = false;
        }
      }

      // Priority filter
      if (includeTask && searchFilters.selectedPriorities.length > 0) {
        if (!searchFilters.selectedPriorities.includes(task.priority)) {
          includeTask = false;
        }
      }

      // Tags filter
      if (includeTask && searchFilters.selectedTags.length > 0) {
        if (!task.tags || task.tags.length === 0) {
          includeTask = false;
        } else {
          const taskTagIds = task.tags.map(tag => tag.id.toString());
          const hasMatchingTag = searchFilters.selectedTags.some(selectedTagId => 
            taskTagIds.includes(selectedTagId)
          );
          if (!hasMatchingTag) {
            includeTask = false;
          }
        }
      }
    }
    
    if (includeTask) {
      filteredTasks.push(task);
    }
  }
  
  return filteredTasks;
};

/**
 * Get filtered task count for a board (for tab pills)
 */
export const getFilteredTaskCountForBoard = (board: Board, searchFilters: SearchFilters, isSearchActive: boolean): number => {
  if (!isSearchActive) {
    // Return total task count when no filters are active
    let totalCount = 0;
    Object.values(board.columns || {}).forEach(column => {
      totalCount += column.tasks.length;
    });
    return totalCount;
  }
  
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
    searchFilters.dueDateFrom || 
    searchFilters.dueDateTo || 
    searchFilters.selectedMembers.length > 0 || 
    searchFilters.selectedPriorities.length > 0 || 
    searchFilters.selectedTags.length > 0
  );
};

/**
 * Check if a single task would be filtered out by current filters
 */
export const wouldTaskBeFilteredOut = (task: Task, searchFilters: SearchFilters, isSearchActive: boolean): boolean => {
  if (!isSearchActive) return false;
  
  // Use the existing filterTasks function with a single task array
  const filtered = filterTasks([task], searchFilters, isSearchActive);
  return filtered.length === 0; // If filtered array is empty, task was filtered out
};
