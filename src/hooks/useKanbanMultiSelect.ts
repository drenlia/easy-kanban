import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addCollaboratorToTask,
  addWatcherToTask,
  logBulkTaskFieldActivity,
  removeCollaboratorFromTask,
  removeWatcherFromTask,
} from '../api';
import { Columns, Task } from '../types';
import { toast } from '../utils/toast';
import { getWipStatus, hasWipLimit } from '../utils/kanbanFlowUtils';
import {
  getCheckedColumnIds,
  pruneCheckedTaskIds,
  selectionSpansMultipleColumns as spansMultipleColumns,
} from '../utils/kanbanMultiSelect';
import { hasEscapeConsumingOverlay, isEditableEscapeTarget } from '../utils/escapeKeyUtils';

type EditTaskOptions = { skipActivity?: boolean };

/** One-shot undo after a bulk field change — restore prior values and reselect. */
export type BulkUndoSnapshot = {
  taskIds: string[];
  previousByTaskId: Record<string, Partial<Task>>;
  labelKey: string;
};

type UseKanbanMultiSelectArgs = {
  columns: Columns;
  selectedBoard: string | null;
  isLinkingMode?: boolean;
  /** When TaskDetails is open, Escape closes details first (does not clear checks). */
  detailsOpen?: boolean;
  findTask: (taskId: string) => Task | null;
  onEditTask: (task: Task, options?: EditTaskOptions) => Promise<void>;
  onCopyTask: (task: Task) => Promise<void>;
  onTagAdd: (taskId: string) => (tagId: string) => Promise<void>;
  onSoftDelete: (taskId: string) => Promise<void>;
  onMoveToBoard: (taskId: string, boardId: string) => Promise<void>;
  getArchiveColumnId: () => string | null;
  availablePriorities: Array<{ id: number; priority: string; color: string }>;
  availableSprints?: Array<{ id: string; name: string }>;
};

const BULK_UNDO_TTL_MS = 60_000;

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
  availableSprints = [],
}: UseKanbanMultiSelectArgs) {
  const { t } = useTranslation('tasks');
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkUndo, setBulkUndo] = useState<BulkUndoSnapshot | null>(null);

  const clearAllChecked = useCallback(() => {
    setCheckedTaskIds(new Set());
  }, []);

  const clearBulkUndo = useCallback(() => {
    setBulkUndo(null);
  }, []);

  const offerBulkUndo = useCallback((snapshot: BulkUndoSnapshot) => {
    if (snapshot.taskIds.length === 0) return;
    setBulkUndo(snapshot);
  }, []);

  // Clear on board switch
  useEffect(() => {
    setCheckedTaskIds(new Set());
    setBulkUndo(null);
  }, [selectedBoard]);

  // Clear while linking
  useEffect(() => {
    if (isLinkingMode) {
      setCheckedTaskIds(new Set());
      setBulkUndo(null);
    }
  }, [isLinkingMode]);

  // Auto-dismiss undo after a short window
  useEffect(() => {
    if (!bulkUndo) return;
    const timer = window.setTimeout(() => setBulkUndo(null), BULK_UNDO_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [bulkUndo]);

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
    setBulkUndo(null);
    setCheckedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const toggleColumnChecked = useCallback(
    (_columnId: string, taskIds: string[], selectAll: boolean) => {
      setBulkUndo(null);
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
      action: (taskId: string) => Promise<void | false>,
      successKey: string,
      options?: { clearSelection?: boolean }
    ) => {
      if (taskIds.length === 0 || bulkBusy) return;
      const clearSelection = options?.clearSelection !== false;
      setBulkBusy(true);
      let ok = 0;
      let failed = 0;
      let skipped = 0;
      try {
        for (const id of taskIds) {
          try {
            const result = await action(id);
            // Actions may return false to mean "already applied / no-op"
            if (result === false) {
              skipped += 1;
            } else {
              ok += 1;
            }
          } catch {
            failed += 1;
          }
        }
        if (failed === 0 && ok === 0 && skipped > 0) {
          // Nothing changed; avoid a misleading success toast
        } else if (failed === 0) {
          toast.success(t(successKey, { count: ok || skipped }), '');
        } else {
          toast.warning(t('kanbanSelect.partialFailed', { ok, failed }), '');
        }
        if (clearSelection) {
          setCheckedTaskIds(new Set());
        }
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
      const previousByTaskId: Record<string, Partial<Task>> = {};
      const changedIds: string[] = [];
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (task.columnId === archiveId) return false;
          previousByTaskId[id] = { columnId: task.columnId };
          await onEditTask({ ...task, columnId: archiveId });
          changedIds.push(id);
        },
        'kanbanSelect.archivedCount'
      );
      if (changedIds.length > 0) {
        offerBulkUndo({
          taskIds: changedIds,
          previousByTaskId,
          labelKey: 'kanbanSelect.undoArchive',
        });
      }
    },
    [findTask, getArchiveColumnId, offerBulkUndo, onEditTask, runBulk]
  );

  const onBulkDelete = useCallback(
    async (taskIds: string[]) => {
      await runBulk(taskIds, onSoftDelete, 'kanbanSelect.deletedCount');
    },
    [onSoftDelete, runBulk]
  );

  const onBulkSprint = useCallback(
    async (taskIds: string[], sprintId: string | null) => {
      const changedIds: string[] = [];
      const oldValues = new Set<string | null>();
      const previousByTaskId: Record<string, Partial<Task>> = {};
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          const prev = task.sprintId ?? null;
          if (prev === sprintId) return false;
          oldValues.add(prev);
          previousByTaskId[id] = { sprintId: prev };
          await onEditTask({ ...task, sprintId }, { skipActivity: true });
          changedIds.push(id);
        },
        'kanbanSelect.sprintUpdatedCount'
      );
      if (changedIds.length > 0) {
        const olds = Array.from(oldValues);
        const sprintName =
          sprintId == null
            ? null
            : availableSprints.find((s) => s.id === sprintId)?.name || sprintId;
        logBulkTaskFieldActivity({
          field: 'sprintId',
          taskIds: changedIds,
          newValue: sprintId,
          oldValue: olds.length === 1 ? olds[0] : null,
          newLabel: sprintName,
          boardId: selectedBoard,
        }).catch((err) => console.error('Bulk sprint activity failed:', err));
        offerBulkUndo({
          taskIds: changedIds,
          previousByTaskId,
          labelKey: 'kanbanSelect.undoSprint',
        });
      }
    },
    [availableSprints, findTask, offerBulkUndo, onEditTask, runBulk, selectedBoard]
  );

  const onBulkPriority = useCallback(
    async (taskIds: string[], priorityId: string) => {
      const numericId = parseInt(priorityId, 10);
      const option = availablePriorities.find((p) => p.id === numericId);
      const changedIds: string[] = [];
      const oldValues = new Set<number | null>();
      const previousByTaskId: Record<string, Partial<Task>> = {};
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          const prev = task.priorityId ?? null;
          if (prev === numericId) return false;
          oldValues.add(prev);
          previousByTaskId[id] = {
            priorityId: prev ?? undefined,
            priority: task.priority,
          };
          await onEditTask(
            {
              ...task,
              priorityId: numericId,
              priority: option?.priority || task.priority,
            },
            { skipActivity: true }
          );
          changedIds.push(id);
        },
        'kanbanSelect.priorityUpdatedCount'
      );
      if (changedIds.length > 0) {
        const olds = Array.from(oldValues);
        logBulkTaskFieldActivity({
          field: 'priorityId',
          taskIds: changedIds,
          newValue: String(numericId),
          oldValue: olds.length === 1 && olds[0] != null ? String(olds[0]) : null,
          newLabel: option?.priority || String(numericId),
          boardId: selectedBoard,
        }).catch((err) => console.error('Bulk priority activity failed:', err));
        offerBulkUndo({
          taskIds: changedIds,
          previousByTaskId,
          labelKey: 'kanbanSelect.undoPriority',
        });
      }
    },
    [availablePriorities, findTask, offerBulkUndo, onEditTask, runBulk, selectedBoard]
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

  const onBulkAssignee = useCallback(
    async (taskIds: string[], memberId: string) => {
      const changedIds: string[] = [];
      const oldValues = new Set<string | null>();
      const previousByTaskId: Record<string, Partial<Task>> = {};
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (task.memberId === memberId) return false;
          oldValues.add(task.memberId || null);
          previousByTaskId[id] = { memberId: task.memberId };
          await onEditTask({ ...task, memberId }, { skipActivity: true });
          changedIds.push(id);
        },
        'kanbanSelect.assigneeUpdatedCount'
      );
      if (changedIds.length > 0) {
        const olds = Array.from(oldValues);
        logBulkTaskFieldActivity({
          field: 'memberId',
          taskIds: changedIds,
          newValue: memberId,
          oldValue: olds.length === 1 ? olds[0] : null,
          boardId: selectedBoard,
        }).catch((err) => console.error('Bulk assignee activity failed:', err));
        offerBulkUndo({
          taskIds: changedIds,
          previousByTaskId,
          labelKey: 'kanbanSelect.undoAssignee',
        });
      }
    },
    [findTask, offerBulkUndo, onEditTask, runBulk, selectedBoard]
  );

  const onBulkRequester = useCallback(
    async (taskIds: string[], memberId: string) => {
      const changedIds: string[] = [];
      const oldValues = new Set<string | null>();
      const previousByTaskId: Record<string, Partial<Task>> = {};
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (task.requesterId === memberId) return false;
          oldValues.add(task.requesterId || null);
          previousByTaskId[id] = { requesterId: task.requesterId };
          await onEditTask({ ...task, requesterId: memberId }, { skipActivity: true });
          changedIds.push(id);
        },
        'kanbanSelect.requesterUpdatedCount'
      );
      if (changedIds.length > 0) {
        const olds = Array.from(oldValues);
        logBulkTaskFieldActivity({
          field: 'requesterId',
          taskIds: changedIds,
          newValue: memberId,
          oldValue: olds.length === 1 ? olds[0] : null,
          boardId: selectedBoard,
        }).catch((err) => console.error('Bulk requester activity failed:', err));
        offerBulkUndo({
          taskIds: changedIds,
          previousByTaskId,
          labelKey: 'kanbanSelect.undoRequester',
        });
      }
    },
    [findTask, offerBulkUndo, onEditTask, runBulk, selectedBoard]
  );

  const onBulkAddWatcher = useCallback(
    async (taskIds: string[], memberId: string) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (task.watchers?.some((w) => w && w.id === memberId)) return false;
          await addWatcherToTask(id, memberId);
        },
        'kanbanSelect.watcherAddedCount',
        { clearSelection: false }
      );
    },
    [findTask, runBulk]
  );

  const onBulkRemoveWatcher = useCallback(
    async (taskIds: string[], memberId: string) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (!task.watchers?.some((w) => w && w.id === memberId)) return false;
          await removeWatcherFromTask(id, memberId);
        },
        'kanbanSelect.watcherRemovedCount',
        { clearSelection: false }
      );
    },
    [findTask, runBulk]
  );

  const onBulkAddCollaborator = useCallback(
    async (taskIds: string[], memberId: string) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (task.collaborators?.some((c) => c && c.id === memberId)) return false;
          await addCollaboratorToTask(id, memberId);
        },
        'kanbanSelect.collaboratorAddedCount',
        { clearSelection: false }
      );
    },
    [findTask, runBulk]
  );

  const onBulkRemoveCollaborator = useCallback(
    async (taskIds: string[], memberId: string) => {
      await runBulk(
        taskIds,
        async (id) => {
          const task = findTask(id);
          if (!task) throw new Error('missing');
          if (!task.collaborators?.some((c) => c && c.id === memberId)) return false;
          await removeCollaboratorFromTask(id, memberId);
        },
        'kanbanSelect.collaboratorRemovedCount',
        { clearSelection: false }
      );
    },
    [findTask, runBulk]
  );

  const onBulkUndo = useCallback(async () => {
    const snapshot = bulkUndo;
    if (!snapshot || bulkBusy) return;
    setBulkUndo(null);
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of snapshot.taskIds) {
        try {
          const task = findTask(id);
          const prev = snapshot.previousByTaskId[id];
          if (!task || !prev) {
            failed += 1;
            continue;
          }
          await onEditTask({ ...task, ...prev }, { skipActivity: true });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) {
        toast.success(t('kanbanSelect.undoRestoredCount', { count: ok }), '');
      } else {
        toast.warning(t('kanbanSelect.partialFailed', { ok, failed }), '');
      }
      setCheckedTaskIds(new Set(snapshot.taskIds));
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, bulkUndo, findTask, onEditTask, t]);

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
    bulkUndo,
    clearBulkUndo,
    onBulkUndo,
    checkedColumnIds: getCheckedColumnIds(checkedTaskIds, columns),
    onBulkAddTag,
    onBulkCopy,
    onBulkArchive,
    onBulkDelete,
    onBulkSprint,
    onBulkPriority,
    onBulkMoveToBoard,
    onBulkAssignee,
    onBulkRequester,
    onBulkAddWatcher,
    onBulkRemoveWatcher,
    onBulkAddCollaborator,
    onBulkRemoveCollaborator,
    warnWipOnce,
  };
}
