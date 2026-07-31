import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Column, Columns, Task } from '../types';
import { formatToYYYYMMDDHHmm } from '../utils/dateUtils';

interface BoardTrashViewProps {
  tasks: Task[];
  /** Same visible columns (ordered) as the live board beneath. */
  displayColumns: Column[];
  columns: Columns;
  isAdmin: boolean;
  /** Same grid style as the live Kanban board for width/alignment. */
  gridStyle: React.CSSProperties;
  /** Paired with the live Kanban scroller by KanbanPage. */
  scrollContainerRef?: React.Ref<HTMLDivElement>;
  loading?: boolean;
  onSelectTask: (task: Task) => void;
  onRestore: (taskId: string) => Promise<void>;
  onPurge: (taskId: string) => Promise<void>;
  /** Hide the trash panel (same as toggling trash off in BoardTabs). */
  onClose?: () => void;
}

function TrashedTaskCard({
  task,
  isAdmin,
  restoring,
  purging,
  onSelect,
  onRestore,
  onPurge,
}: {
  task: Task;
  isAdmin: boolean;
  restoring: boolean;
  purging: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { t } = useTranslation(['tasks', 'common']);
  const deletedLabel = task.deletedAt ? formatToYYYYMMDDHHmm(task.deletedAt) : '';
  const deletedByName = (task as any).deletedByName || t('trash.unknownUser');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="group relative rounded-lg bg-[var(--task-card-bg,#fff)] p-2.5 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
      data-tour-id={`trash-task-${task.id}`}
    >
      <div className="min-w-0">
        {task.ticket && (
          <div className="mb-0.5 font-mono text-xs text-blue-600 dark:text-blue-400">
            {task.ticket}
          </div>
        )}
        <h3 className="line-clamp-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          {task.title || t('trash.untitled')}
        </h3>
      </div>

      <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus:grid-rows-[1fr] group-focus:opacity-100 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100">
        <div className="overflow-hidden">
          <div className="space-y-0.5 pt-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            <div>
              {t('trash.deletedBy')}:{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">{deletedByName}</span>
            </div>
            {deletedLabel && (
              <div>
                {t('trash.deletedOn')}:{' '}
                <span className="font-medium text-gray-700 dark:text-gray-200">{deletedLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={restoring || purging}
          onClick={() => void onRestore()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
          aria-label={t('trash.restore')}
        >
          <RotateCcw size={12} className={restoring ? 'animate-spin' : ''} />
          {t('trash.restore')}
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={restoring || purging}
            onClick={() => void onPurge()}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            aria-label={t('trash.purge')}
          >
            <Trash2 size={12} />
            {t('trash.purge')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function BoardTrashView({
  tasks,
  displayColumns,
  columns,
  isAdmin,
  gridStyle,
  scrollContainerRef,
  loading,
  onSelectTask,
  onRestore,
  onPurge,
  onClose,
}: BoardTrashViewProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'restore' | 'purge' | null>(null);
  const [purgeConfirmId, setPurgeConfirmId] = useState<string | null>(null);

  const closeButton = onClose ? (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold text-gray-700 transition-colors hover:border-amber-500 hover:bg-amber-100/80 hover:text-gray-900 dark:border-amber-600 dark:text-gray-200 dark:hover:border-amber-500 dark:hover:bg-amber-900/40 dark:hover:text-white"
      aria-label={t('buttons.close', { ns: 'common' })}
      data-tour-id="board-trash-close"
    >
      {t('buttons.close', { ns: 'common' })}
    </button>
  ) : null;

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    displayColumns.forEach((col) => map.set(col.id, []));

    tasks.forEach((task) => {
      const columnId = task.columnId || (task as any).columnid;
      if (columnId && map.has(columnId)) {
        map.get(columnId)!.push(task);
      } else if (columnId && columns[columnId]) {
        // Column exists but is filtered from display — skip to keep alignment with live
      } else {
        // Orphan: park under first display column so nothing is lost, or a virtual bucket
        const orphanKey = '__orphan__';
        if (!map.has(orphanKey)) map.set(orphanKey, []);
        map.get(orphanKey)!.push(task);
      }
    });

    map.forEach((list, key) => {
      map.set(
        key,
        list.slice().sort((a, b) => (a.position || 0) - (b.position || 0))
      );
    });
    return map;
  }, [tasks, displayColumns, columns]);

  const orphanTasks = tasksByColumn.get('__orphan__') || [];

  const trashGridStyle = useMemo(
    () => ({
      ...gridStyle,
      // Content-height columns — do not stretch to the tallest sibling
      alignItems: 'start' as const,
    }),
    [gridStyle]
  );

  const handleRestore = async (taskId: string) => {
    setBusyId(taskId);
    setBusyAction('restore');
    try {
      await onRestore(taskId);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const confirmPurge = async (taskId: string) => {
    setPurgeConfirmId(null);
    setBusyId(taskId);
    setBusyAction('purge');
    try {
      await onPurge(taskId);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-4 dark:border-gray-600 dark:bg-gray-800/40">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('trash.title')}</h3>
          {closeButton}
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">{t('trash.loading')}</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-4 dark:border-gray-600 dark:bg-gray-800/40">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('trash.title')}</h3>
          {closeButton}
        </div>
        <div className="text-center">
          <Trash2 className="mx-auto mb-2 text-gray-400" size={22} />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('trash.emptyTitle')}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('trash.emptyHint')}</p>
        </div>
      </div>
    );
  }

  const renderColumnCards = (columnTasks: Task[]) => (
    <div className="space-y-2">
      {columnTasks.map((task) => (
        <div key={task.id} className="relative">
          <TrashedTaskCard
            task={task}
            isAdmin={isAdmin}
            restoring={busyId === task.id && busyAction === 'restore'}
            purging={busyId === task.id && busyAction === 'purge'}
            onSelect={() => onSelectTask(task)}
            onRestore={() => handleRestore(task.id)}
            onPurge={() => setPurgeConfirmId(task.id)}
          />
          {purgeConfirmId === task.id && (
            <div className="absolute inset-x-1 top-1 z-10 rounded-lg border border-red-200 bg-white p-3 shadow-lg dark:border-red-800 dark:bg-gray-900">
              <p className="mb-2 text-xs text-gray-700 dark:text-gray-200">
                {t('trash.purgeConfirm')}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={() => setPurgeConfirmId(null)}
                >
                  {t('buttons.cancel', { ns: 'common' })}
                </button>
                <button
                  type="button"
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                  onClick={() => void confirmPurge(task.id)}
                >
                  {t('trash.purge')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/40 py-2 dark:border-amber-900/50 dark:bg-amber-950/20"
      data-tour-id="board-trash-view"
    >
      <div className="relative mb-2 flex items-center justify-between gap-2 px-1 min-h-[1.5rem]">
        <h3 className="relative z-10 text-sm font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap bg-amber-50/90 dark:bg-amber-950/40 pr-2">
          {t('trash.title')}
          <span className="ml-2 rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
            {tasks.length}
          </span>
        </h3>
        <p className="pointer-events-none absolute inset-x-0 text-center text-sm font-semibold text-gray-800 dark:text-gray-100 truncate px-28">
          {t('trash.instruction')}
        </p>
        <div className="relative z-10 flex items-center gap-2 whitespace-nowrap bg-amber-50/90 dark:bg-amber-950/40 pl-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
            {t('trash.subtitle')}
          </p>
          {closeButton}
        </div>
      </div>

      {/* Same grid as live board — no horizontal padding so columns line up */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto w-full"
        data-kanban-scroll="trash"
      >
        <div style={trashGridStyle}>
          {displayColumns.map((column) => {
            const columnTasks = tasksByColumn.get(column.id) || [];
            return (
              <div key={column.id} className="relative min-w-0 self-start">
                <div className="mb-1.5 truncate px-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {column.title}
                  <span className="ml-1 font-normal normal-case text-gray-400">
                    ({columnTasks.length})
                  </span>
                </div>
                {columnTasks.length > 0 ? (
                  renderColumnCards(columnTasks)
                ) : (
                  <div className="rounded-md border border-dashed border-gray-200/80 px-2 py-1.5 text-[11px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {orphanTasks.length > 0 && (
          <div className="mt-2 px-1">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('trash.unknownColumn')}
              <span className="ml-1 font-normal normal-case text-gray-400">
                ({orphanTasks.length})
              </span>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: trashGridStyle.gridTemplateColumns }}>
              {renderColumnCards(orphanTasks)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
