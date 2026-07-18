import React from 'react';
import { useTranslation } from 'react-i18next';

export interface CrossBoardMoveConfirmationProps {
  isOpen: boolean;
  relationshipCount: number;
  targetBoardTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
}

/**
 * Confirms cross-board drag when the task has parent/child/related links (removed on move).
 */
const CrossBoardMoveConfirmation: React.FC<CrossBoardMoveConfirmationProps> = ({
  isOpen,
  relationshipCount,
  targetBoardTitle,
  onConfirm,
  onCancel,
  isBusy = false,
}) => {
  const { t } = useTranslation(['tasks', 'common']);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-black/50"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-board-move-title"
        onClick={e => e.stopPropagation()}
      >
        <h2
          id="cross-board-move-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3"
        >
          {t('relationships.moveBoardConfirmTitle')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
          {relationshipCount === 1
            ? t('relationships.moveBoardConfirmBody_one')
            : t('relationships.moveBoardConfirmBody_other', { count: relationshipCount })}
        </p>
        {targetBoardTitle ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('relationships.moveBoardTargetBoard', { board: targetBoardTitle })}
          </p>
        ) : (
          <div className="mb-4" />
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-md bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
          >
            {t('buttons.cancel', { ns: 'common' })}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isBusy ? t('relationships.moveBoardMoving') : t('relationships.moveBoardConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CrossBoardMoveConfirmation;
