import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Board } from '../types';
import { useSortable, SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, DragEndEvent } from '@dnd-kit/core';

interface BoardTabsProps {
  boards: Board[];
  selectedBoard: string | null;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
  onEditBoard: (boardId: string, newName: string) => void;
  onRemoveBoard: (boardId: string) => void;
  onReorderBoards: (boardId: string, newPosition: number) => void;
  isAdmin?: boolean;
}

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
}> = ({ board, isSelected, onSelect, onEdit, onRemove, canDelete, showDeleteConfirm, onConfirmDelete, onCancelDelete }) => {
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
        className={`px-4 py-3 pl-6 text-sm font-medium rounded-t-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        } ${isDragging ? 'opacity-50 scale-95 shadow-2xl transform rotate-2' : ''}`}
        title="Click to select, double-click to rename (Admin only)"
      >
        {board.title}
      </button>
      
      {/* Delete Button - Admin Only */}
      {canDelete && (
        <button
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
      
      {/* Delete Confirmation Menu */}
      {canDelete && showDeleteConfirm === board.id && (
        <div className="delete-confirmation absolute -top-1 -right-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-[140px]">
          <div className="text-sm text-gray-700 mb-2">
            {(() => {
              const board = boards.find(b => b.id === showDeleteConfirm);
              const taskCount = board ? Object.values(board.columns || {}).reduce((total, column) => 
                total + (column.tasks?.length || 0), 0) : 0;
              
              return taskCount > 0 
                ? `Delete board and ${taskCount} task${taskCount !== 1 ? 's' : ''}?`
                : 'Delete empty board?';
            })()}
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
        </div>
      )}
    </div>
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
}> = ({ board, isSelected, onSelect, onEdit, onRemove, canDelete }) => {
  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        title="Click to select board"
      >
        {board.title}
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
  isAdmin = false
}: BoardTabsProps) {
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

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
        {isAdmin ? (
          // Admin view with drag and drop
          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext items={boards.map(board => board.id)} strategy={rectSortingStrategy}>
              <div className="flex items-center space-x-1">
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
                      // Sortable tab button
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
                      />
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          // Regular user view without drag and drop
          <div className="flex items-center space-x-1">
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
                  // Regular tab button
                  <RegularBoardTab
                    board={board}
                    isSelected={selectedBoard === board.id}
                    onSelect={() => onSelectBoard(board.id)}
                    onEdit={() => handleEditClick(board.id)}
                    onRemove={() => handleRemoveClick(board.id)}
                    canDelete={boards.length > 1}
                  />
                )}
              </div>
            ))}
          </div>
        )}

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
