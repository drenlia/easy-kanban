import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Board, Task } from '../types';
import { useSortable, SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { 
  BoardDropState, 
  shouldShowDropReady, 
  canMoveTaskToBoard, 
  getBoardTabDropClasses 
} from '../utils/crossBoardDragUtils';

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
  const isHovering = isOver && isDragActive;
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
        // Much longer delay to prevent rapid switching between adjacent tabs
        timeoutId = setTimeout(() => {
          onHoverEnd();
        }, 800);
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

  const tabClasses = getBoardTabDropClasses(isDropReady && canDrop, isHovering && canDrop, isDragActive);

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      style={{
        userSelect: isDragActive && canDrop ? 'none' : 'auto'
      }}
      className={`
        px-4 py-2 text-sm font-medium rounded-t-lg cursor-pointer
        flex items-center gap-2 whitespace-nowrap min-w-[100px] justify-center
        ${isDragActive && canDrop ? 'mx-4' : ''}
        ${isSelected 
          ? 'bg-white text-gray-900 border-t border-l border-r border-gray-200' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
        }
        ${isDragActive && canDrop && (isHovering || isDropReady) ? 'bg-blue-100 border-2 border-blue-400 scale-105 shadow-lg' : ''}
        ${tabClasses}
        transition-all duration-200
      `}
      title={`${board.title}${isDragActive && canDrop ? ' (Drop task here)' : ''}`}
    >
      {/* Always show normal tab content - visual feedback comes from border/glow effects */}
      <div className={`flex items-center gap-2 ${isDragActive && canDrop ? 'pointer-events-none' : ''}`}>
        <span className="truncate max-w-[150px] pointer-events-none">{board.title}</span>
        {taskCount !== undefined && taskCount > 0 && (
          <span className={`
            px-1.5 py-0.5 text-xs rounded-full font-medium min-w-[20px] text-center pointer-events-none
            ${hasActiveFilters ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white'}
          `}>
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      <div ref={setNodeRef} style={style} className="relative group">
        {/* Drag Handle - Small icon on the left */}
        <div
          className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
          </svg>
        </div>
        
        {/* Main Tab Button - Now clickable without drag interference */}
        <button
          onClick={onSelect}
          onDoubleClick={onEdit}
          className={`px-4 py-3 pl-6 pr-3 text-sm font-medium rounded-t-lg transition-all cursor-pointer ${
            isSelected
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } ${isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''}`}
          title="Click to select, double-click to rename (Admin only)"
        >
          <div className="flex items-center gap-2">
            <span>{board.title}</span>
            {showTaskCount && taskCount !== undefined && taskCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                {taskCount}
              </span>
            )}
          </div>
        </button>
        
        {/* Delete Button - Admin Only */}
        {canDelete && (
          <button
            ref={setDeleteButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-1 -right-1 p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
            title="Delete board (Admin only)"
          >
            <span className="text-xs font-bold">×</span>
          </button>
        )}
      </div>

      {/* Delete Confirmation Menu - Using portal to escape stacking context */}
      {canDelete && showDeleteConfirm === board.id && deleteButtonRef && createPortal(
        <div 
          className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-[9999] min-w-[140px]"
          style={{
            top: `${deleteButtonRef.getBoundingClientRect().bottom + 5}px`,
            left: `${deleteButtonRef.getBoundingClientRect().left - 120}px`,
          }}
        >
          <div className="text-sm text-gray-700 mb-2">
            {(taskCount || 0) > 0 
              ? `Delete board and ${taskCount} task${taskCount !== 1 ? 's' : ''}?`
              : 'Delete empty board?'
            }
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onConfirmDelete(board.id)}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={onCancelDelete}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              No
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
  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`px-4 py-3 pr-3 text-sm font-medium rounded-t-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        title="Click to select board"
      >
        <div className="flex items-center gap-2">
          <span>{board.title}</span>
          {showTaskCount && taskCount !== undefined && taskCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
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
  onTaskDropOnBoard
}: BoardTabsProps) {
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
      <div className="flex items-center gap-2 p-4">
        <h2 className="text-lg font-semibold text-gray-600">No Boards</h2>
        {isAdmin && (
          <button
            onClick={onAddBoard}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            title="Add Board (Admin only)"
          >
            <Plus size={18} />
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
    if (!showDeleteConfirm) return; // Only add listener when confirmation is showing
    
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

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        {/* Board Tabs */}
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Scroll left"
            >
              <ChevronLeft size={16} className="text-gray-600" />
            </button>
          )}
          
          {/* Scrollable tabs container */}
          <div 
            ref={tabsContainerRef}
            className="flex items-center space-x-1 overflow-x-auto flex-1 min-w-0 hide-scrollbar"
          >
            {isAdmin ? (
              // Admin view with drag and drop (only when not dragging tasks)
              draggedTask ? (
                // When dragging a task, render tabs without board DndContext to allow cross-board drops
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {boards.map(board => (
                    <div key={board.id}>
                      {editingBoardId === board.id ? (
                        // Inline editing form
                        <form onSubmit={handleTitleSubmit} className="px-4 py-3">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onBlur={handleTitleSubmit}
                            disabled={isSubmitting}
                          />
                        </form>
                      ) : (
                        // Droppable tab for cross-board drops
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
                  <SortableContext items={boards.map(board => board.id)} strategy={rectSortingStrategy}>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                  {boards.map(board => (
                  <div key={board.id}>
                    {editingBoardId === board.id ? (
                      // Inline editing form
                      <form onSubmit={handleTitleSubmit} className="px-4 py-3">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                // When dragging a task, render droppable tabs without nested DndContext
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {boards.map(board => (
                    <div key={board.id}>
                      {editingBoardId === board.id ? (
                        // Inline editing form
                        <form onSubmit={handleTitleSubmit} className="px-4 py-3">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onBlur={handleTitleSubmit}
                            disabled={isSubmitting}
                          />
                        </form>
                      ) : (
                        // Droppable tab for cross-board drops
                        <DroppableBoardTab
                          board={board}
                          isSelected={selectedBoard === board.id}
                          taskCount={getFilteredTaskCount ? getFilteredTaskCount(board.id) : 0}
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
              // Regular user view - use droppable tabs when dragging tasks
              <div className="flex items-center space-x-1 flex-shrink-0">
                {boards.map(board => (
                  <div key={board.id}>
                    {editingBoardId === board.id ? (
                      // Inline editing form
                      <form onSubmit={handleTitleSubmit} className="px-4 py-3">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          
          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Scroll right"
            >
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          )}
        </div>

        {/* Add Board Button - Admin Only */}
        {isAdmin && (
          <button
            onClick={onAddBoard}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            title="Add New Board (Admin only)"
          >
            <Plus size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
