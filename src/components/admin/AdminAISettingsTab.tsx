import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from '../../utils/toast';

interface AdminAISettingsTabProps {
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onAutoSave: (key: string, value: string) => Promise<void>;
}

function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

const AdminAISettingsTab: React.FC<AdminAISettingsTabProps> = ({
  editingSettings,
  onSettingsChange,
  onAutoSave,
}) => {
  const { t } = useTranslation('admin');
  const { updateSiteSetting } = useSettings();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const saveKey = useCallback(
    async (key: string, value: string) => {
      const previous = editingSettings[key];
      onSettingsChange({ ...editingSettings, [key]: value });
      setSavingKey(key);
      try {
        await onAutoSave(key, value);
        updateSiteSetting(key, value);
        toast.success(t('appSettings.settingSaved'), '');
      } catch (error) {
        console.error(`Failed to save ${key}:`, error);
        onSettingsChange({ ...editingSettings, [key]: previous });
        toast.error(t('failedToSaveSettings'), '');
      } finally {
        setSavingKey(null);
      }
    },
    [editingSettings, onAutoSave, onSettingsChange, t, updateSiteSetting]
  );

  const toggleEnabled = async () => {
    const previous = editingSettings.AI_ENABLED ?? 'false';
    const next = isEnabled(previous) ? 'false' : 'true';
    await saveKey('AI_ENABLED', next);
  };

  const enabled = isEnabled(editingSettings.AI_ENABLED);
  const keySet = editingSettings.AI_API_KEY_SET === 'true';

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('appSettings.aiTitle')}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('appSettings.aiDescription')}
        </p>
      </div>

      <div className="px-6 py-4 space-y-6">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('appSettings.aiEnabled')}
            </label>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.aiEnabledDescription')}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center">
            <span className="mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {enabled ? t('appSettings.enabled') : t('appSettings.disabled')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={savingKey === 'AI_ENABLED'}
              onClick={toggleEnabled}
              className={`${
                enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
              } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50`}
            >
              <span
                className={`${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
              />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('appSettings.aiAgentName')}
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('appSettings.aiAgentNameDescription')}
          </p>
          <input
            type="text"
            value={editingSettings.AI_AGENT_NAME || 'Agent'}
            onChange={(e) =>
              onSettingsChange({ ...editingSettings, AI_AGENT_NAME: e.target.value })
            }
            onBlur={(e) => {
              const v = e.target.value.trim() || 'Agent';
              if (v !== (editingSettings.AI_AGENT_NAME || 'Agent')) {
                void saveKey('AI_AGENT_NAME', v);
              } else if (v !== editingSettings.AI_AGENT_NAME) {
                void saveKey('AI_AGENT_NAME', v);
              }
            }}
            className="block w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('appSettings.aiApiBaseUrl')}
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('appSettings.aiApiBaseUrlDescription')}
          </p>
          <input
            type="url"
            value={editingSettings.AI_API_BASE_URL || ''}
            onChange={(e) =>
              onSettingsChange({ ...editingSettings, AI_API_BASE_URL: e.target.value })
            }
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (editingSettings.AI_API_BASE_URL || '')) {
                void saveKey('AI_API_BASE_URL', v);
              }
            }}
            placeholder="https://api.example.com/v1"
            className="block w-full max-w-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('appSettings.aiApiKey')}
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('appSettings.aiApiKeyDescription')}
            {keySet ? ` ${t('appSettings.aiApiKeyConfigured')}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 items-center max-w-xl">
            <input
              type="password"
              autoComplete="new-password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={keySet ? '••••••••' : ''}
              className="block flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              disabled={!apiKeyDraft.trim() || savingKey === 'AI_API_KEY'}
              onClick={async () => {
                await saveKey('AI_API_KEY', apiKeyDraft.trim());
                setApiKeyDraft('');
                onSettingsChange({ ...editingSettings, AI_API_KEY_SET: 'true', AI_API_KEY: '' });
              }}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {t('appSettings.aiSaveApiKey')}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('appSettings.aiModel')}
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {t('appSettings.aiModelDescription')}
          </p>
          <input
            type="text"
            value={editingSettings.AI_MODEL || ''}
            onChange={(e) =>
              onSettingsChange({ ...editingSettings, AI_MODEL: e.target.value })
            }
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (editingSettings.AI_MODEL || '')) {
                void saveKey('AI_MODEL', v);
              }
            }}
            placeholder="gpt-4o / claude-… / …"
            className="block w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          {t('appSettings.aiRunnerNote')}
        </div>
      </div>
    </div>
  );
};

export default AdminAISettingsTab;
