import React from 'react';
import { Minimize2, Maximize2, Search } from 'lucide-react';

interface ToolsProps {
  isTasksShrunk: boolean;
  onToggleTaskShrink: () => void;
  isSearchActive: boolean;
  onToggleSearch: () => void;
}

export default function Tools({
  isTasksShrunk,
  onToggleTaskShrink,
  isSearchActive,
  onToggleSearch
}: ToolsProps) {
  return (
    <div className="p-3 bg-white shadow-sm rounded-lg mb-4 border border-gray-100 w-[150px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tools</h2>
      </div>

      <div className="flex gap-2 justify-center">
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

        {/* Task Shrink Toggle */}
        <button
          onClick={onToggleTaskShrink}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
            isTasksShrunk
              ? 'bg-blue-100 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
          }`}
          title={isTasksShrunk ? 'Expand task descriptions' : 'Shrink task descriptions'}
        >
          {isTasksShrunk ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </button>
      </div>
    </div>
  );
}
