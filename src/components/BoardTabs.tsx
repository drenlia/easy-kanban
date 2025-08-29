import React, { useState } from 'react';
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
}

// Sortable Board Tab Component
const SortableBoardTab: React.FC<{
  board: Board;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  canDelete: boolean;
}> = ({ board, isSelected, onSelect, onEdit, onRemove, canDelete }) => {
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
        title="Click to select, double-click to rename"
      >
        {board.title}
      </button>
      
      {/* Delete Button - Only show on hover and if more than 1 board */}
      {canDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1 -right-1 p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
          title="Delete board"
        >
          <span className="text-xs font-bold">×</span>
        </button>
      )}
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
  onReorderBoards
}: BoardTabsProps) {
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle drag end for board reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const oldIndex = boards.findIndex(board => board.id === active.id);
      const newIndex = boards.findIndex(board => board.id === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBoards(active.id as string, newIndex);
      }
    }
  };



  if (boards.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4">
        <h2 className="text-lg font-semibold text-gray-600">No Boards</h2>
        <button
          onClick={onAddBoard}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          title="Add Board"
        >
          <Plus size={18} />
        </button>
      </div>
    );
  }

  const handleEditClick = (boardId: string) => {
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

  const handleTitleCancel = () => {
    setEditingBoardId(null);
    setEditingTitle('');
  };

  const handleRemoveClick = (boardId: string) => {
    if (boards.length > 1) {
      onRemoveBoard(boardId);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        {/* Board Tabs */}
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
                    />
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Board Button */}
        <button
          onClick={onAddBoard}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          title="Add New Board"
        >
          <Plus size={18} />
        </button>
      </div>


    </div>
  );
}
