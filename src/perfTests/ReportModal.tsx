import React, { useMemo } from 'react';
import type { PerfRunRecord } from './metrics';

interface ReportModalProps {
  title: string;
  runs: PerfRunRecord[];
  onClose: () => void;
}

function formatLatency(lat: PerfRunRecord['latencyMs']): string {
  if (!lat) return 'n/a';
  return `min ${lat.min} · p50 ${lat.p50} · p95 ${lat.p95} · max ${lat.max} · mean ${lat.mean} ms`;
}

const ReportModal: React.FC<ReportModalProps> = ({ title, runs, onClose }) => {
  const json = useMemo(() => JSON.stringify(runs, null, 2), [runs]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyJson}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-auto p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
          {runs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No runs yet in this session.</p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-1"
              >
                <div className="font-medium capitalize">
                  {run.scenario}
                  {run.cancelled ? ' (cancelled)' : ''}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {run.startedAt} → {run.endedAt}
                </div>
                <div>
                  Attempted {run.attempted} · OK {run.succeeded} · Fail {run.failed}
                  {run.opsPerSec != null ? ` · ${run.opsPerSec} ops/s` : ''}
                </div>
                <div className="text-xs">{formatLatency(run.latencyMs)}</div>
                {run.errors.length > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    Errors: {run.errors.join(' | ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
