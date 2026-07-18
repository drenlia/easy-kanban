import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronLeft, ChevronRight, Trash2, GripVertical } from 'lucide-react';
import { Board, Task } from '../types';
import { useSortable, SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { 
  BoardDropState, 
  shouldShowDropReady, 
  canMoveTaskToBoard, 
  getBoardTabDropClasses 
} from '../utils/crossBoardDragUtils';

/** Inactive tab — sits on the track */
const tabTrackInactive =
  'rounded-lg px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-150 hover:bg-white/70 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-100';
/** Selected tab — raised chip */
const tabTrackActive =
  'rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200/90 dark:ring-gray-600/90 transition-shadow duration-150';

interface BoardTabsProps {
  boards: Board[];
  selectedBoard: string | null;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
  onEditBoard: (boardId: string, newName: string) => void;
  onRemoveBoard: (boardId: string) => void;
  onReorderBoards: (boardId: string, newPosition: number) => void;
  isAdmin?: boolean;
  getFilteredTaskCount?: (board: Board) => number;
  hasActiveFilters?: boolean;
  // Cross-board drag props
  draggedTask?: Task | null;
  onTaskDropOnBoard?: (taskId: string, targetBoardId: string) => Promise<void>;
  // Site settings for prefix display
  siteSettings?: { [key: string]: string };
}

// Droppable Board Tab Component for cross-board task drops
const DroppableBoardTab: React.FC<{
  board: Board;
  isSelected: boolean;
  onSelect: () => void;
  taskCount?: number;
  hasActiveFilters: boolean;
  draggedTask: Task | null;
  selectedBoardId: string | null;
  boardDropState: BoardDropState;
  onHoverStart: (boardId: string) => void;
  onHoverEnd: () => void;
}> = ({ 
  board, 
  isSelected, 
  onSelect, 
  taskCount, 
  hasActiveFilters, 
  draggedTask,
  selectedBoardId,
  boardDropState,
  onHoverStart,
  onHoverEnd
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `board-${board.id}`,
    data: {
      type: 'board',
      boardId: board.id,
    },
  });

  const isDragActive = draggedTask !== null;
  
  // Get current mouse position to check if we're in the actual tab area
  const [currentMouseY, setCurrentMouseY] = React.useState(0);
  
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCurrentMouseY(e.clientY);
    };
    
    if (isDragActive) {
      document.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragActive]);
  
  // Check if mouse is actually in tab area (get tab bounds dynamically)
  const isMouseInTabArea = React.useMemo(() => {
    if (!isDragActive) return true; // Allow normal behavior when not dragging
    
    // Find the tab container to get bounds
    const tabContainer =
      document.querySelector('.board-tabs-scroll') ||
      document.querySelector('[data-board-tabs-scroll]') ||
      document.querySelector('.flex.items-center.space-x-1.overflow-x-auto') ||
      document.querySelector('[class*="board-tabs"]') ||
      document.querySelector('button[id^="board-"]')?.parentElement;
    
    if (tabContainer) {
      const rect = tabContainer.getBoundingClientRect();
      const tabTop = rect.top - 30; // Same 30px extension as in SimpleDragDropManager
      const tabBottom = rect.bottom;
      return currentMouseY >= tabTop && currentMouseY <= tabBottom;
    }
    
    return false; // If we can't find tab container, don't allow hover
  }, [isDragActive, currentMouseY]);
  
  // Only allow hovering if mouse is actually in tab area
  const isHovering = isOver && isDragActive && isMouseInTabArea;
  const isDropReady = shouldShowDropReady(
    board.id,
    boardDropState.hoveredBoardId,
    boardDropState.hoverStartTime,
    Date.now()
  );

  // Removed CSS hover state to prevent re-rendering issues

  const canDrop = draggedTask && canMoveTaskToBoard(draggedTask, board, selectedBoardId || '');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (isHovering && canDrop) {
      // Only call if we're not already hovering this board
      if (boardDropState.hoveredBoardId !== board.id) {
        onHoverStart(board.id);
      }
    } else if (!isHovering) {
      // Only call if we were hovering this board
      if (boardDropState.hoveredBoardId === board.id) {
        // Short delay to prevent rapid switching between adjacent tabs
        timeoutId = setTimeout(() => {
          onHoverEnd();
        }, 100);
      }
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isHovering, canDrop, board.id, boardDropState.hoveredBoardId, onHoverStart, onHoverEnd]);

  // Handle click during drop-ready state
  const handleClick = (e: React.MouseEvent) => {
    if (isDragActive && canDrop) {
      // Completely disable click interactions during task drag
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect();
  };

  const { t } = useTranslation('common');
  const tabClasses = getBoardTabDropClasses(isDropReady && canDrop, isHovering && canDrop, isDragActive);

  return (
    <div
      onClick={handleClick}
      style={{
        userSelect: isDragActive && canDrop ? 'none' : 'auto'
      }}
      className={`
        cursor-pointer flex items-center gap-2 whitespace-nowrap min-w-[5.5rem] justify-center
        ${isSelected ? tabTrackActive : tabTrackInactive}
        ${isDragActive && canDrop && (isHovering || isDropReady) ? 'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-blue-950/45 scale-[1.02] shadow-md' : ''}
        ${tabClasses}
        transition-all duration-200
        relative
      `}
      title={`${board.title}${isDragActive && canDrop ? ` (${t('boardTabs.dropTaskHere')})` : ''}`}
    >
      {/* VERY SMALL droppable area - only the inner content */}
      <div
        ref={setNodeRef}
        className="absolute inset-2 pointer-events-none"
        style={{ pointerEvents: isDragActive && canDrop ? 'auto' : 'none' }}
      />
      
      {/* Always show normal tab content - visual feedback comes from border/glow effects */}
      <div className={`flex items-center gap-2 ${isDragActive && canDrop ? 'pointer-events-none' : ''}`}>
        <span className="truncate max-w-[150px] pointer-events-none">{board.title}</span>
        {taskCount !== undefined && taskCount > 0 && (
          <span
            className={`
            px-1.5 py-0.5 text-[0.65rem] leading-none rounded-full font-semibold min-w-[1.25rem] text-center pointer-events-none tabular-nums
            ${hasActiveFilters ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100'}
          `}
          >
            {taskCount}
          </span>
        )}
      </div>
    </div>
  );
};

// Sortable Board Tab Component (Admin only)
const SortableBoardTab: React.FC<{
  board: Board;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  canDelete: boolean;
  showDeleteConfirm: string | null;
  onConfirmDelete: (boardId: string) => void;
  onCancelDelete: () => void;
  taskCount?: number;
  showTaskCount?: boolean;
}> = ({ board, isSelected, onSelect, onEdit, onRemove, canDelete, showDeleteConfirm, onConfirmDelete, onCancelDelete, taskCount, showTaskCount }) => {
  const [deleteButtonRef, setDeleteButtonRef] = useState<HTMLButtonElement | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: board.id });

  const { t } = useTranslation('common');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`
          relative group inline-flex max-w-full min-w-0 items-center
          ${isSelected ? tabTrackActive : tabTrackInactive}
          ${isDragging ? 'opacity-60 shadow-lg ring-2 ring-gray-300/50 dark:ring-gray-500/40' : ''}
        `}
      >
        {/* Drag handle — dedicated hit target, does not steal tab clicks */}
        <div
          className="absolute left-1 top-1/2 z-[2] -translate-y-1/2 flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded-md text-gray-400 opacity-60 transition-opacity hover:bg-gray-200/80 hover:text-gray-600 active:cursor-grabbing dark:hover:bg-gray-600/50 dark:hover:text-gray-300 group-hover:opacity-100"
          title={t('boardTabs.dragToReorder')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </div>

        <div className="flex min-w-0 flex-1 items-center pl-8">
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={onEdit}
            className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent text-left text-inherit transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 rounded-sm"
            title={t('boardTabs.clickToSelectDoubleClickToRename')}
          >
            <div className="flex items-center gap-2">
              <span className="truncate max-w-[10rem]">{board.title}</span>
              {showTaskCount && taskCount !== undefined && taskCount > 0 && (
                <span className="shrink-0 px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none rounded-full tabular-nums bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200">
                  {taskCount}
                </span>
              )}
            </div>
          </button>

          {/* Zero width until this tab is hovered — only the active tab grows to reveal trash after the pill */}
          {canDelete && (
            <div
              className="flex max-w-0 shrink-0 items-center justify-end overflow-hidden opacity-0 transition-[max-width,opacity] duration-200 ease-out group-hover:max-w-[2.25rem] group-hover:opacity-100 group-focus-within:max-w-[2.25rem] group-focus-within:opacity-100"
            >
              <button
                type="button"
                ref={setDeleteButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-0 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                title={t('boardTabs.deleteBoard')}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Menu - Using portal to escape stacking context */}
      {canDelete && showDeleteConfirm === board.id && deleteButtonRef && createPortal(
        <div 
          className="delete-confirmation fixed z-[9999] min-w-[160px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800"
          style={{
            top: `${deleteButtonRef.getBoundingClientRect().bottom + 5}px`,
            left: `${deleteButtonRef.getBoundingClientRect().left - 120}px`,
          }}
        >
          <div className="mb-2 text-sm text-gray-700 dark:text-gray-200">
            {(taskCount || 0) > 0 
              ? t('boardTabs.deleteBoardAndTasks', { count: taskCount })
              : t('boardTabs.deleteEmptyBoard')
            }
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onConfirmDelete(board.id)}
              className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              {t('buttons.yes')}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-md bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
            >
              {t('buttons.no')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// Regular Board Tab Component (Non-admin users)
const RegularBoardTab: React.FC<{
  board: Board;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  canDelete: boolean;
  taskCount?: number;
  showTaskCount?: boolean;
}> = ({ board, isSelected, onSelect, onEdit, onRemove, canDelete, taskCount, showTaskCount }) => {
  const { t } = useTranslation('common');
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className={`${isSelected ? tabTrackActive : tabTrackInactive} w-full text-left`}
        title={t('boardTabs.clickToSelectBoard')}
      >
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[11rem]">{board.title}</span>
          {showTaskCount && taskCount !== undefined && taskCount > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none rounded-full tabular-nums bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200">
              {taskCount}
            </span>
          )}
        </div>
      </button>
      
      {/* Delete Button - Admin Only */}
      {/* Regular users cannot delete boards */}
    </div>
  );
};

export default function BoardTabs({
  boards,
  selectedBoard,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard,
  onReorderBoards,
  isAdmin = false,
  getFilteredTaskCount,
  hasActiveFilters = false,
  draggedTask,
  onTaskDropOnBoard,
  siteSettings
}: BoardTabsProps) {
  const { t } = useTranslation('common');
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  
  // Cross-board drag state
  const [boardDropState, setBoardDropState] = useState<BoardDropState>({
    hoveredBoardId: null,
    hoverStartTime: null,
    isDropReady: false
  });

  // Handle board hover for cross-board drops
  const handleBoardHoverStart = useCallback((boardId: string) => {
    setBoardDropState(prev => {
      // Prevent unnecessary state updates
      if (prev.hoveredBoardId === boardId) {
        return prev;
      }
      return {
        hoveredBoardId: boardId,
        hoverStartTime: Date.now(),
        isDropReady: false
      };
    });
  }, []);

  const handleBoardHoverEnd = useCallback(() => {
    setBoardDropState(prev => {
      // Prevent unnecessary state updates
      if (prev.hoveredBoardId === null) {
        return prev;
      }
      return {
        hoveredBoardId: null,
        hoverStartTime: null,
        isDropReady: false
      };
    });
  }, []);

  // Check scroll state
  const checkScrollState = () => {
    if (!tabsContainerRef.current) return;
    
    const container = tabsContainerRef.current;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
  };

  // Scroll functions
  const scrollLeft = () => {
    if (!tabsContainerRef.current) return;
    tabsContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollRight = () => {
    if (!tabsContainerRef.current) return;
    tabsContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // Update scroll state on mount and when boards change or container resizes
  useEffect(() => {
    // Check scroll state after a short delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      checkScrollState();
    }, 100);
    
    const container = tabsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollState);
      const resizeObserver = new ResizeObserver(() => {
        // Also delay the resize check
        setTimeout(checkScrollState, 50);
      });
      resizeObserver.observe(container);
      
      return () => {
        clearTimeout(timeoutId);
        container.removeEventListener('scroll', checkScrollState);
        resizeObserver.disconnect();
      };
    }
    
    return () => clearTimeout(timeoutId);
  }, [boards]);

  // Handle drag end for board reordering (Admin only)
  const handleDragEnd = (event: DragEndEvent) => {
    if (!isAdmin) return;
    
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const oldIndex = boards.findIndex(board => board.id === active.id);
      const newIndex = boards.findIndex(board => board.id === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBoards(active.id as string, newIndex);
      }
    }
  };

  // Board selection is now handled by the main App.tsx logic
  // This effect has been removed to prevent automatic board selection

  if (boards.length === 0) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 dark:border-gray-600 dark:bg-gray-800/40">
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('boardTabs.noBoards')}</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={onAddBoard}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:text-blue-300"
            title={t('boardTabs.addBoard')}
            data-tour-id="add-board-button"
          >
            <Plus size={16} strokeWidth={2} />
            <span className="hidden sm:inline">{t('boardTabs.newBoard')}</span>
          </button>
        )}
      </div>
    );
  }

  const handleEditClick = (boardId: string) => {
    // Only admins can edit board titles
    if (!isAdmin) return;
    
    const board = boards.find(b => b.id === boardId);
    if (board) {
      setEditingBoardId(boardId);
      setEditingTitle(board.title);
    }
  };

  const handleTitleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTitle.trim() || isSubmitting || !editingBoardId) return;

    setIsSubmitting(true);
    try {
      await onEditBoard(editingBoardId, editingTitle.trim());
      setEditingBoardId(null);
      setEditingTitle('');
    } catch (error) {
      console.error('Failed to edit board:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveClick = (boardId: string) => {
    if (boards.length > 1) {
      // Check if board has any tasks
      const board = boards.find(b => b.id === boardId);
      const hasAnyTasks = board && Object.values(board.columns || {}).some(column => 
        column.tasks && column.tasks.length > 0
      );
      
      if (hasAnyTasks) {
        // Board has tasks, show confirmation
        setShowDeleteConfirm(boardId);
      } else {
        // Board is empty, delete immediately
        confirmDeleteBoard(boardId);
      }
    }
  };

  const confirmDeleteBoard = async (boardId: string) => {
    try {
      onRemoveBoard(boardId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete board:', error);
    }
  };

  const cancelDeleteBoard = () => {
    setShowDeleteConfirm(null);
  };

  // Close confirmation menu when clicking outside
  useEffect(() => {
    if (!showDeleteConfirm) {
      // If no confirmation is showing, don't add listeners but still call useEffect properly
      return;
    }
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Don't close if clicking on the delete confirmation menu or its children
      if (target.closest('.delete-confirmation')) {
        return;
      }
      setShowDeleteConfirm(null);
    };

    // Use a small delay to avoid interfering with the initial click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeleteConfirm]);

  // Get the current board's project identifier
  const currentBoard = boards.find(board => board.id === selectedBoard);
  const currentProject = currentBoard?.project;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2" data-tour-id="board-tabs">
          {canScrollLeft && (
            <button
              type="button"
              onClick={scrollLeft}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              title={t('boardTabs.scrollLeft')}
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
          )}

          <div
            ref={tabsContainerRef}
            data-board-tabs-scroll
            className="board-tabs-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl border border-gray-200/90 bg-gray-100/55 px-1 py-1 dark:border-gray-700/90 dark:bg-gray-800/45 hide-scrollbar"
          >
            {isAdmin ? (
              // Admin view with drag and drop (only when not dragging tasks)
              draggedTask ? (
                // When dragging a task, render tabs without board DndContext to allow cross-board drops
                <div className="flex flex-shrink-0 items-center gap-1">
                  {boards.map(board => (
                    <div key={board.id} className="shrink-0">
                      {editingBoardId === board.id ? (
                        <form
                          onSubmit={handleTitleSubmit}
                          className="min-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900"
                        >
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
                            autoFocus
                            onBlur={handleTitleSubmit}
                            disabled={isSubmitting}
                          />
                        </form>
                      ) : (
                        <DroppableBoardTab
                          board={board}
                          isSelected={selectedBoard === board.id}
                          onSelect={() => onSelectBoard(board.id)}
                          taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : 0}
                          hasActiveFilters={hasActiveFilters}
                          draggedTask={draggedTask}
                          selectedBoardId={selectedBoard}
                          boardDropState={boardDropState}
                          onHoverStart={handleBoardHoverStart}
                          onHoverEnd={handleBoardHoverEnd}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : !draggedTask ? (
                // Normal board management with DndContext (only when not dragging a task)
                <DndContext onDragEnd={handleDragEnd}>
                  <SortableContext items={boards.filter(board => board && board.id).map(board => board.id)} strategy={rectSortingStrategy}>
                    <div className="flex flex-shrink-0 items-center gap-1">
                  {boards.map(board => (
                  <div key={board.id} className="shrink-0">
                    {editingBoardId === board.id ? (
                      <form
                        onSubmit={handleTitleSubmit}
                        className="min-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900"
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
                          autoFocus
                          onBlur={handleTitleSubmit}
                          disabled={isSubmitting}
                        />
                      </form>
                    ) : draggedTask ? (
                      // When dragging a task, use droppable tab for cross-board drops
                      <DroppableBoardTab
                        board={board}
                        isSelected={selectedBoard === board.id}
                        onSelect={() => onSelectBoard(board.id)}
                        taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : 0}
                        hasActiveFilters={hasActiveFilters}
                        draggedTask={draggedTask}
                        selectedBoardId={selectedBoard}
                        boardDropState={boardDropState}
                        onHoverStart={handleBoardHoverStart}
                        onHoverEnd={handleBoardHoverEnd}
                      />
                    ) : (
                      // Normal sortable tab button
                      <SortableBoardTab
                        board={board}
                        isSelected={selectedBoard === board.id}
                        onSelect={() => onSelectBoard(board.id)}
                        onEdit={() => handleEditClick(board.id)}
                        onRemove={() => handleRemoveClick(board.id)}
                        canDelete={boards.length > 1}
                        showDeleteConfirm={showDeleteConfirm}
                        onConfirmDelete={confirmDeleteBoard}
                        onCancelDelete={cancelDeleteBoard}
                        taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : undefined}
                        showTaskCount={true}
                      />
                    )}
                  </div>
                ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-shrink-0 items-center gap-1">
                  {boards.map(board => (
                    <div key={board.id} className="shrink-0">
                      {editingBoardId === board.id ? (
                        <form
                          onSubmit={handleTitleSubmit}
                          className="min-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900"
                        >
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
                            autoFocus
                            onBlur={handleTitleSubmit}
                            disabled={isSubmitting}
                          />
                        </form>
                      ) : (
                        <DroppableBoardTab
                          board={board}
                          isSelected={selectedBoard === board.id}
                          taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : 0}
                          hasActiveFilters={hasActiveFilters}
                          draggedTask={draggedTask}
                          selectedBoardId={selectedBoard}
                          boardDropState={boardDropState}
                          onSelect={() => onSelectBoard(board.id)}
                          onHoverStart={handleBoardHoverStart}
                          onHoverEnd={handleBoardHoverEnd}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-shrink-0 items-center gap-1">
                {boards.map(board => (
                  <div key={board.id} className="shrink-0">
                    {editingBoardId === board.id ? (
                      <form
                        onSubmit={handleTitleSubmit}
                        className="min-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900"
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
                          autoFocus
                          onBlur={handleTitleSubmit}
                          disabled={isSubmitting}
                        />
                      </form>
                    ) : draggedTask ? (
                      // When dragging a task, use droppable tab for cross-board drops
                      <DroppableBoardTab
                        board={board}
                        isSelected={selectedBoard === board.id}
                        onSelect={() => onSelectBoard(board.id)}
                        taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : 0}
                        hasActiveFilters={hasActiveFilters}
                        draggedTask={draggedTask}
                        selectedBoardId={selectedBoard}
                        boardDropState={boardDropState}
                        onHoverStart={handleBoardHoverStart}
                        onHoverEnd={handleBoardHoverEnd}
                      />
                    ) : (
                      // Regular tab button
                      <RegularBoardTab
                        board={board}
                        isSelected={selectedBoard === board.id}
                        onSelect={() => onSelectBoard(board.id)}
                        onEdit={() => handleEditClick(board.id)}
                        onRemove={() => handleRemoveClick(board.id)}
                        canDelete={boards.length > 1}
                        taskCount={getFilteredTaskCount ? getFilteredTaskCount(board) : undefined}
                        showTaskCount={true}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {canScrollRight && (
            <button
              type="button"
              onClick={scrollRight}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              title={t('boardTabs.scrollRight')}
            >
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={onAddBoard}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-400 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
            title={t('boardTabs.addNewBoard')}
            data-tour-id="add-board-button"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
};
