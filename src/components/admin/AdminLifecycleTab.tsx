import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCcw, Trash2, RefreshCw } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from '../../utils/toast';
import {
  getLifecycleDeletedTasks,
  getLifecycleDeletedBoards,
  restoreTasksBatch,
  purgeLifecycleTasksBatch,
  restoreBoard,
  purgeBoard,
  restoreTask,
  updateSetting,
} from '../../api';
import { Board, Task } from '../../types';
import { formatToYYYYMMDDHHmm } from '../../utils/dateUtils';

type LifecycleConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
};

const AdminLifecycleTab: React.FC = () => {
  const { t } = useTranslation('admin', { keyPrefix: 'lifecycle' });
  const { t: tCommon } = useTranslation('common');
  const { systemSettings, refreshSettings } = useSettings();

  const [deletedDays, setDeletedDays] = useState('0');
  const [archivedDays, setArchivedDays] = useState('0');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [tasks, setTasks] = useState<(Task & { boardTitle?: string })[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<LifecycleConfirmDialog | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (!systemSettings) return;
    setDeletedDays(systemSettings.LIFECYCLE_DELETED_RETENTION_DAYS || '0');
    setArchivedDays(systemSettings.LIFECYCLE_ARCHIVED_RETENTION_DAYS || '0');
  }, [systemSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskList, boardList] = await Promise.all([
        getLifecycleDeletedTasks(search.trim() ? { q: search.trim() } : undefined),
        getLifecycleDeletedBoards(),
      ]);
      setTasks(taskList as (Task & { boardTitle?: string })[]);
      setBoards(boardList);
    } catch (error) {
      console.error(error);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const boardChips = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      if (task.boardId) {
        map.set(task.boardId, (task as any).boardTitle || task.boardId);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (selectedBoardIds.length === 0) return tasks;
    return tasks.filter((task) => task.boardId && selectedBoardIds.includes(task.boardId));
  }, [tasks, selectedBoardIds]);

  const toggleBoardChip = (boardId: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(boardId) ? prev.filter((id) => id !== boardId) : [...prev, boardId]
    );
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const ids = filteredTasks.map((task) => task.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedTaskIds.has(id));
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const saveRetention = async (key: string, value: string) => {
    const normalized = String(Math.max(0, parseInt(value, 10) || 0));
    setSavingKey(key);
    try {
      await updateSetting(key, normalized);
      await refreshSettings?.();
      toast.success(t('settingsSaved'));
      if (key === 'LIFECYCLE_DELETED_RETENTION_DAYS') setDeletedDays(normalized);
      if (key === 'LIFECYCLE_ARCHIVED_RETENTION_DAYS') setArchivedDays(normalized);
    } catch (error) {
      console.error(error);
      toast.error(t('settingsSaveFailed'));
    } finally {
      setSavingKey(null);
    }
  };

  const resolveBoardName = (boardId: string) => {
    const deletedBoard = boards.find((b) => b.id === boardId);
    const taskOnBoard = tasks.find((task) => task.boardId === boardId);
    return deletedBoard?.title || taskOnBoard?.boardTitle || boardId;
  };

  const finishRestoreBatch = async (restoredCount: number, hadOtherErrors: boolean) => {
    if (restoredCount > 0) {
      toast.success(t('restoredCount', { count: restoredCount }));
    } else if (hadOtherErrors) {
      toast.error(t('restoreFailed'));
    }
    setSelectedTaskIds(new Set());
    await loadData();
  };

  const openRestoreBoardThenTasksConfirm = (
    boardIds: string[],
    blockedTaskIds: string[],
    alreadyRestored: number
  ) => {
    const boardNames = boardIds.map(resolveBoardName);
    setConfirmDialog({
      title: t('restoreBoardThenTitle'),
      message: t('restoreBoardThenTasksConfirm', {
        boards: boardNames.join(', '),
        count: blockedTaskIds.length,
      }),
      confirmLabel: t('restoreBoardThenConfirmAction'),
      onConfirm: async () => {
        let restoredCount = alreadyRestored;
        for (const boardId of boardIds) {
          await restoreBoard(boardId);
        }
        const retry = await restoreTasksBatch(blockedTaskIds);
        restoredCount += retry?.restored?.length || 0;
        await finishRestoreBatch(restoredCount, false);
      },
    });
  };

  const handleRestoreSelected = async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const result = await restoreTasksBatch(ids);
      const restoredCount = result?.restored?.length || 0;
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      const boardBlocked = errors.filter(
        (e: any) => e?.code === 'board_soft_deleted' && e?.taskId
      ) as Array<{ taskId: string; code: string }>;
      const otherErrors = errors.filter((e: any) => e?.code !== 'board_soft_deleted');

      if (boardBlocked.length > 0) {
        const blockedTaskIds = boardBlocked.map((e) => e.taskId);
        const boardIds = Array.from(
          new Set(
            blockedTaskIds
              .map((id) => tasks.find((task) => task.id === id)?.boardId)
              .filter((id): id is string => !!id)
          )
        );
        if (boardIds.length === 0) {
          await finishRestoreBatch(restoredCount, true);
          return;
        }
        // Keep UI in sync if some tasks already restored before the board prompt.
        if (restoredCount > 0) {
          toast.success(t('restoredCount', { count: restoredCount }));
          setSelectedTaskIds(new Set(blockedTaskIds));
          await loadData();
        }
        openRestoreBoardThenTasksConfirm(boardIds, blockedTaskIds, 0);
        return;
      }

      await finishRestoreBatch(restoredCount, otherErrors.length > 0 || restoredCount === 0);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePurgeSelected = () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    setConfirmDialog({
      title: t('purgeSelectedTitle'),
      message: t('purgeSelectedConfirm', { count: ids.length }),
      confirmLabel: t('purge'),
      danger: true,
      onConfirm: async () => {
        const result = await purgeLifecycleTasksBatch(ids);
        toast.success(t('purgedCount', { count: result?.purged?.length || 0 }));
        setSelectedTaskIds(new Set());
        await loadData();
      },
    });
  };

  const handleRestoreOne = async (taskId: string) => {
    setBusy(true);
    try {
      await restoreTask(taskId);
      toast.success(t('taskRestored'));
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      await loadData();
    } catch (error: any) {
      const code = error?.response?.data?.code;
      if (code !== 'board_soft_deleted') {
        toast.error(error?.response?.data?.error || t('restoreFailed'));
        return;
      }

      const task = tasks.find((item) => item.id === taskId);
      const boardId = task?.boardId;
      if (!boardId) {
        toast.error(t('restoreBoardFirst'));
        return;
      }

      setConfirmDialog({
        title: t('restoreBoardThenTitle'),
        message: t('restoreBoardThenTaskConfirm', {
          board: resolveBoardName(boardId),
        }),
        confirmLabel: t('restoreBoardThenConfirmAction'),
        onConfirm: async () => {
          await restoreBoard(boardId);
          await restoreTask(taskId);
          toast.success(t('taskRestored'));
          setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
          await loadData();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreBoard = async (boardId: string) => {
    setBusy(true);
    try {
      await restoreBoard(boardId);
      toast.success(t('boardRestored'));
      await loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('boardRestoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePurgeBoard = (boardId: string) => {
    setConfirmDialog({
      title: t('purgeBoardTitle'),
      message: t('purgeBoardConfirm'),
      confirmLabel: t('purge'),
      danger: true,
      onConfirm: async () => {
        await purgeBoard(boardId);
        toast.success(t('boardPurged'));
        await loadData();
      },
    });
  };

  const closeConfirmDialog = () => {
    if (confirmBusy) return;
    setConfirmDialog(null);
  };

  const runConfirmDialog = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    setBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          (confirmDialog.danger ? t('purgeFailed') : t('restoreFailed'))
      );
    } finally {
      setConfirmBusy(false);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8" data-tour-id="admin-lifecycle-content">
      {/* Retention settings */}
      <section
        className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        data-setting-key="LIFECYCLE_DELETED_RETENTION_DAYS"
      >
        <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{t('retentionTitle')}</h3>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('retentionDescription')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              {t('deletedRetention')}
            </span>
            <span className="mb-2 block text-xs text-gray-500 dark:text-gray-400">
              {t('deletedRetentionHint')}
            </span>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={deletedDays}
                onChange={(e) => setDeletedDays(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                disabled={savingKey === 'LIFECYCLE_DELETED_RETENTION_DAYS'}
                onClick={() => void saveRetention('LIFECYCLE_DELETED_RETENTION_DAYS', deletedDays)}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t('save')}
              </button>
            </div>
          </label>
          <label className="block text-sm" data-setting-key="LIFECYCLE_ARCHIVED_RETENTION_DAYS">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">
              {t('archivedRetention')}
            </span>
            <span className="mb-2 block text-xs text-gray-500 dark:text-gray-400">
              {t('archivedRetentionHint')}
            </span>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={archivedDays}
                onChange={(e) => setArchivedDays(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                disabled={savingKey === 'LIFECYCLE_ARCHIVED_RETENTION_DAYS'}
                onClick={() => void saveRetention('LIFECYCLE_ARCHIVED_RETENTION_DAYS', archivedDays)}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t('save')}
              </button>
            </div>
          </label>
        </div>
      </section>

      {/* Deleted tasks */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('deletedTasksTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('deletedTasksDescription')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-600"
              title={t('refresh')}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              disabled={busy || selectedTaskIds.size === 0}
              onClick={() => void handleRestoreSelected()}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              {t('restoreSelected')}
            </button>
            <button
              type="button"
              disabled={busy || selectedTaskIds.size === 0}
              onClick={() => void handlePurgeSelected()}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {t('purgeSelected')}
            </button>
          </div>
        </div>

        {boardChips.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {boardChips.map((chip) => {
              const active = selectedBoardIds.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleBoardChip(chip.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                  }`}
                >
                  {chip.title}
                </button>
              );
            })}
            {selectedBoardIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedBoardIds([])}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {t('clearBoardFilter')}
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={
                      filteredTasks.length > 0 &&
                      filteredTasks.every((task) => selectedTaskIds.has(task.id))
                    }
                    onChange={toggleAllVisible}
                    aria-label={t('selectAll')}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">{t('colTicket')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">{t('colTitle')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">{t('colBoard')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">{t('colDeleted')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    {loading ? t('loading') : t('noDeletedTasks')}
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(task.id)}
                        onChange={() => toggleTask(task.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {task.ticket || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{task.title}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {(task as any).boardTitle || task.boardId || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {task.deletedAt ? formatToYYYYMMDDHHmm(task.deletedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRestoreOne(task.id)}
                        className="mr-2 inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                      >
                        <RotateCcw size={14} />
                        {t('restore')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Deleted boards */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{t('deletedBoardsTitle')}</h3>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          <Trans
            t={t}
            i18nKey="deletedBoardsDescription"
            components={{
              boldItalic: <strong className="italic font-semibold" />,
            }}
          />
        </p>
        {boards.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('noDeletedBoards')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {boards.map((board) => (
              <li
                key={board.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{board.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {board.deletedAt ? formatToYYYYMMDDHHmm(board.deletedAt) : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestoreBoard(board.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    {t('restore')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePurgeBoard(board.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {t('purge')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
            role="presentation"
            onClick={closeConfirmDialog}
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lifecycle-confirm-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex-shrink-0">
                  <AlertTriangle
                    className={`h-6 w-6 ${
                      confirmDialog.danger ? 'text-red-500' : 'text-amber-500'
                    }`}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    id="lifecycle-confirm-title"
                    className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100"
                  >
                    {confirmDialog.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeConfirmDialog}
                  disabled={confirmBusy}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {tCommon('buttons.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void runConfirmDialog()}
                  disabled={confirmBusy}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                    confirmDialog.danger
                      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  {confirmBusy ? t('working') : confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default AdminLifecycleTab;
