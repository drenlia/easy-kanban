import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { FE_CLIENT_DEBUG_KEYS, type FeClientDebugKey } from '../../constants/clientDebugKeys';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from '../../utils/toast';

const SERVER_DEBUG_KEYS = [
  'SERVER_DEBUG_HTTP',
  'SERVER_DEBUG_SQL',
  'SERVER_DEBUG_SETTINGS',
] as const;

type ServerDebugKey = (typeof SERVER_DEBUG_KEYS)[number];
type TroubleshootKey = FeClientDebugKey | ServerDebugKey | 'FE_PERF_TESTS';

interface AdminTroubleshootingTabProps {
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onAutoSave: (key: string, value: string) => Promise<void>;
}

function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

const AdminTroubleshootingTab: React.FC<AdminTroubleshootingTabProps> = ({
  editingSettings,
  onSettingsChange,
  onAutoSave,
}) => {
  const { t } = useTranslation('admin');
  const { updateSiteSetting } = useSettings();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const toggle = useCallback(
    async (key: TroubleshootKey) => {
      const previous = editingSettings[key] ?? 'false';
      const newValue = isEnabled(previous) ? 'false' : 'true';
      onSettingsChange({ ...editingSettings, [key]: newValue });
      setSavingKey(key);
      try {
        await onAutoSave(key, newValue);
      } catch (error) {
        console.error(`Failed to save ${key}:`, error);
        onSettingsChange({ ...editingSettings, [key]: previous });
      } finally {
        setSavingKey(null);
      }
    },
    [editingSettings, onAutoSave, onSettingsChange]
  );

  const setMany = useCallback(
    async (keys: readonly string[], value: 'true' | 'false') => {
      const snapshot = { ...editingSettings };
      const next = { ...editingSettings };
      for (const key of keys) {
        next[key] = value;
      }
      onSettingsChange(next);
      setSavingKey('bulk');
      try {
        for (const key of keys) {
          await api.put('/admin/settings', { key, value });
          updateSiteSetting(key, value);
        }
        toast.success(t('appSettings.settingSaved'), '');
      } catch (error) {
        console.error('Failed to bulk-update debug flags:', error);
        onSettingsChange(snapshot);
        toast.error(t('failedToSaveSettings'), '');
      } finally {
        setSavingKey(null);
      }
    },
    [editingSettings, onSettingsChange, t, updateSiteSetting]
  );

  const renderToggle = (key: TroubleshootKey, label: string, description: string, warn?: boolean) => {
    const on = isEnabled(editingSettings[key]);
    const busy = savingKey === key || savingKey === 'bulk';
    return (
      <div
        key={key}
        className={`flex items-center justify-between gap-4 py-3 ${
          warn ? 'rounded-md border border-amber-300/60 dark:border-amber-600/40 bg-amber-50/50 dark:bg-amber-900/10 px-3' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">{key}</p>
        </div>
        <div className="flex flex-shrink-0 items-center">
          <span className="mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            {on ? t('appSettings.enabled') : t('appSettings.disabled')}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => toggle(key)}
            aria-pressed={on}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
              on ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                on ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('appSettings.troubleshootingTitle')}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
          {t('appSettings.troubleshootingDescription')}
        </p>
      </div>

      {/* Performance Test Overlay */}
      <section className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
              {t('appSettings.perfTests')}
            </h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.perfTestsDescription')}
            </p>
            <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">FE_PERF_TESTS</p>
          </div>
          <div className="flex flex-shrink-0 items-center pt-0.5">
            <span className="mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {isEnabled(editingSettings.FE_PERF_TESTS)
                ? t('appSettings.enabled')
                : t('appSettings.disabled')}
            </span>
            <button
              type="button"
              disabled={savingKey === 'FE_PERF_TESTS' || savingKey === 'bulk'}
              onClick={() => toggle('FE_PERF_TESTS')}
              aria-pressed={isEnabled(editingSettings.FE_PERF_TESTS)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                isEnabled(editingSettings.FE_PERF_TESTS)
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                  isEnabled(editingSettings.FE_PERF_TESTS) ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Browser console */}
      <section className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
              {t('appSettings.troubleshootingBrowserSection')}
            </h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.troubleshootingBrowserSectionDescription')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingKey !== null}
              onClick={() => setMany(FE_CLIENT_DEBUG_KEYS, 'true')}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {t('appSettings.enableAll')}
            </button>
            <button
              type="button"
              disabled={savingKey !== null}
              onClick={() => setMany(FE_CLIENT_DEBUG_KEYS, 'false')}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {t('appSettings.disableAll')}
            </button>
          </div>
        </div>
        <div className="px-6 py-2 divide-y divide-gray-100 dark:divide-gray-700">
          {FE_CLIENT_DEBUG_KEYS.map((key) =>
            renderToggle(
              key,
              t(`appSettings.debugFlags.${key}.label`),
              t(`appSettings.debugFlags.${key}.description`)
            )
          )}
        </div>
      </section>

      {/* Server logs */}
      <section className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
            {t('appSettings.troubleshootingServerSection')}
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('appSettings.troubleshootingServerSectionDescription')}
          </p>
        </div>
        <div className="px-6 py-2 space-y-1">
          {SERVER_DEBUG_KEYS.map((key) =>
            renderToggle(
              key,
              t(`appSettings.debugFlags.${key}.label`),
              t(`appSettings.debugFlags.${key}.description`),
              key === 'SERVER_DEBUG_SQL'
            )
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminTroubleshootingTab;
