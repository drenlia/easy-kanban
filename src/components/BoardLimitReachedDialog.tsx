import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export type BoardLimitInfo = {
  liveCount: number;
  softDeletedCount: number;
  boardLimit: number;
  details?: string;
};

type BoardLimitReachedDialogProps = {
  info: BoardLimitInfo;
  isAdmin: boolean;
  onClose: () => void;
  onOpenLifecycle: () => void;
};

/**
 * Explains that soft-deleted boards still occupy license slots and offers
 * admins a path to permanently purge them in Lifecycle.
 */
const BoardLimitReachedDialog: React.FC<BoardLimitReachedDialogProps> = ({
  info,
  isAdmin,
  onClose,
  onOpenLifecycle,
}) => {
  const { t } = useTranslation('common');
  const { liveCount, softDeletedCount, boardLimit } = info;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      const onPointer = (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (target?.closest('[data-board-limit-dialog]')) return;
        onClose();
      };
      document.addEventListener('mousedown', onPointer);
      remove = () => document.removeEventListener('mousedown', onPointer);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      remove?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        data-board-limit-dialog
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-limit-title"
      >
        <div className="mb-4 flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3
              id="board-limit-title"
              className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100"
            >
              {t('boardLimit.title')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('boardLimit.summary', {
                live: liveCount,
                trash: softDeletedCount,
                limit: boardLimit,
                total: liveCount + softDeletedCount,
              })}
            </p>
            {softDeletedCount > 0 && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                {isAdmin ? t('boardLimit.trashHintAdmin') : t('boardLimit.trashHintUser')}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            {t('buttons.close')}
          </button>
          {isAdmin && softDeletedCount > 0 && (
            <button
              type="button"
              onClick={onOpenLifecycle}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('boardLimit.openLifecycle')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BoardLimitReachedDialog;
