import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X, ChevronDown, Check } from 'lucide-react';
import { TeamMember, Priority } from '../types';

interface SearchFilters {
  text: string;
  dateFrom: string;
  dateTo: string;
  selectedMembers: string[];
  selectedPriorities: Priority[];
}

interface SearchInterfaceProps {
  filters: SearchFilters;
  members: TeamMember[];
  availablePriorities: Priority[];
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
  const membersDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (membersDropdownRef.current && !membersDropdownRef.current.contains(event.target as Node)) {
        setShowMembersDropdown(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Text Search */}
        <div className="flex-shrink-0 relative">
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.text}
            onChange={(e) => updateFilter('text', e.target.value)}
            className="w-[300px] px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

        {/* Date Range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">from:</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter('dateFrom', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">to:</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter('dateTo', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Members Dropdown */}
        <div className="relative" ref={membersDropdownRef}>
          <label className="text-sm font-medium text-gray-700 mr-2">user:</label>
          <div className="relative inline-block">
            <button
              onClick={() => setShowMembersDropdown(!showMembersDropdown)}
              className="bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px] flex items-center justify-between"
            >
              <span className="text-gray-700">
                {filters.selectedMembers.length === 0 
                  ? 'Select users...' 
                  : `${filters.selectedMembers.length} selected`
                }
              </span>
              <ChevronDown size={14} className="text-gray-400" />
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
        </div>

        {/* Priority Dropdown */}
        <div className="relative" ref={priorityDropdownRef}>
          <label className="text-sm font-medium text-gray-700 mr-2">priority:</label>
          <div className="relative inline-block">
            <button
              onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
              className="bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[120px] flex items-center justify-between"
            >
              <span className="text-gray-700">
                {filters.selectedPriorities.length === 0 
                  ? 'Select priorities...' 
                  : `${filters.selectedPriorities.length} selected`
                }
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            
            {showPriorityDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-[150px] max-h-60 overflow-y-auto">
                {availablePriorities.map(priority => (
                  <div
                    key={priority}
                    onClick={() => togglePriority(priority)}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {filters.selectedPriorities.includes(priority) && (
                        <Check size={12} className="text-blue-600" />
                      )}
                    </div>
                    <span className="text-gray-700 capitalize">{priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Clear All Filters */}
        {(filters.text || filters.dateFrom || filters.dateTo || filters.selectedMembers.length > 0 || filters.selectedPriorities.length > 0) && (
          <button
            onClick={() => onFiltersChange({
              text: '',
              dateFrom: '',
              dateTo: '',
              selectedMembers: [],
              selectedPriorities: []
            })}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full border border-gray-300 transition-colors"
            title="Clear all filters"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
