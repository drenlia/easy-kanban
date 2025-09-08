import React, { useState, useEffect, useRef } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { 
  CurrentUser, 
  TeamMember, 
  Board, 
  Task, 
  Columns, 
  PriorityOption,
  Tag 
} from '../../types';
import { TaskViewMode, ViewMode } from '../../utils/userPreferences';
import TeamMembers from '../TeamMembers';
import Tools from '../Tools';
import SearchInterface from '../SearchInterface';
import KanbanColumn from '../Column';
import TaskCard from '../TaskCard';
import BoardTabs from '../BoardTabs';
import LoadingSpinner from '../LoadingSpinner';
import ListView from '../ListView';


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
  availableTags: Tag[];
  taskViewMode: TaskViewMode;
  viewMode: ViewMode;
  isSearchActive: boolean;
  searchFilters: any;
  filteredColumns: Columns;
  activeFilters: boolean;
  gridStyle: React.CSSProperties;
  sensors: any;
  collisionDetection: any;
  siteSettings: { [key: string]: string };

  
  // Event handlers
  onSelectMember: (memberId: string) => void;
  onClearMemberSelections: () => void;
  onSelectAllMembers: () => void;
  isAllModeActive: boolean;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  includeSystem: boolean;
  onToggleAssignees: (include: boolean) => void;
  onToggleWatchers: (include: boolean) => void;
  onToggleCollaborators: (include: boolean) => void;
  onToggleRequesters: (include: boolean) => void;
  onToggleSystem: (include: boolean) => void;
  onToggleTaskViewMode: () => void;
  onViewModeChange: (mode: ViewMode) => void;
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
  onTagAdd: (taskId: string) => (tagId: string) => Promise<void>;
  onTagRemove: (taskId: string) => (tagId: string) => Promise<void>;
  onMoveTaskToColumn: (taskId: string, targetColumnId: string) => Promise<void>;
  animateCopiedTaskId?: string | null;
  onEditColumn: (columnId: string, title: string) => Promise<void>;
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: (afterColumnId: string) => Promise<void>;
  showColumnDeleteConfirm?: string | null;
  onConfirmColumnDelete?: (columnId: string) => Promise<void>;
  onCancelColumnDelete?: () => void;
  getColumnTaskCount?: (columnId: string) => number;
  onTaskDragStart: (task: Task) => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onTaskDrop: () => Promise<void>;
  onSelectTask: (task: Task | null) => void;
  onTaskDropOnBoard?: (taskId: string, targetBoardId: string) => Promise<void>;
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
  availableTags,
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
  isAllModeActive,
  includeAssignees,
  includeWatchers,
  includeCollaborators,
  includeRequesters,
  includeSystem,
  onToggleAssignees,
  onToggleWatchers,
  onToggleCollaborators,
  onToggleRequesters,
  onToggleSystem,
  onToggleTaskViewMode,
  viewMode,
  onViewModeChange,
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
  onTagAdd,
  onTagRemove,
  onMoveTaskToColumn,
  animateCopiedTaskId,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  showColumnDeleteConfirm,
  onConfirmColumnDelete,
  onCancelColumnDelete,
  getColumnTaskCount,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  onSelectTask,
  onTaskDropOnBoard,
  siteSettings,
}) => {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // ListView scroll controls
  const [listViewScrollControls, setListViewScrollControls] = useState<{
    canScrollLeft: boolean;
    canScrollRight: boolean;
    scrollLeft: () => void;
    scrollRight: () => void;
  } | null>(null);
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
  }, [columns, viewMode]);

  // Ensure scroll state is checked when switching to Kanban view
  useEffect(() => {
    if (viewMode === 'kanban') {
      // Small delay to ensure the Kanban columns are rendered
      const timeoutId = setTimeout(() => {
        checkColumnsScrollState();
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [viewMode]);

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
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
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
            isAllModeActive={isAllModeActive}
            includeAssignees={includeAssignees}
            includeWatchers={includeWatchers}
            includeCollaborators={includeCollaborators}
            includeRequesters={includeRequesters}
            includeSystem={includeSystem}
            onToggleAssignees={onToggleAssignees}
            onToggleWatchers={onToggleWatchers}
            onToggleCollaborators={onToggleCollaborators}
            onToggleRequesters={onToggleRequesters}
            onToggleSystem={onToggleSystem}
            currentUserId={currentUser?.id}
            currentUser={currentUser}
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
        draggedTask={draggedTask}
        onTaskDropOnBoard={onTaskDropOnBoard}
        siteSettings={siteSettings}
      />

      {selectedBoard && (
        <div className="relative">
          {(loading.tasks || loading.boards || loading.columns) && (
            <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
              <LoadingSpinner size="medium" />
            </div>
          )}
          
          {/* Conditional View Rendering */}
          {viewMode === 'list' ? (
            <div className="relative">
              {/* ListView Navigation Chevrons */}
              {listViewScrollControls?.canScrollLeft && (
                <button
                  onClick={listViewScrollControls.scrollLeft}
                  className="absolute -left-12 top-4 z-20 p-2 bg-white bg-opacity-60 hover:bg-opacity-95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                  title="Click to scroll left (←)"
                >
                  <ChevronLeft size={18} className="text-gray-500 hover:text-gray-700" />
                </button>
              )}
              
              {listViewScrollControls?.canScrollRight && (
                <button
                  onClick={listViewScrollControls.scrollRight}
                  className="absolute -right-12 top-4 z-20 p-2 bg-white bg-opacity-60 hover:bg-opacity-95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                  title="Click to scroll right (→)"
                >
                  <ChevronRight size={18} className="text-gray-500 hover:text-gray-700" />
                </button>
              )}
              
              <ListView
                filteredColumns={filteredColumns}
                selectedBoard={selectedBoard}
                members={members}
                availablePriorities={availablePriorities}
                availableTags={availableTags}
                taskViewMode={taskViewMode}
                onSelectTask={onSelectTask}
                selectedTask={selectedTask}
                onRemoveTask={onRemoveTask}
                onEditTask={onEditTask}
                onCopyTask={onCopyTask}
                onMoveTaskToColumn={onMoveTaskToColumn}
                animateCopiedTaskId={animateCopiedTaskId}
                onScrollControlsChange={setListViewScrollControls}
              />
            </div>
          ) : viewMode === 'gantt' ? (
            <div className="text-center text-gray-500 py-20">
              <Calendar size={48} className="mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Gantt View Coming Soon</h3>
              <p>This feature is currently under development.</p>
            </div>
          ) : (
            <>
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
                             {/* DndContext handled at App level for global cross-board functionality */}
            {/* Admin view with column drag and drop */}
            {currentUser?.roles?.includes('admin') ? (
              // Re-enabled SortableContext for column reordering
              <SortableContext
                items={Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(column => column.id)
                }
                strategy={rectSortingStrategy}
              >
                <BoardDropArea selectedBoard={selectedBoard} style={gridStyle}>
                  {Object.values(columns)
                    .sort((a, b) => (a.position || 0) - (b.position || 0))
                    .map(column => (
                                          <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      currentUser={currentUser}
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
                      showColumnDeleteConfirm={showColumnDeleteConfirm}
                      onConfirmColumnDelete={onConfirmColumnDelete}
                      onCancelColumnDelete={onCancelColumnDelete}
                      getColumnTaskCount={getColumnTaskCount}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={true}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                      availableTags={availableTags}
                      onTagAdd={onTagAdd}
                      onTagRemove={onTagRemove}
                    />
                    ))}
                </BoardDropArea>
              </SortableContext>
            ) : (
              /* Regular user view */
              <BoardDropArea selectedBoard={selectedBoard} style={gridStyle}>
                {Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(column => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      currentUser={currentUser}
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
                      showColumnDeleteConfirm={showColumnDeleteConfirm}
                      onConfirmColumnDelete={onConfirmColumnDelete}
                      onCancelColumnDelete={onCancelColumnDelete}
                      getColumnTaskCount={getColumnTaskCount}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={false}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                      availableTags={availableTags}
                      onTagAdd={onTagAdd}
                      onTagRemove={onTagRemove}
                    />
                  ))}
              </BoardDropArea>
            )}
            </div>
          </div>
            </>
          )}
        </div>
      )}


    </>
  );
};

// Board-level droppable area to detect when entering board area from tabs
const BoardDropArea: React.FC<{ selectedBoard: string | null; style: React.CSSProperties; children: React.ReactNode }> = ({ selectedBoard, style, children }) => {
  const { setNodeRef } = useDroppable({
    id: `board-area-${selectedBoard}`,
    data: {
      type: 'board-area',
      boardId: selectedBoard
    }
  });

  return (
    <div ref={setNodeRef} style={style}>
      {children}
    </div>
  );
};

export default KanbanPage;
