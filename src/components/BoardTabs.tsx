import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Board } from '../types';
import RenameModal from './RenameModal';

interface BoardTabsProps {
  boards: Board[];
  selectedBoard: string | null;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
  onEditBoard: (boardId: string, newName: string) => void;
  onRemoveBoard: (boardId: string) => void;
}

export default function BoardTabs({
  boards,
  selectedBoard,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard
}: BoardTabsProps) {
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);

  // If no board is selected but boards exist, select the first one
  React.useEffect(() => {
    if (!selectedBoard && boards.length > 0) {
      onSelectBoard(boards[0].id);
    }
  }, [selectedBoard, boards, onSelectBoard]);

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
    setEditingBoardId(boardId);
    setShowRenameModal(true);
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
        <div className="flex items-center space-x-1">
          {boards.map(board => (
            <div key={board.id} className="relative group">
              <button
                onClick={() => onSelectBoard(board.id)}
                onDoubleClick={() => handleEditClick(board.id)}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-all ${
                  selectedBoard === board.id
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="Click to select, double-click to rename"
              >
                {board.title}
              </button>
              
                              {/* Delete Button - Only show on hover and if more than 1 board */}
                {boards.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveClick(board.id);
                    }}
                    className="absolute -top-1 -right-1 p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                    title="Delete board"
                  >
                    <span className="text-xs font-bold">×</span>
                  </button>
                  )}
            </div>
          ))}
        </div>

        {/* Add Board Button */}
        <button
          onClick={onAddBoard}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          title="Add New Board"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Rename Modal */}
      {showRenameModal && editingBoardId && (
        <RenameModal
          title="Rename Board"
          currentName={boards.find(b => b.id === editingBoardId)?.title || ''}
          onSubmit={(newName) => {
            onEditBoard(editingBoardId, newName);
            setShowRenameModal(false);
            setEditingBoardId(null);
          }}
          onClose={() => {
            setShowRenameModal(false);
            setEditingBoardId(null);
          }}
        />
      )}
    </div>
  );
}
