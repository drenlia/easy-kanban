import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Columns, Task } from '../types';
import { toast } from '../utils/toast';
import { getWipStatus, hasWipLimit } from '../utils/kanbanFlowUtils';
import {
  getCheckedColumnIds,
  pruneCheckedTaskIds,
  selectionSpansMultipleColumns as spansMultipleColumns,
} from '../utils/kanbanMultiSelect';
import { hasEscapeConsumingOverlay, isEditableEscapeTarget } from '../utils/escapeKeyUtils';

type UseKanbanMultiSelectArgs = {
  columns: Columns;
  selectedBoard: string | null;
  isLinkingMode?: boolean;
  /** When TaskDetails is open, Escape closes details first (does not clear checks). */
  detailsOpen?: boolean;
  findTask: (taskId: string) => Task | null;
  onEditTask: (task: Task) => Promise<void>;
  onCopyTask: (task: Task) => Promise<void>;
  onTagAdd: (taskId: string) => (tagId: string) => Promise<void>;
  onSoftDelete: (taskId: string) => Promise<void>;
  onMoveToBoard: (taskId: string, boardId: string) => Promise<void>;
  getArchiveColumnId: () => string | null;
  availablePriorities: Array<{ id: number; priority: string; color: string }>;
};

export function useKanbanMultiSelect({
  columns,
  selectedBoard,
  isLinkingMode = false,
  detailsOpen = false,
  findTask,
  onEditTask,
  onCopyTask,
  onTagAdd,
  onSoftDelete,
  onMoveToBoard,
  getArchiveColumnId,
  availablePriorities,
}: UseKanbanMultiSelectArgs) {
  const { t } = useTranslation('tasks');
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const clearAllChecked = useCallback(() => {
    setCheckedTaskIds(new Set());
  }, []);

  // Clear on board switch
  useEffect(() => {
    setCheckedTaskIds(new Set());
  }, [selectedBoard]);

  // Clear while linking
  useEffect(() => {
    if (isLinkingMode) setCheckedTaskIds(new Set());
  }, [isLinkingMode]);

  // Prune ids that left the board
  useEffect(() => {
    setCheckedTaskIds((prev) => pruneCheckedTaskIds(prev, columns));
  }, [columns]);

  // ESC clears multi-check only when TaskDetails is closed (details takes precedence).
  useEffect(() => {
    if (checkedTaskIds.size === 0 || detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      if (isEditableEscapeTarget(e.target)) return;
      if (hasEscapeConsumingOverlay()) return;
      e.preventDefault();
      setCheckedTaskIds(new Set());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [checkedTaskIds.size, detailsOpen]);

  const selectionSpansMultipleColumns = useMemo(
    () => spansMultipleColumns(checkedTaskIds, columns),
    [checkedTaskIds, columns]
  );

  const isMultiSelectDragLocked = selectionSpansMultipleColumns;

  const toggleTaskChecked = useCallback((taskId: string) => {
    setCheckedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const toggleColumnChecked = useCallback(
    (_columnId: string, taskIds: string[], selectAll: boolean) => {
      setCheckedTaskIds((prev) => {
        const next = new Set(prev);
        if (selectAll) {
          taskIds.forEach((id) => next.add(id));
        } else {
          taskIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    },
    []
  );

  const runBulk = useCallback(
    async (
      taskIds: string[],
      action: (taskId: string) => Promise<void>,
      successKey: string
    ) => {
      if (taskIds.length === 0 || bulkBusy) return;
      setBulkBusy(true);
      let ok = 0;
      let failed = 0;
      try {
        for (const id of taskIds) {
          try {
            await action(id);
            ok += 1;
          } catch {
            failed += 1;
          }
        }
        if (failed === 0) {
          toast.success(t(successKey, { count: ok }), '');
        } else {
          toast.warning(t('kanbanSelect.partialFailed', { ok, failed }), '');
        }
        setCheckedTaskIds(new Set());
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkBusy, t]
  );

  const onBulkAddTag = useCallback(
    async (taskIds: string[], tagId: string) => {
      await runBulk(
        taskIds,
        async (id) => {
          await onTagAdd(id)(tagId);
        },
        'kanbanSelect.taggedCount'
      );
    },
    [onTagAdd, runBulk]
  );

  const onBulkCopy = useCallback(
    async (taskIds: string[]) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          await onCopyTask(task);
        },
        'kanbanSelect.copiedCount'
      );
    },
    [findTask, onCopyTask, runBulk]
  );

  const onBulkArchive = useCallback(
    async (taskIds: string[]) => {
      const archiveId = getArchiveColumnId();
      if (!archiveId) return;
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          await onEditTask({ ...task, columnId: archiveId });
        },
        'kanbanSelect.archivedCount'
      );
    },
    [findTask, getArchiveColumnId, onEditTask, runBulk]
  );

  const onBulkDelete = useCallback(
    async (taskIds: string[]) => {
      await runBulk(taskIds, onSoftDelete, 'kanbanSelect.deletedCount');
    },
    [onSoftDelete, runBulk]
  );

  const onBulkSprint = useCallback(
    async (taskIds: string[], sprintId: string | null) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          await onEditTask({ ...task, sprintId });
        },
        'kanbanSelect.sprintUpdatedCount'
      );
    },
    [findTask, onEditTask, runBulk]
  );

  const onBulkPriority = useCallback(
    async (taskIds: string[], priorityId: string) => {
      const numericId = parseInt(priorityId, 10);
      const option = availablePriorities.find((p) => p.id === numericId);
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          await onEditTask({
            ...task,
            priorityId: numericId,
            priority: option?.priority || task.priority,
          });
        },
        'kanbanSelect.priorityUpdatedCount'
      );
    },
    [availablePriorities, findTask, onEditTask, runBulk]
  );

  const onBulkMoveToBoard = useCallback(
    async (taskIds: string[], boardId: string) => {
      await runBulk(
        taskIds,
        async (id) => onMoveToBoard(id, boardId),
        'kanbanSelect.movedToBoardCount'
      );
    },
    [onMoveToBoard, runBulk]
  );

  const warnWipOnce = useCallback(
    (sourceColumnId: string, targetColumnId: string, moveCount: number) => {
      if (sourceColumnId === targetColumnId) return;
      const targetColumn = columns[targetColumnId];
      if (!targetColumn || !hasWipLimit(targetColumn.wip_limit)) return;
      const destCount = (targetColumn.tasks?.length || 0) + moveCount;
      const status = getWipStatus(destCount, targetColumn.wip_limit);
      if (status === 'at' || status === 'over') {
        toast.warning(
          t('column.wipSoftWarningTitle'),
          t('column.wipSoftWarningBody', {
            count: destCount,
            limit: targetColumn.wip_limit,
            column: targetColumn.title,
          })
        );
      }
    },
    [columns, t]
  );

  return {
    checkedTaskIds,
    setCheckedTaskIds,
    clearAllChecked,
    toggleTaskChecked,
    toggleColumnChecked,
    selectionSpansMultipleColumns,
    isMultiSelectDragLocked,
    bulkBusy,
    checkedColumnIds: getCheckedColumnIds(checkedTaskIds, columns),
    onBulkAddTag,
    onBulkCopy,
    onBulkArchive,
    onBulkDelete,
    onBulkSprint,
    onBulkPriority,
    onBulkMoveToBoard,
    warnWipOnce,
  };
}
