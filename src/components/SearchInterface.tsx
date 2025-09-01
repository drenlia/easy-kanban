import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X, ChevronDown, Check, ChevronUp } from 'lucide-react';
import { TeamMember, Priority, PriorityOption, Tag } from '../types';
import { getAllTags } from '../api';

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
  members: TeamMember[];
  availablePriorities: PriorityOption[];
  onFiltersChange: (filters: SearchFilters) => void;
}

export default function SearchInterface({
  filters,
  members,
  availablePriorities,
  onFiltersChange
}: SearchInterfaceProps) {
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const membersDropdownRef = useRef<HTMLDivElement>(null);
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

  const toggleMember = (memberId: string) => {
    const newSelectedMembers = filters.selectedMembers.includes(memberId)
      ? filters.selectedMembers.filter(id => id !== memberId)
      : [...filters.selectedMembers, memberId];
    updateFilter('selectedMembers', newSelectedMembers);
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
      if (membersDropdownRef.current && !membersDropdownRef.current.contains(event.target as Node)) {
        setShowMembersDropdown(false);
      }
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
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">SEARCH & FILTER</h3>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title={isCollapsed ? 'Expand search panel' : 'Collapse search panel'}
        >
          {isCollapsed ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-3">
          {/* Row 1: Search, Start Dates, User */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative w-[160px]">
              <input
                type="text"
                placeholder="Search tasks..."
                value={filters.text}
                onChange={(e) => updateFilter('text', e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {filters.text && (
                <button
                  onClick={() => updateFilter('text', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
                  title="Clear search"
                >
                  <X size={14} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Start Dates - Aligned */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 w-[65px]">start from:</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-[140px] px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 w-[50px]">start to:</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="w-[140px] px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* User Dropdown */}
            <div className="relative" ref={membersDropdownRef}>
              <button
                onClick={() => setShowMembersDropdown(!showMembersDropdown)}
                className="bg-white border border-gray-300 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[100px] flex items-center justify-between relative"
              >
                <span className="text-gray-700">
                  {filters.selectedMembers.length === 0 
                    ? 'user...' 
                    : `${filters.selectedMembers.length}`
                  }
                </span>
                <div className="flex items-center gap-1">
                  {filters.selectedMembers.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter('selectedMembers', []);
                      }}
                      className="p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                      title="Clear user selection"
                    >
                      <X size={10} className="text-gray-500" />
                    </button>
                  )}
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </button>
              
              {showMembersDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-[180px] max-h-60 overflow-y-auto">
                  {members.map(member => (
                    <div
                      key={member.id}
                      onClick={() => toggleMember(member.id)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        {filters.selectedMembers.includes(member.id) && (
                          <Check size={12} className="text-blue-600" />
                        )}
                      </div>
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: member.color }}
                      />
                      <span className="text-gray-700">{member.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear Button */}
            <div className="ml-auto">
              {(filters.text || filters.dateFrom || filters.dateTo || filters.dueDateFrom || filters.dueDateTo || filters.selectedMembers.length > 0 || filters.selectedPriorities.length > 0 || filters.selectedTags.length > 0) && (
                <button
                  onClick={() => onFiltersChange({
                    text: '',
                    dateFrom: '',
                    dateTo: '',
                    dueDateFrom: '',
                    dueDateTo: '',
                    selectedMembers: [],
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
          </div>

          {/* Row 2: Tags, Due Dates, Priority */}
          <div className="flex items-center gap-4">
            {/* Tags */}
            <div className="relative w-[160px]" ref={tagsDropdownRef}>
              <button
                onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between"
              >
                <span className="text-gray-700">
                  {filters.selectedTags.length === 0 
                    ? 'tag...' 
                    : `${filters.selectedTags.length}`
                  }
                </span>
                <div className="flex items-center gap-1">
                  {filters.selectedTags.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter('selectedTags', []);
                      }}
                      className="p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                      title="Clear tag selection"
                    >
                      <X size={10} className="text-gray-500" />
                    </button>
                  )}
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </button>
              
              {showTagsDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-[180px] max-h-60 overflow-y-auto">
                  {availableTags.map(tag => (
                    <div
                      key={tag.id}
                      onClick={() => toggleTag(tag.id.toString())}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        {filters.selectedTags.includes(tag.id.toString()) && (
                          <Check size={12} className="text-blue-600" />
                        )}
                      </div>
                      <div
                        className="px-2 py-1 rounded-full text-xs font-bold inline-block border"
                        style={{
                          backgroundColor: tag.color || '#4ECDC4',
                          color: getTextColor(tag.color || '#4ECDC4'),
                          borderColor: getTextColor(tag.color || '#4ECDC4') === '#374151' ? '#d1d5db' : 'rgba(255, 255, 255, 0.3)'
                        }}
                      >
                        {tag.tag}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Due Dates - Aligned */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 w-[65px]">due from:</label>
              <input
                type="date"
                value={filters.dueDateFrom}
                onChange={(e) => updateFilter('dueDateFrom', e.target.value)}
                className="w-[140px] px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 w-[50px]">due to:</label>
              <input
                type="date"
                value={filters.dueDateTo}
                onChange={(e) => updateFilter('dueDateTo', e.target.value)}
                className="w-[140px] px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Priority Dropdown */}
            <div className="relative" ref={priorityDropdownRef}>
              <button
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                className="bg-white border border-gray-300 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[100px] flex items-center justify-between"
              >
                <span className="text-gray-700">
                  {filters.selectedPriorities.length === 0 
                    ? 'priority...' 
                    : `${filters.selectedPriorities.length}`
                  }
                </span>
                <div className="flex items-center gap-1">
                  {filters.selectedPriorities.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter('selectedPriorities', []);
                      }}
                      className="p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                      title="Clear priority selection"
                    >
                      <X size={10} className="text-gray-500" />
                    </button>
                  )}
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
