import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { KanbanChromeTooltip } from './KanbanChromeTooltip';

export type ColumnBulkUndoFabProps = {
  columnId: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  count: number;
  busy?: boolean;
  labelKey?: string;
  onUndo: () => void;
  onDismiss: () => void;
};

const btnClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-800 shadow-sm transition-colors hover:bg-amber-100 hover:text-amber-900 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/60';

/**
 * One-shot undo control in the same portal slot as the multi-select FAB.
 */
export default function ColumnBulkUndoFab({
  columnId,
  anchorRef,
  count,
  busy = false,
  labelKey = 'kanbanSelect.undoBulk',
  onUndo,
  onDismiss,
}: ColumnBulkUndoFabProps) {
  const { t } = useTranslation('tasks');
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootPos, setRootPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });

  useEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      const column = anchor?.closest('.column-container') as HTMLElement | null;
      if (!anchor || !column) {
        setRootPos((prev) => ({ ...prev, visible: false }));
        return;
      }

      const columnRect = column.getBoundingClientRect();
      const headerRect = anchor.getBoundingClientRect();
      const visible =
        columnRect.right > 0 &&
        columnRect.left < window.innerWidth &&
        columnRect.bottom > 0 &&
        columnRect.top < window.innerHeight;

      setRootPos({
        top: Math.max(96, headerRect.bottom + 4),
        left: Math.max(16, columnRect.left + 2),
        visible,
      });
    };

    update();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (typeof document === 'undefined') return null;

  const tooltip = t(labelKey, { count });

  return createPortal(
    <div
      ref={rootRef}
      className={`pointer-events-auto fixed z-[9980] flex -translate-x-1/2 flex-col gap-1 items-center ${
        rootPos.visible ? '' : 'invisible'
      }`}
      style={{ top: rootPos.top, left: rootPos.left }}
      data-testid={`column-bulk-undo-${columnId}`}
    >
      <div
        className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-1.5 text-[11px] font-semibold tabular-nums text-amber-800 shadow-sm dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
        aria-hidden
      >
        {count}
      </div>
      <KanbanChromeTooltip label={tooltip} delayMs={0} placement="top">
        <button
          type="button"
          disabled={busy}
          className={btnClass}
          onClick={onUndo}
          aria-label={tooltip}
        >
          <Undo2 size={14} />
        </button>
      </KanbanChromeTooltip>
    </div>,
    document.body
  );
}
