import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { getUserSettings, updateUserSetting } from '../../api';
import {
  FE_CLIENT_DEBUG_KEYS,
  SERVER_DEBUG_KEYS,
  type FeClientDebugKey,
  type ServerDebugKey,
} from '../../constants/clientDebugKeys';
import { useSettings } from '../../contexts/SettingsContext';
import {
  isPerfTestsUserSettingEnabled,
  notifyPerfTestsPreference,
  PERF_TESTS_USER_SETTING_KEY,
} from '../../perfTests';
import { toast } from '../../utils/toast';

type TroubleshootKey = FeClientDebugKey | ServerDebugKey;

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
  const { updateSiteSettings } = useSettings();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [perfTestsEnabled, setPerfTestsEnabled] = useState(false);
  const [perfTestsLoaded, setPerfTestsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getUserSettings();
        if (cancelled) return;
        setPerfTestsEnabled(
          isPerfTestsUserSettingEnabled(settings?.[PERF_TESTS_USER_SETTING_KEY])
        );
      } catch (error) {
        console.error('Failed to load perf tests preference:', error);
      } finally {
        if (!cancelled) setPerfTestsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const togglePerfTests = useCallback(async () => {
    const previous = perfTestsEnabled;
    const next = !previous;
    setPerfTestsEnabled(next);
    setSavingKey(PERF_TESTS_USER_SETTING_KEY);
    try {
      await updateUserSetting(PERF_TESTS_USER_SETTING_KEY, next ? 'true' : 'false');
      notifyPerfTestsPreference(next);
      toast.success(t('appSettings.settingSaved'), '');
    } catch (error) {
      console.error('Failed to save perf tests preference:', error);
      setPerfTestsEnabled(previous);
      toast.error(t('failedToSaveSetting', { key: PERF_TESTS_USER_SETTING_KEY }), '');
    } finally {
      setSavingKey(null);
    }
  }, [perfTestsEnabled, t]);

  const setMany = useCallback(
    async (keys: readonly string[], value: 'true' | 'false') => {
      const snapshot = { ...editingSettings };
      const settings: Record<string, string> = {};
      for (const key of keys) {
        settings[key] = value;
      }
      onSettingsChange({ ...editingSettings, ...settings });
      setSavingKey('bulk');
      try {
        await api.put('/admin/settings/bulk', { settings });
        updateSiteSettings(settings);
        toast.success(t('appSettings.settingSaved'), '');
      } catch (error) {
        console.error('Failed to bulk-update debug flags:', error);
        onSettingsChange(snapshot);
        toast.error(t('failedToSaveSettings'), '');
      } finally {
        setSavingKey(null);
      }
    },
    [editingSettings, onSettingsChange, t, updateSiteSettings]
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

  const perfBusy =
    !perfTestsLoaded ||
    savingKey === PERF_TESTS_USER_SETTING_KEY ||
    savingKey === 'bulk';

  return (
    <div className="space-y-8" data-setting-key="TROUBLESHOOTING_SECTION">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('appSettings.troubleshootingTitle')}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
          {t('appSettings.troubleshootingDescription')}
        </p>
      </div>

      {/* Performance Test Overlay — per admin (user_settings) */}
      <section className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-medium text-gray-900 dark:text-gray-100">
              {t('appSettings.perfTests')}
            </h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.perfTestsDescription')}
            </p>
            <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">
              user_settings.{PERF_TESTS_USER_SETTING_KEY}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center pt-0.5">
            <span className="mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {perfTestsEnabled
                ? t('appSettings.enabled')
                : t('appSettings.disabled')}
            </span>
            <button
              type="button"
              disabled={perfBusy}
              onClick={() => togglePerfTests()}
              aria-pressed={perfTestsEnabled}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                perfTestsEnabled
                  ? 'bg-blue-600 dark:bg-blue-500'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                  perfTestsEnabled ? 'translate-x-5' : 'translate-x-0'
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
