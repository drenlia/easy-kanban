import React, { useState, useEffect, useRef } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  CurrentUser, 
  TeamMember, 
  Board, 
  Task, 
  Columns, 
  PriorityOption 
} from '../../types';
import { TaskViewMode } from '../../utils/userPreferences';
import TeamMembers from '../TeamMembers';
import Tools from '../Tools';
import SearchInterface from '../SearchInterface';
import KanbanColumn from '../Column';
import TaskCard from '../TaskCard';
import BoardTabs from '../BoardTabs';
import LoadingSpinner from '../LoadingSpinner';


interface KanbanPageProps {
  currentUser: CurrentUser | null;
  selectedTask: Task | null;
  loading: {
    general: boolean;
    tasks: boolean;
    boards: boolean;
    columns: boolean;
  };
  members: TeamMember[];
  boards: Board[];
  selectedBoard: string | null;
  columns: Columns;
  selectedMembers: string[];
  draggedTask: Task | null;
  draggedColumn: any;
  dragPreview: any;
  availablePriorities: PriorityOption[];
  taskViewMode: TaskViewMode;
  isSearchActive: boolean;
  searchFilters: any;
  filteredColumns: Columns;
  activeFilters: boolean;
  gridStyle: React.CSSProperties;
  sensors: any;
  collisionDetection: any;

  
  // Event handlers
  onSelectMember: (memberId: string) => void;
  onClearMemberSelections: () => void;
  onSelectAllMembers: () => void;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  onToggleAssignees: (include: boolean) => void;
  onToggleWatchers: (include: boolean) => void;
  onToggleCollaborators: (include: boolean) => void;
  onToggleRequesters: (include: boolean) => void;
  onToggleTaskViewMode: () => void;
  onToggleSearch: () => void;
  onSearchFiltersChange: (filters: any) => void;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => Promise<void>;
  onEditBoard: (boardId: string, title: string) => Promise<void>;
  onRemoveBoard: (boardId: string) => Promise<void>;
  onReorderBoards: (boardId: string, newPosition: number) => Promise<void>;
  getTaskCountForBoard: (board: Board) => number;
  onDragStart: (event: any) => void;
  onDragOver: (event: any) => void;
  onDragEnd: (event: any) => void;
  onAddTask: (columnId: string) => Promise<void>;
  columnWarnings: {[columnId: string]: string};
  onDismissColumnWarning: (columnId: string) => void;
  onRemoveTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => Promise<void>;
  onCopyTask: (task: Task) => Promise<void>;
  onEditColumn: (columnId: string, title: string) => Promise<void>;
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: () => Promise<void>;
  onTaskDragStart: (task: Task) => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onTaskDrop: () => Promise<void>;
  onSelectTask: (task: Task | null) => void;
}

const KanbanPage: React.FC<KanbanPageProps> = ({
  currentUser,
  selectedTask,
  loading,
  members,
  boards,
  selectedBoard,
  columns,
  selectedMembers,
  draggedTask,
  draggedColumn,
  dragPreview,
  availablePriorities,
  taskViewMode,
  isSearchActive,
  searchFilters,
  filteredColumns,
  activeFilters,
  gridStyle,
  sensors,
  collisionDetection,
  onSelectMember,
  onClearMemberSelections,
  onSelectAllMembers,
  includeAssignees,
  includeWatchers,
  includeCollaborators,
  includeRequesters,
  onToggleAssignees,
  onToggleWatchers,
  onToggleCollaborators,
  onToggleRequesters,
  onToggleTaskViewMode,
  onToggleSearch,
  onSearchFiltersChange,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard,
  onReorderBoards,
  getTaskCountForBoard,
  onDragStart,
  onDragOver,
  onDragEnd,
  onAddTask,
  columnWarnings,
  onDismissColumnWarning,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  onSelectTask,
}) => {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);

  // Check scroll state for columns
  const checkColumnsScrollState = () => {
    if (!columnsContainerRef.current) return;
    
    const container = columnsContainerRef.current;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
  };

  // Column scroll functions
  const scrollColumnsLeft = () => {
    if (!columnsContainerRef.current) return;
    const container = columnsContainerRef.current;
    
    // Calculate actual column width including gap (300px min + 1.5rem gap)
    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    
    container.scrollBy({ left: -columnFullWidth, behavior: 'smooth' });
  };

  const scrollColumnsRight = () => {
    if (!columnsContainerRef.current) return;
    const container = columnsContainerRef.current;
    
    // Calculate actual column width including gap (300px min + 1.5rem gap)
    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    
    container.scrollBy({ left: columnFullWidth, behavior: 'smooth' });
  };

  // Continuous scroll functions
  const startContinuousScroll = (direction: 'left' | 'right') => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    const container = columnsContainerRef.current;
    if (!container) return;

    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    const scrollAmount = direction === 'left' ? -columnFullWidth : columnFullWidth;

    // Initial scroll
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });

    // Continuous scroll with interval
    scrollIntervalRef.current = setInterval(() => {
      if (!columnsContainerRef.current) {
        stopContinuousScroll();
        return;
      }

      const currentContainer = columnsContainerRef.current;
      const canContinue = direction === 'left' 
        ? currentContainer.scrollLeft > 0
        : currentContainer.scrollLeft < currentContainer.scrollWidth - currentContainer.clientWidth;

      if (!canContinue) {
        stopContinuousScroll();
        return;
      }

      currentContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }, 300); // Scroll every 300ms for smooth continuous movement
  };

  const stopContinuousScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    isScrollingRef.current = false;
  };

  // Update scroll state when columns change
  useEffect(() => {
    // Check scroll state after a short delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      checkColumnsScrollState();
    }, 100);
    
    const container = columnsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkColumnsScrollState);
      const resizeObserver = new ResizeObserver(() => {
        // Also delay the resize check
        setTimeout(checkColumnsScrollState, 50);
      });
      resizeObserver.observe(container);
      
      return () => {
        clearTimeout(timeoutId);
        container.removeEventListener('scroll', checkColumnsScrollState);
        resizeObserver.disconnect();
      };
    }
    
    return () => clearTimeout(timeoutId);
  }, [columns]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't interfere with form inputs
      }
      
      if (event.key === 'ArrowLeft' && canScrollLeft) {
        event.preventDefault();
        scrollColumnsLeft();
      } else if (event.key === 'ArrowRight' && canScrollRight) {
        event.preventDefault();
        scrollColumnsRight();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canScrollLeft, canScrollRight]);

  // Cleanup scroll intervals on unmount and handle global mouse events
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      stopContinuousScroll();
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      stopContinuousScroll();
    };
  }, []);

  if (loading.general) {
    return <LoadingSpinner size="large" className="mt-20" />;
  }

  return (
    <>
      {/* Tools and Team Members in a flex container */}
      <div className="flex gap-4 mb-4">
        <Tools 
          taskViewMode={taskViewMode}
          onToggleTaskViewMode={onToggleTaskViewMode}
          isSearchActive={isSearchActive}
          onToggleSearch={onToggleSearch}
        />
        <div className="flex-1">
          <TeamMembers
            members={members}
            selectedMembers={selectedMembers}
            onSelectMember={onSelectMember}
            onClearSelections={onClearMemberSelections}
            onSelectAll={onSelectAllMembers}
            includeAssignees={includeAssignees}
            includeWatchers={includeWatchers}
            includeCollaborators={includeCollaborators}
            includeRequesters={includeRequesters}
            onToggleAssignees={onToggleAssignees}
            onToggleWatchers={onToggleWatchers}
            onToggleCollaborators={onToggleCollaborators}
            onToggleRequesters={onToggleRequesters}
            currentUserId={currentUser?.id}
          />
        </div>
      </div>

      {/* Search Interface */}
      {isSearchActive && (
        <SearchInterface
          filters={searchFilters}
          availablePriorities={availablePriorities}
          onFiltersChange={onSearchFiltersChange}
        />
      )}

      {/* Board Tabs */}
      <BoardTabs
        boards={boards}
        selectedBoard={selectedBoard}
        onSelectBoard={onSelectBoard}
        onAddBoard={onAddBoard}
        onEditBoard={onEditBoard}
        onRemoveBoard={onRemoveBoard}
        onReorderBoards={onReorderBoards}
        isAdmin={currentUser?.roles?.includes('admin')}
        getFilteredTaskCount={getTaskCountForBoard}
        hasActiveFilters={activeFilters}
      />

      {selectedBoard && (
        <div className="relative">
          {(loading.tasks || loading.boards || loading.columns) && (
            <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
              <LoadingSpinner size="medium" />
            </div>
          )}
          
          {/* Columns Navigation Container */}
          <div className="relative">
            {/* Left scroll button - positioned outside board */}
            {canScrollLeft && (
              <button
                onClick={scrollColumnsLeft}
                onMouseDown={() => startContinuousScroll('left')}
                onMouseUp={stopContinuousScroll}
                onMouseLeave={stopContinuousScroll}
                className="absolute -left-12 top-4 z-20 p-2 bg-white bg-opacity-60 hover:bg-opacity-95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                title="Click or hold to scroll left (←)"
              >
                <ChevronLeft size={18} className="text-gray-500 hover:text-gray-700" />
              </button>
            )}
            
            {/* Right scroll button - positioned outside board */}
            {canScrollRight && (
              <button
                onClick={scrollColumnsRight}
                onMouseDown={() => startContinuousScroll('right')}
                onMouseUp={stopContinuousScroll}
                onMouseLeave={stopContinuousScroll}
                className="absolute -right-12 top-4 z-20 p-2 bg-white bg-opacity-60 hover:bg-opacity-95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                title="Click or hold to scroll right (→)"
              >
                <ChevronRight size={18} className="text-gray-500 hover:text-gray-700" />
              </button>
            )}
            
            {/* Scrollable columns container */}
            <div
              ref={columnsContainerRef}
              className="overflow-x-auto w-full"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: '#CBD5E1 #F1F5F9'
              }}
            >
              {/* Unified Drag and Drop Context */}
              <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            {/* Admin view with column drag and drop */}
            {currentUser?.roles?.includes('admin') ? (
              <SortableContext
                items={Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(col => col.id)}
                strategy={rectSortingStrategy}
              >
                <div style={gridStyle}>
                  {Object.values(columns)
                    .sort((a, b) => (a.position || 0) - (b.position || 0))
                    .map(column => (
                                          <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      selectedMembers={selectedMembers}
                      selectedTask={selectedTask}
                      draggedTask={draggedTask}
                      draggedColumn={draggedColumn}
                      dragPreview={dragPreview}
                      onAddTask={onAddTask}
                      columnWarnings={columnWarnings}
                      onDismissColumnWarning={onDismissColumnWarning}
                      onRemoveTask={onRemoveTask}
                      onEditTask={onEditTask}
                      onCopyTask={onCopyTask}
                      onEditColumn={onEditColumn}
                      onRemoveColumn={onRemoveColumn}
                      onAddColumn={onAddColumn}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={true}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                    />
                    ))}
                </div>
              </SortableContext>
            ) : (
              /* Regular user view */
              <div style={gridStyle}>
                {Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(column => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      selectedMembers={selectedMembers}
                      selectedTask={selectedTask}
                      draggedTask={draggedTask}
                      draggedColumn={draggedColumn}
                      dragPreview={dragPreview}
                      onAddTask={onAddTask}
                      columnWarnings={columnWarnings}
                      onDismissColumnWarning={onDismissColumnWarning}
                      onRemoveTask={onRemoveTask}
                      onEditTask={onEditTask}
                      onCopyTask={onCopyTask}
                      onEditColumn={onEditColumn}
                      onRemoveColumn={onRemoveColumn}
                      onAddColumn={onAddColumn}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={false}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                    />
                  ))}
              </div>
            )}
            
            <DragOverlay 
              dropAnimation={null}
            >
              {draggedColumn ? (
                <div className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] opacity-90 scale-105 shadow-2xl transform rotate-3 ring-2 ring-blue-400">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-semibold text-gray-700">{draggedColumn.title}</div>
                  </div>
                  <div className="flex-1 min-h-[100px] space-y-2">
                    {draggedColumn.tasks.map((task: Task) => (
                      <div key={task.id} className="bg-white p-3 rounded border shadow-sm">
                        <div className="text-sm text-gray-600">{task.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : draggedTask ? (
                /* Render exact replica of the original TaskCard */
                <div style={{ transform: 'rotate(3deg) scale(1.05)', opacity: 0.95 }}>
                  <TaskCard
                    task={draggedTask}
                    member={members.find(m => m.id === draggedTask.memberId)!}
                    members={members}
                    onRemove={() => {}}
                    onEdit={() => {}}
                    onCopy={() => {}}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                    onSelect={() => {}}
                    isDragDisabled={true}
                    taskViewMode={taskViewMode}
                    availablePriorities={availablePriorities}
                  />
                </div>
              ) : null}
            </DragOverlay>
              </DndContext>
            </div>
          </div>
        </div>
      )}


    </>
  );
};

export default KanbanPage;
