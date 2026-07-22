import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Pause, Play, Square } from 'lucide-react';
import type { TaskWorkMap } from '../api';

interface AgentWorkingModalProps {
  taskTitle: string;
  work: TaskWorkMap;
  onClose: () => void;
  onControl: (control: 'pause' | 'stop' | 'resume') => void | Promise<void>;
  busy?: boolean;
}

const AgentWorkingModal: React.FC<AgentWorkingModalProps> = ({
  taskTitle,
  work,
  onClose,
  onControl,
  busy
}) => {
  const { t } = useTranslation('common');
  const status = work.status || 'unknown';
  const log = work.log || '';
  const progress = work.progress;
  const repoUrl = work.repo_url;

  const canPause = status === 'running' || status === 'queued';
  const canResume = status === 'paused' || status === 'waiting' || status === 'stopped';
  const canStop = status !== 'stopped' && status !== 'done' && status !== 'failed';

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
              {t('agent.workingTitle')}
            </h3>
            <p className="text-sm text-gray-500 truncate">{taskTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {t('agent.status')}: <strong className="capitalize">{status}</strong>
          </span>
          {progress != null && progress !== '' && (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {t('agent.progress')}: {progress}%
            </span>
          )}
          {repoUrl && (
            <a
              href={String(repoUrl).replace(/\.git$/, '')}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline truncate max-w-xs"
            >
              {repoUrl}
            </a>
          )}
          <div className="ml-auto flex gap-2">
            {canPause && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onControl('pause')}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                <Pause size={14} /> {t('agent.pause')}
              </button>
            )}
            {canResume && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onControl('resume')}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-teal-100 text-teal-900 hover:bg-teal-200 disabled:opacity-50"
              >
                <Play size={14} /> {t('agent.resume')}
              </button>
            )}
            {canStop && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onControl('stop')}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-red-100 text-red-900 hover:bg-red-200 disabled:opacity-50"
              >
                <Square size={14} /> {t('agent.stop')}
              </button>
            )}
          </div>
        </div>

        {status === 'waiting' && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-900 dark:text-amber-100">
            {t('agent.waitingHint')}
          </div>
        )}

        <div className="flex-1 overflow-auto px-4 py-3">
          <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 rounded p-3 min-h-[200px]">
            {log || t('agent.noLogYet')}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default AgentWorkingModal;
