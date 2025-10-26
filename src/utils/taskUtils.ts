import { Task, SearchFilters, Columns, Board, TeamMember } from '../types';
import { getTaskWatchers, getTaskCollaborators } from '../api';
import { parseLocalDate } from './dateUtils';

/**
 * Strip HTML tags from a string for text search
 */
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  
  // IMPORTANT: Remove blob URLs BEFORE setting innerHTML to prevent ERR_FILE_NOT_FOUND errors
  // The browser tries to fetch blob URLs as soon as they appear in the DOM
  let cleanedHtml = html;
  if (cleanedHtml.includes('blob:')) {
    // Remove img tags with blob URLs
    cleanedHtml = cleanedHtml.replace(/<img[^>]*src="blob:[^"]*"[^>]*>/gi, '');
    // Remove any remaining blob URLs from other contexts
    cleanedHtml = cleanedHtml.replace(/blob:[^\s"')]+/gi, '');
  }
  
  // Remove HTML tags and decode HTML entities
  const tmp = document.createElement('div');
  tmp.innerHTML = cleanedHtml;
  return tmp.textContent || tmp.innerText || '';
};

/**
 * Filter tasks based on search criteria
 */
export const filterTasks = (tasks: Task[], searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[], boards?: any[]): Task[] => {
  if (!isSearchActive) return tasks;

  return tasks.filter(task => {
    // Enhanced text search (title, description, comments, requester name)
    if (searchFilters.text) {
      const searchText = searchFilters.text.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(searchText);
      // Strip HTML tags from description before searching
      const descriptionText = stripHtmlTags(task.description);
      const descriptionMatch = descriptionText.toLowerCase().includes(searchText);
      
      // Search in comments (strip HTML from comment text)
      const commentsMatch = task.comments?.some(comment => {
        const commentText = stripHtmlTags(comment.text || '');
        return commentText.toLowerCase().includes(searchText);
      }) || false;
      
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
      const taskDate = parseLocalDate(task.startDate);
      if (searchFilters.dateFrom) {
        const fromDate = parseLocalDate(searchFilters.dateFrom);
        if (taskDate < fromDate) return false;
      }
      if (searchFilters.dateTo) {
        const toDate = parseLocalDate(searchFilters.dateTo);
        if (taskDate > toDate) return false;
      }
    }

    // Due date range filter
    if (searchFilters.dueDateFrom || searchFilters.dueDateTo) {
      if (!task.dueDate) return false; // No due date set
      const taskDueDate = parseLocalDate(task.dueDate);
      if (searchFilters.dueDateFrom) {
        const fromDate = parseLocalDate(searchFilters.dueDateFrom);
        if (taskDueDate < fromDate) return false;
      }
      if (searchFilters.dueDateTo) {
        const toDate = parseLocalDate(searchFilters.dueDateTo);
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

    // Project identifier filter
    if (searchFilters.projectId) {
      if (!boards || !task.boardId) return false;
      const board = boards.find(b => b.id === task.boardId);
      const projectId = board?.project;
      if (!projectId || !projectId.toLowerCase().includes(searchFilters.projectId.toLowerCase())) {
        return false;
      }
    }

    // Task identifier filter
    if (searchFilters.taskId) {
      if (!task.ticket || !task.ticket.toLowerCase().includes(searchFilters.taskId.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Get filtered columns for display
 */
export const getFilteredColumns = (columns: Columns, searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[], boards?: any[]): Columns => {
  if (!isSearchActive) return columns;

  const filteredColumns: Columns = {};
  Object.entries(columns).forEach(([columnId, column]) => {
    filteredColumns[columnId] = {
      ...column,
      tasks: filterTasks(column.tasks, searchFilters, isSearchActive, members, boards)
    };
  });
  return filteredColumns;
};

/**
 * Get filtered task count for a board (for tab pills)
 */
export const getFilteredTaskCountForBoard = (board: Board, searchFilters: SearchFilters, isSearchActive: boolean, members?: TeamMember[], boards?: any[]): number => {
  if (!isSearchActive) {
    // Return total task count when no filters are active (excluding archived columns)
    let totalCount = 0;
    Object.values(board.columns || {}).forEach(column => {
      // Convert to boolean to handle SQLite integer values (0/1)
      const isArchived = Boolean(column.is_archived);
      if (!isArchived) {
        totalCount += column.tasks.length;
      }
    });
    return totalCount;
  }
  
  let totalCount = 0;
  Object.values(board.columns || {}).forEach(column => {
    // Convert to boolean to handle SQLite integer values (0/1)
    const isArchived = Boolean(column.is_archived);
    if (!isArchived) {
      totalCount += filterTasks(column.tasks, searchFilters, isSearchActive, members, boards).length;
    }
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
    searchFilters.selectedTags.length > 0 ||
    searchFilters.projectId ||
    searchFilters.taskId
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

/**
 * Format member names for tooltips
 */
export const formatMembersTooltip = (members: TeamMember[], type: 'watcher' | 'collaborator'): string => {
  if (!members || members.length === 0) return '';
  
  const typeLabel = type === 'watcher' ? 'Watcher' : 'Collaborator';
  const typeLabelPlural = type === 'watcher' ? 'Watchers' : 'Collaborators';
  
  if (members.length === 1) {
    return `${typeLabel}: ${members[0].name}`;
  }
  
  if (members.length <= 3) {
    return `${typeLabelPlural}: ${members.map(m => m.name).join(', ')}`;
  }
  
  // For more than 3 members, show first 2 and count
  const firstTwo = members.slice(0, 2).map(m => m.name).join(', ');
  const remaining = members.length - 2;
  return `${typeLabelPlural}: ${firstTwo} +${remaining} more`;
};
