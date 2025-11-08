import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Settings2 } from 'lucide-react';
import { Board } from '../types';
import RenameModal from './RenameModal';

interface BoardHeaderProps {
  boards: Board[];
  selectedBoard: string | null;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
  onEditBoard: (boardId: string, newName: string) => void;
  onRemoveBoard: (boardId: string) => void;
  isAdmin?: boolean;
}

export default function BoardHeader({
  boards,
  selectedBoard,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard,
  isAdmin = false
}: BoardHeaderProps) {
  const { t } = useTranslation('common');
  const [showMenu, setShowMenu] = React.useState(false);
  const [showRenameModal, setShowRenameModal] = React.useState(false);
  const currentBoard = boards.find(b => b.id === selectedBoard);

  // Auto-close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenu) {
        const target = event.target as HTMLElement;
        // Check if click is outside the menu button and menu content
        if (!target.closest('.board-menu-container')) {
          setShowMenu(false);
        }
      }
    };

    // Add event listener when menu is open
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);



  if (boards.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">{t('boardHeader.noBoards')}</h2>
        {isAdmin && (
          <button
            onClick={onAddBoard}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            title={t('boardHeader.addBoardAdmin')}
          >
            <Plus size={16} className="text-gray-500" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative board-menu-container">
      <div className="flex items-center gap-2">
        <select
          value={selectedBoard || ''}
          onChange={(e) => onSelectBoard(e.target.value)}
          className="text-base font-semibold bg-transparent border-none focus:ring-0 cursor-pointer pr-6 text-gray-800"
        >
          {!selectedBoard && (
            <option value="" disabled>
              {t('boardHeader.selectBoard')}
            </option>
          )}
          {boards.map(board => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
        {/* Board Management Menu - Admin Only */}
        {isAdmin && (
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            title={t('boardHeader.boardManagementOptions')}
          >
            <Settings2 size={16} className="text-gray-500" />
          </button>
        )}
      </div>

      {showMenu && (
        <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-md shadow-lg z-50 border border-gray-100">
          <button
            onClick={() => {
              onAddBoard();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 border-b border-gray-50"
          >
            <Plus size={14} />
            {t('boardHeader.addBoard')}
          </button>
          <button
            onClick={() => {
              setShowRenameModal(true);
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-50"
          >
            {t('boardHeader.renameBoard')}
          </button>
          {boards.length > 1 && (
            <button
              onClick={() => {
                if (selectedBoard) {
                  onRemoveBoard(selectedBoard);
                }
                setShowMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-gray-50"
            >
              {t('boardHeader.deleteBoard')}
            </button>
          )}
        </div>
      )}

      {showRenameModal && currentBoard && (
        <RenameModal
          title={t('boardHeader.renameBoard')}
          currentName={currentBoard.title}
          onSubmit={(newName) => {
            if (selectedBoard) {
              onEditBoard(selectedBoard, newName);
            }
            setShowRenameModal(false);
          }}
          onClose={() => setShowRenameModal(false)}
        />
      )}
    </div>
  );
}
