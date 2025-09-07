import React from 'react';
import { Minimize2, Maximize2, Search, Minus, LayoutGrid, List, Calendar } from 'lucide-react';
import { TaskViewMode, ViewMode } from '../utils/userPreferences';

interface ToolsProps {
  taskViewMode: TaskViewMode;
  onToggleTaskViewMode: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isSearchActive: boolean;
  onToggleSearch: () => void;
}

export default function Tools({
  taskViewMode,
  onToggleTaskViewMode,
  viewMode,
  onViewModeChange,
  isSearchActive,
  onToggleSearch
}: ToolsProps) {
  return (
    <div className="p-3 bg-white shadow-sm rounded-lg mb-4 border border-gray-100 w-[150px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tools</h2>
      </div>

      <div className="flex gap-2 justify-center">
        {/* View Mode Toggle */}
        <button
          onClick={() => {
            const modes: ViewMode[] = ['kanban', 'list', 'gantt'];
            const currentIndex = modes.indexOf(viewMode);
            const nextIndex = (currentIndex + 1) % (modes.length - 1); // Skip gantt for now
            onViewModeChange(modes[nextIndex]);
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
            viewMode !== 'kanban'
              ? 'bg-blue-100 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
          }`}
          title={
            viewMode === 'kanban' ? 'Switch to list view' :
            viewMode === 'list' ? 'Switch to kanban view' :
            'Switch to kanban view'
          }
        >
          {viewMode === 'kanban' ? <List size={16} /> :
           viewMode === 'list' ? <LayoutGrid size={16} /> :
           <LayoutGrid size={16} />}
        </button>

        {/* Search Toggle */}
        <button
          onClick={onToggleSearch}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
            isSearchActive
              ? 'bg-blue-100 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
          }`}
          title={isSearchActive ? 'Hide search filters' : 'Show search filters'}
        >
          <Search size={16} />
        </button>

        {/* Task View Mode Toggle - Show in both kanban and list view */}
        {(viewMode === 'kanban' || viewMode === 'list') && (
          <button
            onClick={onToggleTaskViewMode}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
              taskViewMode !== 'expand'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
            title={
              taskViewMode === 'compact' ? 'Switch to shrink view (truncated descriptions)' :
              taskViewMode === 'shrink' ? 'Switch to expand view (full descriptions)' :
              'Switch to compact view (no descriptions)'
            }
          >
            {taskViewMode === 'compact' ? <Minus size={16} /> :
             taskViewMode === 'shrink' ? <Minimize2 size={16} /> :
             <Maximize2 size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
