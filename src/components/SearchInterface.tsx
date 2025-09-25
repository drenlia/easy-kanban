import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check, ChevronUp, Save, Settings, RefreshCw } from 'lucide-react';
import { Priority, PriorityOption, Tag, Columns } from '../types';
import { getAllTags, getSavedFilterViews, getSharedFilterViews, createSavedFilterView, updateSavedFilterView, SavedFilterView } from '../api';
import { loadUserPreferences, updateUserPreference } from '../utils/userPreferences';
import ManageFiltersModal from './ManageFiltersModal';
import ColumnFilterDropdown from './ColumnFilterDropdown';

interface SearchFilters {
  text: string;
  dateFrom: string;
  dateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  selectedMembers: string[];
  selectedPriorities: Priority[];
  selectedTags: string[];
  projectId: string;
  taskId: string;
}

interface SearchInterfaceProps {
  filters: SearchFilters;
  availablePriorities: PriorityOption[];
  onFiltersChange: (filters: SearchFilters) => void;
  siteSettings?: { [key: string]: string };
  currentFilterView?: SavedFilterView | null;
  sharedFilterViews?: SavedFilterView[];
  onFilterViewChange?: (view: SavedFilterView | null) => void;
  // Column filtering props
  columns?: Columns;
  visibleColumns?: string[];
  onColumnsChange?: (visibleColumns: string[]) => void;
  selectedBoard?: string | null;
}

export default function SearchInterface({
  filters,
  availablePriorities,
  onFiltersChange,
  siteSettings,
  currentFilterView,
  sharedFilterViews,
  onFilterViewChange,
  columns,
  visibleColumns,
  onColumnsChange,
  selectedBoard
}: SearchInterfaceProps) {
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const prefs = loadUserPreferences();
    return !prefs.isAdvancedSearchExpanded;
  });
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [savedFilterViews, setSavedFilterViews] = useState<SavedFilterView[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const tagsDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Helper function to determine text color based on background color
  const getTextColor = (backgroundColor: string): string => {
    if (!backgroundColor) return '#ffffff';
    
    // Handle white and very light colors
    const normalizedColor = backgroundColor.toLowerCase();
    if (normalizedColor === '#ffffff' || normalizedColor === '#fff' || normalizedColor === 'white') {
      return '#374151'; // gray-700 for good contrast on white
    }
    
    // For hex colors, calculate luminance to determine if we need light or dark text
    if (backgroundColor.startsWith('#')) {
      const hex = backgroundColor.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Use dark text for light backgrounds, white text for dark backgrounds
        return luminance > 0.6 ? '#374151' : '#ffffff';
      }
    }
    
    // Default to white text
    return '#ffffff';
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleToggleCollapse = () => {
    const newIsCollapsed = !isCollapsed;
    setIsCollapsed(newIsCollapsed);
    // Save the expanded state to user preferences
    updateUserPreference('isAdvancedSearchExpanded', !newIsCollapsed);
  };

  const togglePriority = (priority: Priority) => {
    const newSelectedPriorities = filters.selectedPriorities.includes(priority)
      ? filters.selectedPriorities.filter(p => p !== priority)
      : [...filters.selectedPriorities, priority];
    updateFilter('selectedPriorities', newSelectedPriorities);
  };

  const toggleTag = (tagId: string) => {
    const newSelectedTags = filters.selectedTags.includes(tagId)
      ? filters.selectedTags.filter(id => id !== tagId)
      : [...filters.selectedTags, tagId];
    updateFilter('selectedTags', newSelectedTags);
  };

  // Helper function to get input field styling based on whether it's active
  const getInputClassName = (isActive: boolean) => {
    const baseClasses = "px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent";
    const activeClasses = isActive ? "border-blue-400 bg-blue-50 dark:bg-blue-900" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";
    return `${baseClasses} ${activeClasses}`;
  };

  // Helper function to get dropdown button styling based on whether it's active
  const getDropdownButtonClassName = (isActive: boolean) => {
    const baseClasses = "bg-white dark:bg-gray-700 border rounded px-2 py-1 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent w-[70px] flex items-center justify-between text-gray-900 dark:text-gray-100";
    const activeClasses = isActive ? "border-blue-400 bg-blue-50 dark:bg-blue-900" : "border-gray-300 dark:border-gray-600";
    return `${baseClasses} ${activeClasses}`;
  };

  // Load available tags on mount
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await getAllTags();
        setAvailableTags(tags || []);
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };
    loadTags();
  }, []);

  // Load saved filter views function (only user's own - shared filters come from props)
  const loadSavedFilters = async () => {
    setIsLoadingFilters(true);
    try {
      
      // Load user's own filters
      const myViews = await getSavedFilterViews();
      setSavedFilterViews(myViews);
    } catch (error) {
      console.error('❌ [SearchInterface] Failed to load saved filter views:', error);
    } finally {
      setIsLoadingFilters(false);
    }
  };

  // Load saved filter views on mount
  useEffect(() => {
    loadSavedFilters();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
      }
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper function to convert SearchFilters to API format
  const convertFiltersForAPI = (searchFilters: SearchFilters) => {
    return {
      textFilter: searchFilters.text || undefined,
      dateFromFilter: searchFilters.dateFrom || undefined,
      dateToFilter: searchFilters.dateTo || undefined,
      dueDateFromFilter: searchFilters.dueDateFrom || undefined,
      dueDateToFilter: searchFilters.dueDateTo || undefined,
      memberFilters: searchFilters.selectedMembers.length > 0 ? searchFilters.selectedMembers : undefined,
      priorityFilters: searchFilters.selectedPriorities.length > 0 ? searchFilters.selectedPriorities : undefined,
      tagFilters: searchFilters.selectedTags.length > 0 ? searchFilters.selectedTags : undefined,
      projectFilter: searchFilters.projectId || undefined,
      taskFilter: searchFilters.taskId || undefined,
    };
  };

  // Helper function to convert API filter to SearchFilters format
  const convertAPIFiltersToSearchFilters = (view: SavedFilterView): SearchFilters => {
    return {
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
  };

  // Handle applying a saved filter
  const handleApplyFilter = (view: SavedFilterView | null) => {
    if (view) {
      const newFilters = convertAPIFiltersToSearchFilters(view);
      onFiltersChange(newFilters);
    } else {
      // Clear all filters (same as Clear All button)
      handleClearAllFilters();
    }
    onFilterViewChange?.(view);
    setShowFilterDropdown(false);
  };

  // Centralized clear all filters function
  const handleClearAllFilters = () => {
    onFiltersChange({
      text: '',
      dateFrom: '',
      dateTo: '',
      dueDateFrom: '',
      dueDateTo: '',
      selectedMembers: [],
      selectedPriorities: [],
      selectedTags: [],
      projectId: '',
      taskId: ''
    });
    onFilterViewChange?.(null); // Reset to "None"
    
    // Also clear column filters
    if (columns && onColumnsChange) {
      const allColumnIds = Object.keys(columns);
      onColumnsChange(allColumnIds);
    }
  };

  // Handle saving current filters as a new view
  const handleSaveFilter = async () => {
    if (!newFilterName.trim()) return;

    setIsSavingFilter(true);
    try {
      const apiFilters = convertFiltersForAPI(filters);
      const newView = await createSavedFilterView({
        filterName: newFilterName.trim(),
        filters: apiFilters,
        shared: false
      });
      
      setSavedFilterViews(prev => [...prev, newView]);
      setNewFilterName('');
      setShowSaveDialog(false);
      onFilterViewChange?.(newView);
    } catch (error) {
      console.error('Failed to save filter view:', error);
      // Could add a toast notification here
    } finally {
      setIsSavingFilter(false);
    }
  };

  // Handle updating an existing filter with current filter values
  const handleUpdateFilter = async (view: SavedFilterView) => {
    setIsSavingFilter(true);
    try {
      const apiFilters = convertFiltersForAPI(filters);
      const updatedView = await updateSavedFilterView(view.id, {
        filters: apiFilters
      });
      
      // Update the local list of saved filters
      setSavedFilterViews(prev => 
        prev.map(v => v.id === view.id ? updatedView : v)
      );
      
      // If this is the currently selected filter, update the current view as well
      if (currentFilterView?.id === view.id) {
        onFilterViewChange?.(updatedView);
      }
      
      setShowFilterDropdown(false);
    } catch (error) {
      console.error('Failed to update filter view:', error);
      // Could add a toast notification here
    } finally {
      setIsSavingFilter(false);
    }
  };

  // Check if current filters have any active filters
  const hasActiveFilters = () => {
    return !!(
      filters.text || 
      filters.dateFrom || 
      filters.dateTo || 
      filters.dueDateFrom || 
      filters.dueDateTo || 
      filters.selectedPriorities.length > 0 || 
      filters.selectedTags.length > 0 || 
      filters.projectId || 
      filters.taskId
    );
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      {/* Header with Collapse Toggle */}
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">SEARCH & FILTER</h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Search title, description, comments, requester..."
              value={filters.text}
              onChange={(e) => updateFilter('text', e.target.value)}
              className={`w-[280px] pr-6 ${getInputClassName(!!filters.text)}`}
            />
            {filters.text && (
              <button
                onClick={() => updateFilter('text', '')}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                title="Clear search"
              >
                <X size={10} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* Column Filter Dropdown */}
          {columns && onColumnsChange && visibleColumns && selectedBoard && (
            <ColumnFilterDropdown
              columns={columns}
              visibleColumns={visibleColumns}
              onColumnsChange={onColumnsChange}
              selectedBoard={selectedBoard}
            />
          )}

          {/* Project and Task Identifier Search Fields */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-700">Project id:</label>
            <div className="relative">
              <input
                type="text"
                placeholder="PROJ-00001"
                value={filters.projectId}
                onChange={(e) => updateFilter('projectId', e.target.value)}
                className={`w-[85px] pr-6 ${getInputClassName(!!filters.projectId)}`}
              />
              {filters.projectId && (
                <button
                  onClick={() => updateFilter('projectId', '')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear project id"
                >
                  <X size={10} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-700">Task id:</label>
            <div className="relative">
              <input
                type="text"
                placeholder="TASK-00001"
                value={filters.taskId}
                onChange={(e) => updateFilter('taskId', e.target.value)}
                className={`w-[85px] pr-6 ${getInputClassName(!!filters.taskId)}`}
              />
              {filters.taskId && (
                <button
                  onClick={() => updateFilter('taskId', '')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear task id"
                >
                  <X size={10} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
          
          {/* Active Filters Indicator */}
          {(() => {
            const hasSearchFilters = filters.text || filters.dateFrom || filters.dateTo || filters.dueDateFrom || filters.dueDateTo || filters.selectedPriorities.length > 0 || filters.selectedTags.length > 0 || filters.projectId || filters.taskId;
            
            // Check if any non-archived columns are hidden (archived columns are hidden by default)
            const hasColumnFilters = columns && visibleColumns && (() => {
              const allColumns = Object.values(columns);
              const nonArchivedColumns = allColumns.filter(col => !col.is_archived);
              const visibleNonArchivedColumns = visibleColumns.filter(colId => {
                const col = columns[colId];
                return col && !col.is_archived;
              });
              return visibleNonArchivedColumns.length < nonArchivedColumns.length;
            })();
            
            return hasSearchFilters || hasColumnFilters;
          })() && (
            <button
              onClick={handleToggleCollapse}
              className="text-red-600 text-xs font-medium hover:text-red-700 hover:underline cursor-pointer transition-colors"
              title={isCollapsed ? 'Click to view active filters' : 'Click to hide filters'}
            >
              Filters active
            </button>
          )}

          {/* Saved Filters Section */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">Save / apply:</span>
            
            {/* Filter Dropdown */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent min-w-[120px] flex items-center justify-between"
              >
                <span className="text-gray-600 dark:text-gray-300">
                  {currentFilterView ? currentFilterView.filterName : 'None'}
                </span>
                <ChevronDown size={12} className="text-gray-400 ml-2" />
              </button>
              
              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 min-w-[100px]">
                  {/* None option */}
                  <button
                    onClick={() => handleApplyFilter(null)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                  >
                    <span>None</span>
                    {!currentFilterView && <Check size={12} className="text-blue-500" />}
                  </button>
                  
                  {/* Save current filters option */}
                  {hasActiveFilters() && (
                    <>
                      <hr className="border-gray-200" />
                      <button
                        onClick={() => {
                          setShowFilterDropdown(false);
                          setShowSaveDialog(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 text-blue-600 flex items-center"
                      >
                        <Save size={12} className="mr-2" />
                        Save current filters...
                      </button>
                    </>
                  )}
                  
                  {/* My Filters Section */}
                  {savedFilterViews.length > 0 && (
                    <>
                      <hr className="border-gray-200" />
                      <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">
                        My Filters:
                      </div>
                      {savedFilterViews.map((view) => (
                        <div key={view.id} className="flex items-center group">
                          {/* Apply filter button (main area) */}
                          <button
                            onClick={() => handleApplyFilter(view)}
                            className="flex-1 text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span className="truncate">{view.filterName}</span>
                            {currentFilterView?.id === view.id && <Check size={12} className="text-blue-500" />}
                          </button>
                          
                          {/* Update filter button (only show when there are active filters) */}
                          {hasActiveFilters() && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateFilter(view);
                              }}
                              className="px-2 py-2 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                              title={`Update "${view.filterName}" with current filters`}
                              disabled={isSavingFilter}
                            >
                              <RefreshCw size={12} className={isSavingFilter ? 'animate-spin' : ''} />
                            </button>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Shared Filters Section */}
                  {sharedFilterViews && sharedFilterViews.length > 0 && (
                    <>
                      <hr className="border-gray-200" />
                      <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">
                        Shared Filters:
                      </div>
                      {sharedFilterViews.map((view) => (
                        <div key={`shared-${view.id}`} className="flex items-center">
                          {/* Apply filter button (main area) */}
                          <button
                            onClick={() => handleApplyFilter(view)}
                            className="flex-1 text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-blue-500">🌐</span>
                              <span className="truncate">{view.filterName}</span>
                              {view.creatorName && (
                                <span className="text-gray-400 text-xs">(by {view.creatorName})</span>
                              )}
                            </div>
                            {currentFilterView?.id === view.id && <Check size={12} className="text-blue-500" />}
                          </button>
                          {/* No update button for shared filters - users can't modify them */}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Manage Filters Button */}
            <button
              onClick={() => setShowManageModal(true)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Manage saved filters"
            >
              <Settings size={14} />
            </button>
          </div>
          
          {/* Clear All Filters Button */}
          {(() => {
            const hasSearchFilters = filters.text || filters.dateFrom || filters.dateTo || filters.dueDateFrom || filters.dueDateTo || filters.selectedPriorities.length > 0 || filters.selectedTags.length > 0 || filters.projectId || filters.taskId;
            
            // Check if any non-archived columns are hidden (archived columns are hidden by default)
            const hasColumnFilters = columns && visibleColumns && (() => {
              const allColumns = Object.values(columns);
              const nonArchivedColumns = allColumns.filter(col => !col.is_archived);
              const visibleNonArchivedColumns = visibleColumns.filter(colId => {
                const col = columns[colId];
                return col && !col.is_archived;
              });
              return visibleNonArchivedColumns.length < nonArchivedColumns.length;
            })();
            
            return hasSearchFilters || hasColumnFilters;
          })() && (
            <button
              onClick={handleClearAllFilters}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full border border-gray-300 transition-colors"
              title="Clear all filters"
            >
              <X size={16} />
            </button>
          )}
        </div>
        
        <button
          onClick={handleToggleCollapse}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title={isCollapsed ? 'Expand advanced search' : 'Collapse to basic search'}
        >
          {isCollapsed ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-3">
          {/* Row 1: Start Dates, User, Clear Button */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <label className="text-xs font-medium text-gray-700 absolute left-[60px] top-1/2 -translate-y-1/2">start from:</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className={`w-[140px] ml-[128px] ${getInputClassName(!!filters.dateFrom)}`}
              />
              {filters.dateFrom && (
                <button
                  onClick={() => updateFilter('dateFrom', '')}
                  className="absolute right-[30px] top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear start from date"
                >
                  <X size={8} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            <div className="relative">
              <label className="text-xs font-medium text-gray-700 absolute left-[5px] top-1/2 -translate-y-1/2">start to:</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className={`w-[140px] ml-[60px] ${getInputClassName(!!filters.dateTo)}`}
              />
              {filters.dateTo && (
                <button
                  onClick={() => updateFilter('dateTo', '')}
                  className="absolute right-[30px] top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear start to date"
                >
                  <X size={8} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Tags Dropdown */}
            <div className="relative" ref={tagsDropdownRef}>
                <button
                  onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                  className={getDropdownButtonClassName(filters.selectedTags.length > 0)}
                >
                  <span className="text-gray-700 text-xs">tag</span>
                  <ChevronDown size={12} className="text-gray-400" />
                </button>
                
                {showTagsDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg z-50 min-w-[180px] max-h-60 overflow-y-auto">
                    {availableTags.map(tag => (
                      <div
                        key={tag.id}
                        onClick={() => toggleTag(tag.id.toString())}
                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                      >
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: tag.color }}
                        ></div>
                        <span>{tag.tag}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {filters.selectedTags.map(tagId => {
                  const tag = availableTags.find(t => t.id.toString() === tagId);
                  if (!tag) return null;
                  return (
                    <div 
                      key={tagId} 
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border"
                      style={{
                        backgroundColor: tag.color || '#4ECDC4',
                        color: getTextColor(tag.color || '#4ECDC4'),
                        borderColor: getTextColor(tag.color || '#4ECDC4') === '#374151' ? '#d1d5db' : 'rgba(255, 255, 255, 0.3)'
                      }}
                    >
                      <span>{tag.tag}</span>
                      <button
                        onClick={() => toggleTag(tagId)}
                        className="ml-1 hover:bg-black hover:bg-opacity-10 rounded-full p-0.5 transition-colors"
                        title={`Remove ${tag.tag}`}
                      >
                        <X size={10} className="text-red-600" />
                      </button>
                    </div>
                  );
                })}
                
                {/* Clear All Tags Pill - only when multiple selections */}
                {filters.selectedTags.length > 1 && (
                  <div className="flex items-center bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs border border-red-300">
                    <button
                      onClick={() => updateFilter('selectedTags', [])}
                      className="p-0.5 hover:bg-red-200 rounded-full transition-colors"
                      title="Clear all tags"
                    >
                      <X size={10} className="text-red-600" />
                    </button>
                  </div>
                )}
              </div>

          </div>

          {/* Row 2: Due Dates, Priority */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <label className="text-xs font-medium text-gray-700 absolute left-[64px] top-1/2 -translate-y-1/2">due from:</label>
              <input
                type="date"
                value={filters.dueDateFrom}
                onChange={(e) => updateFilter('dueDateFrom', e.target.value)}
                className={`w-[140px] ml-[128px] ${getInputClassName(!!filters.dueDateFrom)}`}
              />
              {filters.dueDateFrom && (
                <button
                  onClick={() => updateFilter('dueDateFrom', '')}
                  className="absolute right-[30px] top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear due from date"
                >
                  <X size={8} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            <div className="relative">
              <label className="text-xs font-medium text-gray-700 absolute left-[10px] top-1/2 -translate-y-1/2">due to:</label>
              <input
                type="date"
                value={filters.dueDateTo}
                onChange={(e) => updateFilter('dueDateTo', e.target.value)}
                className={`w-[140px] ml-[60px] ${getInputClassName(!!filters.dueDateTo)}`}
              />
              {filters.dueDateTo && (
                <button
                  onClick={() => updateFilter('dueDateTo', '')}
                  className="absolute right-[30px] top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear due to date"
                >
                  <X size={8} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Priority Dropdown */}
            <div className="relative" ref={priorityDropdownRef}>
              <button
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                className={getDropdownButtonClassName(filters.selectedPriorities.length > 0)}
              >
                <span className="text-gray-700 text-xs">priority</span>
                <ChevronDown size={12} className="text-gray-400" />
              </button>
              
              {showPriorityDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg z-50 min-w-[150px] max-h-60 overflow-y-auto">
                  {availablePriorities.map(priorityOption => (
                    <div
                      key={priorityOption.id}
                      onClick={() => togglePriority(priorityOption.priority)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        {filters.selectedPriorities.includes(priorityOption.priority) && (
                          <Check size={12} className="text-blue-600" />
                        )}
                      </div>
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: priorityOption.color }}
                      />
                      <span className="text-gray-700">{priorityOption.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Priority Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {filters.selectedPriorities.map(priorityName => {
                const priority = availablePriorities.find(p => p.priority === priorityName);
                if (!priority) return null;
                return (
                  <div key={priorityName} className="flex items-center gap-1 bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs border border-gray-300">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: priority.color }}
                    />
                    <span className="font-medium">{priority.priority}</span>
                    <button
                      onClick={() => togglePriority(priorityName)}
                      className="p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                      title="Remove priority"
                    >
                      <X size={10} className="text-gray-600" />
                    </button>
                  </div>
                );
              })}
              
              {/* Clear All Priorities Pill - only when multiple selections */}
              {filters.selectedPriorities.length > 1 && (
                <div className="flex items-center bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs border border-red-300">
                  <button
                    onClick={() => updateFilter('selectedPriorities', [])}
                    className="p-0.5 hover:bg-red-200 rounded-full transition-colors"
                    title="Clear all priorities"
                  >
                    <X size={10} className="text-red-600" />
                  </button>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* Save Filter Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Save Filter</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter Name
              </label>
              <input
                type="text"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                placeholder="Enter filter name..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFilterName.trim()) {
                    handleSaveFilter();
                  } else if (e.key === 'Escape') {
                    setShowSaveDialog(false);
                    setNewFilterName('');
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewFilterName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={isSavingFilter}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFilter}
                disabled={!newFilterName.trim() || isSavingFilter}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSavingFilter ? 'Saving...' : 'Save Filter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Filters Modal */}
      <ManageFiltersModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        savedFilterViews={savedFilterViews}
        onViewsUpdated={setSavedFilterViews}
        currentFilterView={currentFilterView}
        onCurrentFilterViewChange={onFilterViewChange}
        onRefreshFilters={loadSavedFilters}
      />
    </div>
  );
}
