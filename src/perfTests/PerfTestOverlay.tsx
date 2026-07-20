import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Columns, PriorityOption, TeamMember } from '../types';
import type { TaskDropPlacement } from '../utils/taskReorderingUtils';
import ReportModal from './ReportModal';
import { getHistory, getLastRun, type PerfRunRecord } from './metrics';
import { memberDisplayName } from './lorem';
import {
  resolveDefaultPriority,
  runCleanupGenerated,
  runGenerateTasks,
} from './runners/generateTasks';
import { runMoveTasks } from './runners/moveTasks';

export interface PerfTestOverlayProps {
  boardId: string;
  columns: Columns;
  members: TeamMember[];
  availablePriorities: PriorityOption[];
  /** Same path as DnD */
  onMoveTask: (
    taskId: string,
    targetColumnId: string,
    placement: TaskDropPlacement
  ) => Promise<void>;
}

type ActiveScenario = 'generate' | 'move' | 'cleanup' | null;
type ReportKind = 'last' | 'history' | null;

const PerfTestOverlay: React.FC<PerfTestOverlayProps> = ({
  boardId,
  columns,
  members,
  availablePriorities,
  onMoveTask,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [memberId, setMemberId] = useState(members[0]?.id || '');
  const [count, setCount] = useState(20);
  const [active, setActive] = useState<ActiveScenario>(null);
  const [status, setStatus] = useState('');
  const [reportKind, setReportKind] = useState<ReportKind>(null);
  const [reportRuns, setReportRuns] = useState<PerfRunRecord[]>([]);
  const createdIdsRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    if (!memberId && members[0]) setMemberId(members[0].id);
  }, [members, memberId]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId) || members[0],
    [members, memberId]
  );

  const stopActive = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => stopActive(), [stopActive]);

  const openReport = (kind: ReportKind) => {
    if (kind === 'last') {
      const last = getLastRun();
      setReportRuns(last ? [last] : []);
    } else if (kind === 'history') {
      setReportRuns(getHistory());
    }
    setReportKind(kind);
  };

  const startGenerate = async () => {
    if (!selectedMember || active) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setActive('generate');
    setStatus(`Generating ${count} tasks…`);
    createdIdsRef.current = [];
    try {
      const run = await runGenerateTasks({
        boardId,
        columns: columnsRef.current,
        member: selectedMember,
        count,
        defaultPriority: resolveDefaultPriority(availablePriorities),
        signal: ac.signal,
        onCreated: (id) => {
          createdIdsRef.current.push(id);
          setStatus(`Generated ${createdIdsRef.current.length}/${count}…`);
        },
      });
      setStatus(
        run.cancelled
          ? `Generate cancelled (${run.succeeded}/${run.attempted})`
          : `Generate done: ${run.succeeded} ok, ${run.failed} fail`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      abortRef.current = null;
      setActive(null);
    }
  };

  const startMove = async () => {
    if (active) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setActive('move');
    setStatus('Moving tasks…');
    try {
      const run = await runMoveTasks({
        boardId,
        getColumns: () => columnsRef.current,
        moveTask: async (taskId, targetColumnId, placement) => {
          await onMoveTask(taskId, targetColumnId, placement);
        },
        signal: ac.signal,
      });
      setStatus(
        run.cancelled
          ? `Move cancelled (${run.succeeded} moves)`
          : `Move finished (${run.succeeded} moves)`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Move failed');
    } finally {
      abortRef.current = null;
      setActive(null);
    }
  };

  const startCleanup = async () => {
    if (active) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setActive('cleanup');
    setStatus('Cleaning up generated tasks…');
    try {
      const run = await runCleanupGenerated({
        boardId,
        columns: columnsRef.current,
        taskIds: createdIdsRef.current.length > 0 ? createdIdsRef.current : undefined,
        signal: ac.signal,
      });
      if (!run.cancelled) createdIdsRef.current = [];
      setStatus(
        run.cancelled
          ? `Cleanup cancelled (${run.succeeded} deleted)`
          : `Cleanup done: ${run.succeeded} deleted`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      abortRef.current = null;
      setActive(null);
    }
  };

  const busy = active !== null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[10050] w-80 max-w-[calc(100vw-2rem)] shadow-lg rounded-lg border border-amber-500/60 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="flex items-center justify-between px-3 py-2 bg-amber-500/15 border-b border-amber-500/30 rounded-t-lg">
          <span className="text-xs font-bold tracking-wide text-amber-800 dark:text-amber-200">
            PERF TESTS
            {active ? ` · ${active.toUpperCase()}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs text-amber-800 dark:text-amber-200 hover:underline"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>

        {!collapsed && (
          <div className="p-3 space-y-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Assignee</label>
              <select
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
                value={selectedMember?.id || ''}
                disabled={busy}
                onChange={(e) => setMemberId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberDisplayName(m)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block font-medium mb-1">Task count</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
                  value={count}
                  disabled={busy}
                  onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                />
              </div>
              <button
                type="button"
                disabled={busy && active !== 'generate'}
                onClick={() => (active === 'generate' ? stopActive() : startGenerate())}
                className={`px-3 py-1.5 rounded font-medium ${
                  active === 'generate'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40'
                }`}
              >
                {active === 'generate' ? 'Cancel' : 'Generate'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy && active !== 'move'}
                onClick={() => (active === 'move' ? stopActive() : startMove())}
                className={`flex-1 px-3 py-1.5 rounded font-medium ${
                  active === 'move'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40'
                }`}
              >
                {active === 'move' ? 'Cancel' : 'Move tasks'}
              </button>
              <button
                type="button"
                disabled={busy && active !== 'cleanup'}
                onClick={() => (active === 'cleanup' ? stopActive() : startCleanup())}
                className={`flex-1 px-3 py-1.5 rounded font-medium ${
                  active === 'cleanup'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-40'
                }`}
              >
                {active === 'cleanup' ? 'Cancel' : 'Cleanup'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openReport('last')}
                className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Last run
              </button>
              <button
                type="button"
                onClick={() => openReport('history')}
                className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Session history
              </button>
            </div>

            {status && (
              <p className="text-[11px] text-gray-600 dark:text-gray-400 break-words">{status}</p>
            )}
          </div>
        )}
      </div>

      {reportKind && (
        <ReportModal
          title={reportKind === 'last' ? 'Last perf run' : 'Session perf history'}
          runs={reportRuns}
          onClose={() => setReportKind(null)}
        />
      )}
    </>
  );
};

export default PerfTestOverlay;
