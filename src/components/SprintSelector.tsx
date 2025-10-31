import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Search, X } from 'lucide-react';

interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Task {
  id: string;
  sprintId?: string | null;
}

interface SprintSelectorProps {
  selectedSprintId: string | null;
  onSprintChange: (sprint: Sprint | null) => void;
  tasks?: Task[]; // All tasks for counting
}

const SprintSelector: React.FC<SprintSelectorProps> = ({
  selectedSprintId,
  onSprintChange,
  tasks = []
}) => {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch sprints from API
  useEffect(() => {
    const fetchSprints = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/sprints', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // Handle both { sprints: [] } and direct array responses
          setSprints(data.sprints || data || []);
        }
      } catch (error) {
        console.error('Failed to fetch sprints:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSprints();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Reset highlighted index when search term changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchTerm]);

  // Auto-scroll to highlighted option
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [highlightedIndex]);

  const selectedSprint = sprints.find(s => s.id === selectedSprintId);

  const filteredSprints = sprints.filter(sprint =>
    sprint.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate task counts for each sprint
  const getSprintTaskCount = (sprintId: string | null): number => {
    if (sprintId === null) {
      // Backlog: count tasks with sprintId = null or undefined
      return tasks.filter(task => !task.sprintId).length;
    }
    // Specific sprint: count tasks with matching sprintId
    return tasks.filter(task => task.sprintId === sprintId).length;
  };

  // Get total task count for "All Sprints"
  const totalTaskCount = tasks.length;

  // Check if "backlog" matches the search term
  const showBacklogOption = 'backlog'.includes(searchTerm.toLowerCase()) || searchTerm === '';

  // Total options = "All Sprints" + "Backlog" (if shown) + filtered sprints
  const totalOptions = 1 + (showBacklogOption ? 1 : 0) + filteredSprints.length;

  const handleSelectSprint = (sprint: Sprint | null) => {
    onSprintChange(sprint);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < totalOptions - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : -1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex === -1) {
          return;
        } else if (highlightedIndex === 0) {
          // "All Sprints" selected
          handleSelectSprint(null);
        } else if (highlightedIndex === 1 && showBacklogOption) {
          // "Backlog" selected - pass special value
          onSprintChange({ id: 'backlog', name: 'Backlog', start_date: '', end_date: '' } as any);
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
        } else {
          // Specific sprint selected
          const sprintIndex = showBacklogOption ? highlightedIndex - 2 : highlightedIndex - 1;
          const selectedSprint = filteredSprints[sprintIndex];
          if (selectedSprint) {
            handleSelectSprint(selectedSprint);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
        title="Select Sprint"
      >
        <Calendar className="h-4 w-4" />
        <span className="max-w-[150px] truncate">
          {selectedSprintId === 'backlog' ? 'Backlog' : selectedSprint ? selectedSprint.name : 'All Sprints'}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search sprints..."
                className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Sprint List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Loading sprints...
              </div>
            ) : filteredSprints.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {searchTerm ? 'No sprints found' : 'No sprints available'}
              </div>
            ) : (
              <>
                {/* All Sprints Option */}
                <button
                  ref={(el) => optionRefs.current[0] = el}
                  onClick={() => handleSelectSprint(null)}
                  onMouseEnter={() => setHighlightedIndex(0)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                    highlightedIndex === 0 ? 'bg-gray-50 dark:bg-gray-700' : ''
                  } ${
                    !selectedSprintId && selectedSprintId !== 'backlog' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className="font-medium">All Sprints</span>
                  <div className="flex items-center gap-2">
                    {totalTaskCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {totalTaskCount}
                      </span>
                    )}
                    {!selectedSprintId && selectedSprintId !== 'backlog' && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">(No filter)</span>
                    )}
                  </div>
                </button>

                {/* Backlog Option */}
                {showBacklogOption && (
                  <button
                    ref={(el) => optionRefs.current[1] = el}
                    onClick={() => {
                      onSprintChange({ id: 'backlog', name: 'Backlog', start_date: '', end_date: '' } as any);
                      setIsOpen(false);
                      setSearchTerm('');
                      setHighlightedIndex(-1);
                    }}
                    onMouseEnter={() => setHighlightedIndex(1)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                      highlightedIndex === 1 ? 'bg-gray-50 dark:bg-gray-700' : ''
                    } ${
                      selectedSprintId === 'backlog' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span className="font-medium">Backlog</span>
                    <div className="flex items-center gap-2">
                      {getSprintTaskCount(null) > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {getSprintTaskCount(null)}
                        </span>
                      )}
                      {selectedSprintId === 'backlog' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">(Unassigned)</span>
                      )}
                    </div>
                  </button>
                )}

                <div className="border-t border-gray-200 dark:border-gray-700"></div>

                {/* Sprint Options */}
                {filteredSprints.map((sprint, index) => {
                  const optionIndex = showBacklogOption ? index + 2 : index + 1;
                  return (
                    <button
                      key={sprint.id}
                      ref={(el) => optionRefs.current[optionIndex] = el}
                      onClick={() => handleSelectSprint(sprint)}
                      onMouseEnter={() => setHighlightedIndex(optionIndex)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        highlightedIndex === optionIndex ? 'bg-gray-50 dark:bg-gray-700' : ''
                      } ${
                        selectedSprintId === sprint.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${
                            selectedSprintId === sprint.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {sprint.name}
                            {sprint.is_active && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
                          </div>
                        </div>
                        {getSprintTaskCount(sprint.id) > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ml-2 flex-shrink-0">
                            {getSprintTaskCount(sprint.id)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SprintSelector;

