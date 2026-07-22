import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface AssignToAgentModalProps {
  onConfirm: (repoUrl: string, repoBranch: string) => void | Promise<void>;
  onCancel: () => void;
}

const AssignToAgentModal: React.FC<AssignToAgentModalProps> = ({ onConfirm, onCancel }) => {
  const { t } = useTranslation('common');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoBranch, setRepoBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = repoUrl.trim();
    if (!url) {
      setError(t('agent.repoUrlRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(url, repoBranch.trim());
    } catch (err: any) {
      setError(err?.message || t('agent.assignFailed'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {t('agent.assignTitle')}
          </h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('agent.assignDescription')}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agent.repoUrl')}
            </label>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agent.repoBranch')}
            </label>
            <input
              type="text"
              value={repoBranch}
              onChange={(e) => setRepoBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('agent.agentsMdHint')}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
            >
              {busy ? t('agent.assigning') : t('agent.assignConfirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignToAgentModal;
