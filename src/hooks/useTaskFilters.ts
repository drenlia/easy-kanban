import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Columns, Task, TeamMember, Board } from '../types';
import { SavedFilterView, getSavedFilterView } from '../api';
import { TaskViewMode, ViewMode, loadUserPreferences, updateUserPreference } from '../utils/userPreferences';
import { filterTasks, hasActiveFilters } from '../utils/taskUtils';
import { SYSTEM_MEMBER_ID } from '../constants/appConstants';

// Extend Window interface for justUpdatedFromWebSocket flag
declare global {
  interface Window {
    justUpdatedFromWebSocket?: boolean;
  }
}

interface UseTaskFiltersProps {
  columns: Columns;
  members: TeamMember[];
  boards: Board[];
  updateCurrentUserPreference: <K extends keyof import('../utils/userPreferences').UserPreferences>(
    key: K,
    value: import('../utils/userPreferences').UserPreferences[K]
  ) => void;
}

export const useTaskFilters = ({
  columns,
  members,
  boards,
  updateCurrentUserPreference,
}: UseTaskFiltersProps) => {
  // Load user preferences from cookies
  const [userPrefs] = useState(() => loadUserPreferences());
  
  // Filter state
  const [selectedMembers, setSelectedMembers] = useState<string[]>(userPrefs.selectedMembers);
  const [includeAssignees, setIncludeAssignees] = useState(userPrefs.includeAssignees);
  const [includeWatchers, setIncludeWatchers] = useState(userPrefs.includeWatchers);
  const [includeCollaborators, setIncludeCollaborators] = useState(userPrefs.includeCollaborators);
  const [includeRequesters, setIncludeRequesters] = useState(userPrefs.includeRequesters);
  const [includeSystem, setIncludeSystem] = useState(userPrefs.includeSystem || false);
  
  // Computed: Check if we're in "All Roles" mode (all main role checkboxes checked)
  const isAllModeActive = useMemo(() => {
    const allMainCheckboxesChecked = includeAssignees && includeWatchers && 
      includeCollaborators && includeRequesters;
    
    return allMainCheckboxesChecked;
  }, [includeAssignees, includeWatchers, includeCollaborators, includeRequesters]);
  
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>(userPrefs.taskViewMode);
  const [viewMode, setViewMode] = useState<ViewMode>(userPrefs.viewMode);
  const viewModeRef = useRef<ViewMode>(userPrefs.viewMode);
  
  const [isSearchActive, setIsSearchActive] = useState(userPrefs.isSearchActive);
  const [isAdvancedSearchExpanded, setIsAdvancedSearchExpanded] = useState(userPrefs.isAdvancedSearchExpanded);
  const [searchFilters, setSearchFilters] = useState(userPrefs.searchFilters);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(userPrefs.selectedSprintId);
  const [currentFilterView, setCurrentFilterView] = useState<SavedFilterView | null>(null);
  const [sharedFilterViews, setSharedFilterViews] = useState<SavedFilterView[]>([]);
  const [filteredColumns, setFilteredColumns] = useState<Columns>({});
  
  // Track previous columns to detect when batch update completes
  const prevColumnsRef = useRef<Columns>({});
  const batchUpdateInProgressRef = useRef<boolean>(false);
  
  // CRITICAL: Use a ref to always access the latest columns value
  // This prevents stale closure issues when filtering is delayed
  const columnsRef = useRef<Columns>(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  // Update viewModeRef when viewMode changes
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Enhanced filtering effect with watchers/collaborators/requesters support
  useEffect(() => {
    // CRITICAL: Delay filtering if we just updated from WebSocket to prevent overwriting batch updates
    // The batch processing sets this flag and clears it after 2 seconds
    // We'll delay filtering to let the batch update complete, but still filter soon after
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Detect if this is a batch update (large change in task count or column structure)
    const currentTaskCount = Object.values(columns).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
    const prevTaskCount = Object.values(prevColumnsRef.current).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
    const isLargeChange = Math.abs(currentTaskCount - prevTaskCount) > 50; // Large change suggests batch update
    
    // Update refs
    if (window.justUpdatedFromWebSocket || isLargeChange) {
      batchUpdateInProgressRef.current = true;
    }
    prevColumnsRef.current = columns;
    
    // CRITICAL: Refactor performFiltering to accept columns as parameter to avoid stale closure
    const performFiltering = (columnsToFilter: Columns = columns) => {
      // CRITICAL: Don't filter if columns is empty - might be during batch update
      if (!columnsToFilter || Object.keys(columnsToFilter).length === 0) {
        return;
      }
      
      // CRITICAL: Check if columns have tasks - if all columns are empty, something is wrong
      const totalTasks = Object.values(columnsToFilter).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
      if (totalTasks === 0) {
        return;
      }
      
      // Always filter by selectedMembers if any are selected, or if any checkboxes are checked
      const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
      
      if (!isFiltering) {
        setFilteredColumns(columnsToFilter);
        return;
      }

      // Create custom filtering function that includes watchers/collaborators/requesters (synchronous)
      const customFilterTasks = (tasks: any[]) => {
        // If no checkboxes enabled, return all tasks (no filtering)
        if (!includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters) {
          return tasks;
        }
        
        // If no members selected, treat as "all members" (empty array = show all)
        const showAllMembers = selectedMembers.length === 0;
        
        const filteredTasks = [];
        
        for (const task of tasks) {
          let includeTask = false;
          
          // Check if task is assigned to selected members (or any member if showAllMembers)
          if (includeAssignees) {
            if (showAllMembers) {
              // Show all tasks with assignees (any member)
              if (task.memberId) {
                includeTask = true;
              }
            } else {
              // Show only tasks assigned to selected members
              if (task.memberId && selectedMembers.includes(task.memberId)) {
                includeTask = true;
              }
            }
          }
          
          // Check watchers if checkbox is enabled (use cached data)
          if (!includeTask && includeWatchers) {
            const watchers = task.watchers || [];
            if (watchers.length > 0) {
              if (showAllMembers) {
                // Show all tasks with watchers
                includeTask = true;
              } else {
                // Show only tasks watched by selected members
                if (watchers.some((watcher: any) => selectedMembers.includes(watcher.id))) {
                  includeTask = true;
                }
              }
            }
          }
          
          // Check collaborators if checkbox is enabled (use cached data)
          if (!includeTask && includeCollaborators) {
            const collaborators = task.collaborators || [];
            if (collaborators.length > 0) {
              if (showAllMembers) {
                // Show all tasks with collaborators
                includeTask = true;
              } else {
                // Show only tasks with selected members as collaborators
                if (collaborators.some((collaborator: any) => selectedMembers.includes(collaborator.id))) {
                  includeTask = true;
                }
              }
            }
          }
          
          // Check requesters if checkbox is enabled
          if (!includeTask && includeRequesters) {
            if (showAllMembers) {
              // Show all tasks with requesters
              if (task.requesterId) {
                includeTask = true;
              }
            } else {
              // Show only tasks requested by selected members
              if (task.requesterId && selectedMembers.includes(task.requesterId)) {
                includeTask = true;
              }
            }
          }
          
          if (includeTask) {
            filteredTasks.push(task);
          }
        }
        
        return filteredTasks;
      };

      // Create effective filters with member filtering 
      const effectiveFilters = {
        ...searchFilters,
        selectedMembers: selectedMembers.length > 0 ? selectedMembers : searchFilters.selectedMembers
      };

      const filteredColumns: any = {};
      
      for (const [columnId, column] of Object.entries(columnsToFilter)) {
        let columnTasks = column.tasks;

        // FIRST: Apply sprint filtering (if a sprint is selected)
        // Pure sprint_id matching - no date-based fallback
        if (selectedSprintId !== null) {
          if (selectedSprintId === 'backlog') {
            // Show only tasks NOT assigned to any sprint (backlog)
            columnTasks = columnTasks.filter(task => !task.sprintId);
          } else {
            // Show only tasks with matching sprint_id (explicit assignment)
            columnTasks = columnTasks.filter(task => task.sprintId === selectedSprintId);
          }
        }
        
        // SECOND: Apply search filters, but skip member filtering if we have checkboxes enabled
        if (isSearchActive) {
          // Create filters without member filtering if we have checkboxes enabled
          const searchOnlyFilters = (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) ? {
            ...effectiveFilters,
            selectedMembers: [] // Skip member filtering in search, we'll handle it in custom filter
          } : effectiveFilters;
          
          columnTasks = filterTasks(columnTasks, searchOnlyFilters, isSearchActive, members, boards);
        }
        
        // THIRD: Apply our custom member filtering with assignees/watchers/collaborators/requesters
        // Run member filtering if at least one filter type is enabled (works with 0 or more members selected)
        if (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) {
          columnTasks = customFilterTasks(columnTasks);
        }
        
        // IMPORTANT: Create new column object and ensure task objects are preserved
        // When filtering, we create a new array but the task objects inside are references
        // to the original tasks from columns. This is correct - we want to preserve the
        // task object references so that when we update a task in columns, filteredColumns
        // picks up the new reference on the next computation.
        filteredColumns[columnId] = {
          ...column,
          tasks: columnTasks // New array, but task objects are references to original tasks
        };
      }
      
      const filteredTaskCount = Object.values(filteredColumns).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
      const originalTaskCount = Object.values(columnsToFilter).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
      
      // CRITICAL: If filtering resulted in all tasks being removed, but we had tasks before,
      // this might indicate a bug. However, we should still set filteredColumns to avoid
      // showing stale data. The filtering logic should be correct.
      // 
      // But if we had NO tasks to begin with, don't update filteredColumns (might be during batch update)
      if (originalTaskCount === 0 && filteredTaskCount === 0) {
        return;
      }
      
      // CRITICAL: Always set filteredColumns, even if some columns are empty
      // This ensures the UI reflects the current filter state
      setFilteredColumns(filteredColumns);
    };

    if (window.justUpdatedFromWebSocket || batchUpdateInProgressRef.current) {
      // Delay filtering to let batch update complete
      // The batch update processes all updates in a single setColumns call, but React state updates
      // are asynchronous, so we need to wait longer to ensure the state has fully settled
      // We use a longer delay to ensure the batch update's setColumns has been applied
      batchUpdateInProgressRef.current = false; // Reset flag
      timeoutId = setTimeout(() => {
        // CRITICAL: The effect will re-run when columns changes, so we don't need to manually
        // read from the ref here. Instead, we should just let the effect run again naturally.
        // But to ensure we have the latest data, we'll use a callback pattern to force
        // the effect to re-evaluate with the latest columns value.
        // 
        // Actually, the best approach is to just let the effect run again when columns changes.
        // The delay is just to prevent it from running too early. But we need to ensure
        // we're using the latest columns value.
        //
        // Since the effect depends on `columns`, when columns changes (from batch update),
        // the effect will run again. But we're delaying it, so we need to ensure we read
        // the latest value. The ref should be updated by now, but let's also check the
        // current columns value from the closure to be safe.
        //
        // Actually, the real issue is that we're delaying the effect, but when it runs,
        // it uses the `columns` value from when the effect was set up, not the current value.
        // So we need to use the ref OR trigger the effect to run again.
        //
        // The simplest solution: Don't delay if columns has already changed. Or use a
        // different approach - use a state variable to track when batch update completes.
        //
        // For now, let's use the ref but also add a check to ensure it's up to date.
        const latestColumns = columnsRef.current;
        
        // Also check the current columns from closure - if they're different, use the newer one
        const currentColumnsFromClosure = columns;
        const refTaskCount = Object.values(latestColumns).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
        const closureTaskCount = Object.values(currentColumnsFromClosure).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
        
        // Use whichever has more tasks (likely the updated one)
        const columnsToUse = refTaskCount >= closureTaskCount ? latestColumns : currentColumnsFromClosure;
        
        if (!columnsToUse || Object.keys(columnsToUse).length === 0) {
          return;
        }
        const totalTasks = Object.values(columnsToUse).reduce((sum, col) => sum + (col?.tasks?.length || 0), 0);
        if (totalTasks === 0) {
          return;
        }
        
        // CRITICAL: Pass the columns we determined to use
        performFiltering(columnsToUse);
      }, 400); // 400ms delay - enough for batch update to complete and React state to settle
      
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    } else {
      // Run filtering immediately
      performFiltering();
    }
  }, [columns, searchFilters.text, searchFilters.dateFrom, searchFilters.dateTo, searchFilters.dueDateFrom, searchFilters.dueDateTo, searchFilters.selectedPriorities, searchFilters.selectedTags, searchFilters.projectId, searchFilters.taskId, isSearchActive, selectedMembers, includeAssignees, includeWatchers, includeCollaborators, includeRequesters, selectedSprintId, members, boards]);

  // Helper function to quickly check if a task should be included (synchronous checks only for WebSocket updates)
  const shouldIncludeTask = useCallback((task: Task): boolean => {
    // Sprint filtering (applied first, before other filters)
    // Pure sprint_id matching - no date-based fallback
    if (selectedSprintId !== null) {
      if (selectedSprintId === 'backlog') {
        // Show only tasks NOT assigned to any sprint (backlog)
        if (task.sprintId !== null && task.sprintId !== undefined) {
          return false;
        }
      } else {
        // Show only tasks with matching sprint_id (explicit assignment)
        if (task.sprintId !== selectedSprintId) {
          return false;
        }
      }
    }
    // If selectedSprintId is null, show all tasks (no sprint filtering)

    // If no other filters active, include all tasks (that passed sprint filter)
    const isFiltering = isSearchActive || selectedMembers.length > 0 || includeAssignees || includeWatchers || includeCollaborators || includeRequesters;
    if (!isFiltering) return true;

    // Apply search filters (text, dates, priorities, tags, etc.)
    if (isSearchActive) {
      const effectiveFilters = {
        ...searchFilters,
        selectedMembers: selectedMembers.length > 0 ? selectedMembers : searchFilters.selectedMembers
      };
      
      // Create filters without member filtering if we have checkboxes enabled
      const searchOnlyFilters = (includeAssignees || includeWatchers || includeCollaborators || includeRequesters) ? {
        ...effectiveFilters,
        selectedMembers: [] // Skip member filtering in search, we'll handle it separately
      } : effectiveFilters;
      
      // Use the filterTasks utility with a single task
      const filtered = filterTasks([task], searchOnlyFilters, isSearchActive, members, boards);
      if (filtered.length === 0) return false; // Task didn't pass search filters
    }

    // Apply member filtering (synchronous checks only: assignees and requesters)
    // Note: Watchers/collaborators are async and will be handled by the useEffect
    if (selectedMembers.length > 0) {
      let includeTask = false;
      
      // Check assignees
      if (includeAssignees && selectedMembers.includes(task.memberId || '')) {
        includeTask = true;
      }
      
      // Check requesters
      if (!includeTask && includeRequesters && task.requesterId && selectedMembers.includes(task.requesterId)) {
        includeTask = true;
      }
      
      // Check watchers (synchronous using cached data)
      if (!includeTask && includeWatchers) {
        const watchers = task.watchers || [];
        if (watchers.some((watcher: any) => selectedMembers.includes(watcher.id))) {
          includeTask = true;
        }
      }
      
      // Check collaborators (synchronous using cached data)
      if (!includeTask && includeCollaborators) {
        const collaborators = task.collaborators || [];
        if (collaborators.some((collaborator: any) => selectedMembers.includes(collaborator.id))) {
          includeTask = true;
        }
      }
      
      return includeTask;
    }

    return true;
  }, [isSearchActive, searchFilters, selectedMembers, includeAssignees, includeWatchers, includeCollaborators, includeRequesters, members, boards, selectedSprintId]);

  // Store shouldIncludeTask in a ref to avoid stale closures in WebSocket handlers
  const shouldIncludeTaskRef = useRef(shouldIncludeTask);
  useEffect(() => {
    shouldIncludeTaskRef.current = shouldIncludeTask;
  }, [shouldIncludeTask]);

  // Handlers
  const handleToggleSearch = () => {
    const newValue = !isSearchActive;
    setIsSearchActive(newValue);
    updateCurrentUserPreference('isSearchActive', newValue);
  };

  const handleSearchFiltersChange = (newFilters: typeof searchFilters) => {
    setSearchFilters(newFilters);
    updateCurrentUserPreference('searchFilters', newFilters);
    
    // Note: Sprint selection is now independent of date filters - it will not be reset when filters change
    // This allows users to combine sprint filtering with other search filters
    
    // Clear current filter view when manually changing filters
    if (currentFilterView) {
      setCurrentFilterView(null);
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  const handleSprintChange = (sprint: { id: string; name: string; start_date: string; end_date: string } | null) => {
    const newSprintId = sprint?.id || null;
    setSelectedSprintId(newSprintId);
    updateCurrentUserPreference('selectedSprintId', newSprintId);
    
    // Clear current filter view when sprint changes
    if (currentFilterView) {
      setCurrentFilterView(null);
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  const loadSavedFilterView = async (viewId: number) => {
    try {
      const view = await getSavedFilterView(viewId);
      setCurrentFilterView(view);
      
      // Convert and apply the filter
      const searchFilters = {
        text: view.textFilter || '',
        dateFrom: view.dateFromFilter || '',
        dateTo: view.dateToFilter || '',
        dueDateFrom: view.dueDateFromFilter || '',
        dueDateTo: view.dueDateToFilter || '',
        selectedMembers: view.memberFilters || [],
        selectedPriorities: view.priorityFilters || [],
        selectedTags: view.tagFilters || [],
        projectId: view.projectFilter || '',
        taskId: view.taskFilter || '',
      };
      setSearchFilters(searchFilters);
    } catch (error) {
      // Clear the invalid preference
      updateCurrentUserPreference('currentFilterViewId', null);
    }
  };

  const handleFilterViewChange = (view: SavedFilterView | null) => {
    setCurrentFilterView(view);
    // Save the current filter view ID to user preferences
    updateCurrentUserPreference('currentFilterViewId', view?.id || null);
  };

  const handleMemberToggle = (memberId: string) => {
    const newSelectedMembers = selectedMembers.includes(memberId) 
      ? selectedMembers.filter(id => id !== memberId)
      : [...selectedMembers, memberId];
    
    setSelectedMembers(newSelectedMembers);
    updateCurrentUserPreference('selectedMembers', newSelectedMembers);
  };

  const handleClearMemberSelections = () => {
    // Clear to empty array = show all members
    setSelectedMembers([]);
    updateCurrentUserPreference('selectedMembers', []);
  };

  const handleSelectAllMembers = () => {
    if (isAllModeActive) {
      // Currently in "All Roles" mode, switch to "Assignees Only" mode
      setIncludeAssignees(true);
      setIncludeWatchers(false);
      setIncludeCollaborators(false);
      setIncludeRequesters(false);
      setIncludeSystem(false);
      
      updateCurrentUserPreference('includeAssignees', true);
      updateCurrentUserPreference('includeWatchers', false);
      updateCurrentUserPreference('includeCollaborators', false);
      updateCurrentUserPreference('includeRequesters', false);
      updateCurrentUserPreference('includeSystem', false);
    } else {
      // Not in "All Roles" mode, switch to "All Roles" mode
      setIncludeAssignees(true);
      setIncludeWatchers(true);
      setIncludeCollaborators(true);
      setIncludeRequesters(true);
      // Note: System checkbox is left unchanged (admin-only)
      
      updateCurrentUserPreference('includeAssignees', true);
      updateCurrentUserPreference('includeWatchers', true);
      updateCurrentUserPreference('includeCollaborators', true);
      updateCurrentUserPreference('includeRequesters', true);
    }
  };

  const handleToggleAssignees = (include: boolean) => {
    setIncludeAssignees(include);
    updateCurrentUserPreference('includeAssignees', include);
  };

  const handleToggleWatchers = (include: boolean) => {
    setIncludeWatchers(include);
    updateCurrentUserPreference('includeWatchers', include);
  };

  const handleToggleCollaborators = (include: boolean) => {
    setIncludeCollaborators(include);
    updateCurrentUserPreference('includeCollaborators', include);
  };

  const handleToggleRequesters = (include: boolean) => {
    setIncludeRequesters(include);
    updateCurrentUserPreference('includeRequesters', include);
  };

  const handleToggleSystem = async (include: boolean) => {
    setIncludeSystem(include);
    updateCurrentUserPreference('includeSystem', include);
    
    // Handle SYSTEM user selection logic without reloading members
    if (include) {
      // Checkbox ON: Auto-select SYSTEM user if not already selected
      setSelectedMembers(prev => {
        if (!prev.includes(SYSTEM_MEMBER_ID)) {
          const newSelection = [...prev, SYSTEM_MEMBER_ID];
          updateCurrentUserPreference('selectedMembers', newSelection);
          return newSelection;
        }
        return prev;
      });
    } else {
      // Checkbox OFF: Auto-deselect SYSTEM user
      setSelectedMembers(prev => {
        const newSelection = prev.filter(id => id !== SYSTEM_MEMBER_ID);
        updateCurrentUserPreference('selectedMembers', newSelection);
        return newSelection;
      });
    }
  };

  return {
    // State
    selectedMembers,
    includeAssignees,
    includeWatchers,
    includeCollaborators,
    includeRequesters,
    includeSystem,
    isAllModeActive,
    taskViewMode,
    viewMode,
    viewModeRef,
    isSearchActive,
    isAdvancedSearchExpanded,
    searchFilters,
    selectedSprintId,
    currentFilterView,
    sharedFilterViews,
    filteredColumns,
    shouldIncludeTask,
    shouldIncludeTaskRef,
    
    // Setters (for direct state updates when needed)
    setSelectedMembers,
    setIncludeAssignees,
    setIncludeWatchers,
    setIncludeCollaborators,
    setIncludeRequesters,
    setIncludeSystem,
    setTaskViewMode,
    setViewMode,
    setIsSearchActive,
    setIsAdvancedSearchExpanded,
    setSearchFilters,
    setSelectedSprintId,
    setCurrentFilterView,
    setSharedFilterViews,
    setFilteredColumns,
    
    // Handlers
    handleToggleSearch,
    handleSearchFiltersChange,
    handleSprintChange,
    loadSavedFilterView,
    handleFilterViewChange,
    handleMemberToggle,
    handleClearMemberSelections,
    handleSelectAllMembers,
    handleToggleAssignees,
    handleToggleWatchers,
    handleToggleCollaborators,
    handleToggleRequesters,
    handleToggleSystem,
  };
};

