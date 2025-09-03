import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check, ChevronUp } from 'lucide-react';
import { Priority, PriorityOption, Tag } from '../types';
import { getAllTags } from '../api';
import { loadUserPreferences, updateUserPreference } from '../utils/userPreferences';

interface SearchFilters {
  text: string;
  dateFrom: string;
  dateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  selectedMembers: string[];
  selectedPriorities: Priority[];
  selectedTags: string[];
}

interface SearchInterfaceProps {
  filters: SearchFilters;
  availablePriorities: PriorityOption[];
  onFiltersChange: (filters: SearchFilters) => void;
}

export default function SearchInterface({
  filters,
  availablePriorities,
  onFiltersChange
}: SearchInterfaceProps) {
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const prefs = loadUserPreferences();
    return !prefs.isAdvancedSearchExpanded;
  });
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const tagsDropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
      }
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      {/* Header with Collapse Toggle */}
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">SEARCH & FILTER</h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Search title, description, comments, requester..."
              value={filters.text}
              onChange={(e) => updateFilter('text', e.target.value)}
              className="w-[280px] px-2 py-1 pr-6 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
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
          
          {/* Active Filters Indicator */}
          {(filters.text || filters.dateFrom || filters.dateTo || filters.dueDateFrom || filters.dueDateTo || filters.selectedPriorities.length > 0 || filters.selectedTags.length > 0) && (
            <span className="text-red-600 text-xs font-medium">
              Filters active
            </span>
          )}
          
          {/* Clear All Filters Button */}
          {(filters.text || filters.dateFrom || filters.dateTo || filters.dueDateFrom || filters.dueDateTo || filters.selectedPriorities.length > 0 || filters.selectedTags.length > 0) && (
            <button
              onClick={() => onFiltersChange({
                text: '',
                dateFrom: '',
                dateTo: '',
                dueDateFrom: '',
                dueDateTo: '',
                selectedMembers: [], // Keep for compatibility but not used in UI
                selectedPriorities: [],
                selectedTags: []
              })}
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
                className="w-[140px] px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent ml-[128px]"
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
                className="w-[140px] px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent ml-[60px]"
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
                  className="bg-white border border-gray-300 rounded px-2 py-1 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent w-[70px] flex items-center justify-between"
                >
                  <span className="text-gray-700 text-xs">tag</span>
                  <ChevronDown size={12} className="text-gray-400" />
                </button>
                
                {showTagsDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-[180px] max-h-60 overflow-y-auto">
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
                className="w-[140px] px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent ml-[128px]"
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
                className="w-[140px] px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent ml-[60px]"
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
                className="bg-white border border-gray-300 rounded px-2 py-1 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent w-[70px] flex items-center justify-between"
              >
                <span className="text-gray-700 text-xs">priority</span>
                <ChevronDown size={12} className="text-gray-400" />
              </button>
              
              {showPriorityDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-[150px] max-h-60 overflow-y-auto">
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
    </div>
  );
}
