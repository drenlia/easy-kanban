import React from 'react';
import { Minimize2, Maximize2, Search, Minus, LayoutGrid, List, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  
  return (
    <div className="p-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg mb-4 border border-gray-100 dark:border-gray-700 w-[150px]" data-tour-id="view-modes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{t('tools.title')}</h2>
      </div>

      <div className="flex gap-2 justify-center">
        {/* View Mode Toggle */}
        <button
          onClick={() => {
            const modes: ViewMode[] = ['kanban', 'list', 'gantt'];
            const currentIndex = modes.indexOf(viewMode);
            const nextIndex = (currentIndex + 1) % modes.length; // Include gantt now
            onViewModeChange(modes[nextIndex]);
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
            viewMode !== 'kanban'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
              : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          title={
            viewMode === 'kanban' ? t('tools.switchToListView') :
            viewMode === 'list' ? t('tools.switchToGanttView') :
            viewMode === 'gantt' ? t('tools.switchToKanbanView') :
            t('tools.switchToKanbanView')
          }
          data-tour-id="view-mode-toggle"
        >
          {viewMode === 'kanban' ? <List size={16} /> :
           viewMode === 'list' ? <Calendar size={16} /> :
           viewMode === 'gantt' ? <LayoutGrid size={16} /> :
           <LayoutGrid size={16} />}
        </button>

        {/* Search Toggle */}
        <button
          onClick={onToggleSearch}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
            isSearchActive
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
              : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          title={isSearchActive ? t('tools.hideSearchFilters') : t('tools.showSearchFilters')}
          data-tour-id="search-filter"
        >
          <Search size={16} />
        </button>

        {/* Task View Mode Toggle - Show in kanban, list, and gantt view */}
        {(viewMode === 'kanban' || viewMode === 'list' || viewMode === 'gantt') && (
          <button
            onClick={onToggleTaskViewMode}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-all ${
              taskViewMode !== 'expand'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
            title={
              taskViewMode === 'compact' ? t('tools.switchToShrinkView') :
              taskViewMode === 'shrink' ? t('tools.switchToExpandView') :
              t('tools.switchToCompactView')
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
