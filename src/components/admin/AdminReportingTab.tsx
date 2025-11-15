import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../utils/toast';
import { Save, Trophy, TrendingUp, Settings, Database, Eye, EyeOff } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

interface ReportingSettings {
  REPORTS_ENABLED: string;
  REPORTS_GAMIFICATION_ENABLED: string;
  REPORTS_LEADERBOARD_ENABLED: string;
  REPORTS_ACHIEVEMENTS_ENABLED: string;
  REPORTS_SNAPSHOT_FREQUENCY: string;
  REPORTS_RETENTION_DAYS: string;
  REPORTS_VISIBLE_TO: string;
  REPORTS_POINTS_TASK_CREATED: string;
  REPORTS_POINTS_TASK_COMPLETED: string;
  REPORTS_POINTS_TASK_MOVED: string;
  REPORTS_POINTS_TASK_UPDATED: string;
  REPORTS_POINTS_COMMENT_ADDED: string;
  REPORTS_POINTS_WATCHER_ADDED: string;
  REPORTS_POINTS_COLLABORATOR_ADDED: string;
  REPORTS_POINTS_TAG_ADDED: string;
  REPORTS_POINTS_EFFORT_MULTIPLIER: string;
}

const AdminReportingTab: React.FC = () => {
  const { t } = useTranslation('admin');
  const { systemSettings } = useSettings(); // Use SettingsContext instead of fetching directly
  const [settings, setSettings] = useState<ReportingSettings>({
    REPORTS_ENABLED: 'true',
    REPORTS_GAMIFICATION_ENABLED: 'true',
    REPORTS_LEADERBOARD_ENABLED: 'true',
    REPORTS_ACHIEVEMENTS_ENABLED: 'true',
    REPORTS_SNAPSHOT_FREQUENCY: 'daily',
    REPORTS_RETENTION_DAYS: '730',
    REPORTS_VISIBLE_TO: 'all',
    REPORTS_POINTS_TASK_CREATED: '5',
    REPORTS_POINTS_TASK_COMPLETED: '10',
    REPORTS_POINTS_TASK_MOVED: '2',
    REPORTS_POINTS_TASK_UPDATED: '1',
    REPORTS_POINTS_COMMENT_ADDED: '3',
    REPORTS_POINTS_WATCHER_ADDED: '1',
    REPORTS_POINTS_COLLABORATOR_ADDED: '2',
    REPORTS_POINTS_TAG_ADDED: '1',
    REPORTS_POINTS_EFFORT_MULTIPLIER: '2',
  });

  const [originalSettings, setOriginalSettings] = useState<ReportingSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load settings from SettingsContext when available
  useEffect(() => {
    if (systemSettings && Object.keys(systemSettings).length > 0) {
      const reportingSettings: Partial<ReportingSettings> = {};
      
      // Extract only reporting-related settings from SettingsContext
      Object.keys(systemSettings).forEach(key => {
        if (key.startsWith('REPORTS_')) {
          reportingSettings[key as keyof ReportingSettings] = systemSettings[key] || settings[key as keyof ReportingSettings];
        }
      });

      if (Object.keys(reportingSettings).length > 0) {
        const mergedSettings = { ...settings, ...reportingSettings };
        setSettings(mergedSettings);
        setOriginalSettings(mergedSettings);
      }
    }
  }, [systemSettings]); // Only depend on systemSettings, not settings

  // Function to reset settings to original values (reload from SettingsContext)
  const handleReset = () => {
    if (systemSettings && Object.keys(systemSettings).length > 0) {
      const reportingSettings: Partial<ReportingSettings> = {};
      
      // Extract only reporting-related settings from SettingsContext
      Object.keys(systemSettings).forEach(key => {
        if (key.startsWith('REPORTS_')) {
          reportingSettings[key as keyof ReportingSettings] = systemSettings[key] || settings[key as keyof ReportingSettings];
        }
      });

      if (Object.keys(reportingSettings).length > 0) {
        const mergedSettings = { ...settings, ...reportingSettings };
        setSettings(mergedSettings);
        setOriginalSettings(mergedSettings);
      }
    }
  };

  const handleVisibilityChange = async (newValue: string) => {
    const oldValue = settings.REPORTS_VISIBLE_TO;
    
    // Optimistically update UI
    setSettings(prev => ({
      ...prev,
      REPORTS_VISIBLE_TO: newValue
    }));
    
    // Auto-save the change
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ key: 'REPORTS_VISIBLE_TO', value: newValue })
      });

      if (response.ok) {
        setOriginalSettings(prev => ({
          ...prev,
          REPORTS_VISIBLE_TO: newValue
        }));
        toast.success(t('reporting.visibilitySettingSaved'), '', 2000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save setting');
      }
    } catch (error) {
      console.error('Visibility change error:', error);
      // Revert on error
      setSettings(prev => ({
        ...prev,
        REPORTS_VISIBLE_TO: oldValue
      }));
      toast.error(error instanceof Error ? error.message : t('reporting.failedToSaveVisibilitySetting'), '');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Save each setting individually (server expects key/value pairs)
      const settingsToSave = Object.entries(settings);
      for (const [key, value] of settingsToSave) {
        const response = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify({ key, value })
        });

        if (!response.ok) {
          throw new Error(`Failed to save ${key}`);
        }
      }

      setOriginalSettings(settings);
      toast.success(t('reporting.settingsSavedSuccessfully'), '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reporting.failedToSaveSettings'), '');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (key: keyof ReportingSettings) => {
    const oldValue = settings[key];
    const newValue = oldValue === 'true' ? 'false' : 'true';
    
    // Optimistically update UI
    setSettings(prev => ({
      ...prev,
      [key]: newValue
    }));
    
    // Auto-save the toggle
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ key, value: newValue })
      });

      if (response.ok) {
        // Update original settings to reflect the saved state
        setOriginalSettings(prev => ({
          ...prev,
          [key]: newValue
        }));
        toast.success(t('reporting.settingSavedSuccessfully'), '', 2000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save setting');
      }
    } catch (error) {
      console.error('Toggle error:', error);
      // Revert to old value on error
      setSettings(prev => ({
        ...prev,
        [key]: oldValue
      }));
      toast.error(error instanceof Error ? error.message : t('reporting.failedToSaveSetting'), '');
    }
  };

  const handleRefreshNow = async () => {
    try {
      setRefreshing(true);

      const response = await fetch('/api/admin/jobs/snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        const totalCount = result.count || 0;
        const newCount = result.newCount || 0;
        const updatedCount = result.updatedCount || 0;
        toast.success(t('reporting.snapshotComplete', { 
          count: totalCount, 
          newCount, 
          updatedCount, 
          duration: result.duration || 0 
        }), '', 5000);
      } else {
        throw new Error('Failed to trigger snapshot');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reporting.failedToTriggerSnapshot'), '');
    } finally {
      setRefreshing(false);
    }
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('reporting.title')}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {t('reporting.description')}
        </p>
      </div>


      <div className="space-y-6">
        {/* Module Enablement */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          {t('reporting.moduleConfiguration')}
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">{t('reporting.enableReportsModule')}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('reporting.enableReportsModuleDescription')}
              </div>
            </div>
            <button
              onClick={() => handleToggle('REPORTS_ENABLED')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.REPORTS_ENABLED === 'true' ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.REPORTS_ENABLED === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                {t('reporting.enableGamification')}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('reporting.enableGamificationDescription')}
              </div>
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-medium">
                {t('reporting.disablingGamificationWarning')}
              </div>
            </div>
            <button
              onClick={() => handleToggle('REPORTS_GAMIFICATION_ENABLED')}
              disabled={settings.REPORTS_ENABLED === 'false'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.REPORTS_GAMIFICATION_ENABLED === 'true' && settings.REPORTS_ENABLED === 'true'
                  ? 'bg-blue-600' 
                  : 'bg-gray-200 dark:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.REPORTS_GAMIFICATION_ENABLED === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">{t('reporting.enableLeaderboard')}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('reporting.enableLeaderboardDescription')}
              </div>
            </div>
            <button
              onClick={() => handleToggle('REPORTS_LEADERBOARD_ENABLED')}
              disabled={settings.REPORTS_ENABLED === 'false' || settings.REPORTS_GAMIFICATION_ENABLED === 'false'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.REPORTS_LEADERBOARD_ENABLED === 'true' && 
                settings.REPORTS_ENABLED === 'true' && 
                settings.REPORTS_GAMIFICATION_ENABLED === 'true'
                  ? 'bg-blue-600' 
                  : 'bg-gray-200 dark:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.REPORTS_LEADERBOARD_ENABLED === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">{t('reporting.enableAchievements')}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('reporting.enableAchievementsDescription')}
              </div>
            </div>
            <button
              onClick={() => handleToggle('REPORTS_ACHIEVEMENTS_ENABLED')}
              disabled={settings.REPORTS_ENABLED === 'false' || settings.REPORTS_GAMIFICATION_ENABLED === 'false'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.REPORTS_ACHIEVEMENTS_ENABLED === 'true' && 
                settings.REPORTS_ENABLED === 'true' && 
                settings.REPORTS_GAMIFICATION_ENABLED === 'true'
                  ? 'bg-blue-600' 
                  : 'bg-gray-200 dark:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.REPORTS_ACHIEVEMENTS_ENABLED === 'true' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Visibility & Access */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5" />
          {t('reporting.visibilityAndAccess')}
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('reporting.reportsVisibilityAndAccess')}
          </label>
          <select
            value={settings.REPORTS_VISIBLE_TO}
            onChange={(e) => handleVisibilityChange(e.target.value)}
            disabled={settings.REPORTS_ENABLED === 'false'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="all">{t('reporting.allUsers')}</option>
            <option value="admin">{t('reporting.adminsOnly')}</option>
          </select>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('reporting.reportsVisibilityDescription')}
          </p>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          {t('reporting.dataManagement')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('reporting.snapshotFrequency')}
            </label>
            <select
              value={settings.REPORTS_SNAPSHOT_FREQUENCY}
              onChange={(e) => setSettings(prev => ({ ...prev, REPORTS_SNAPSHOT_FREQUENCY: e.target.value }))}
              disabled={settings.REPORTS_ENABLED === 'false'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="daily">{t('reporting.daily')}</option>
              <option value="weekly">{t('reporting.weekly')}</option>
              <option value="manual">{t('reporting.manualOnly')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('reporting.dataRetentionDays')}
            </label>
            <select
              value={settings.REPORTS_RETENTION_DAYS}
              onChange={(e) => setSettings(prev => ({ ...prev, REPORTS_RETENTION_DAYS: e.target.value }))}
              disabled={settings.REPORTS_ENABLED === 'false'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="90">{t('reporting.days90')}</option>
              <option value="180">{t('reporting.months6')}</option>
              <option value="365">{t('reporting.year1')}</option>
              <option value="730">{t('reporting.years2')}</option>
              <option value="1825">{t('reporting.years5')}</option>
              <option value="unlimited">{t('reporting.unlimited')}</option>
            </select>
          </div>
        </div>

        {/* Manual Snapshot Trigger */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">{t('reporting.manualSnapshot')}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('reporting.manualSnapshotDescription')}
              </p>
            </div>
            <button
              onClick={handleRefreshNow}
              disabled={refreshing || settings.REPORTS_ENABLED === 'false'}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('reporting.capturing')}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  {t('reporting.refreshNow')}
                </>
              )}
            </button>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>{t('reporting.impact')}:</strong> {t('reporting.impactDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* Points Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          {t('reporting.pointsConfiguration')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'REPORTS_POINTS_TASK_CREATED', label: t('reporting.points.taskCreated') },
            { key: 'REPORTS_POINTS_TASK_COMPLETED', label: t('reporting.points.taskCompleted') },
            { key: 'REPORTS_POINTS_TASK_MOVED', label: t('reporting.points.taskMoved') },
            { key: 'REPORTS_POINTS_TASK_UPDATED', label: t('reporting.points.taskUpdated') },
            { key: 'REPORTS_POINTS_COMMENT_ADDED', label: t('reporting.points.commentAdded') },
            { key: 'REPORTS_POINTS_WATCHER_ADDED', label: t('reporting.points.watcherAdded') },
            { key: 'REPORTS_POINTS_COLLABORATOR_ADDED', label: t('reporting.points.collaboratorAdded') },
            { key: 'REPORTS_POINTS_TAG_ADDED', label: t('reporting.points.tagAdded') },
            { key: 'REPORTS_POINTS_EFFORT_MULTIPLIER', label: t('reporting.points.effortMultiplier') },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {label}
              </label>
              <input
                type="number"
                min="0"
                value={settings[key as keyof ReportingSettings]}
                onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                disabled={settings.REPORTS_ENABLED === 'false' || settings.REPORTS_GAMIFICATION_ENABLED === 'false'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          disabled={saving || !hasChanges}
        >
          {t('reporting.reset')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              {t('reporting.saving')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t('reporting.saveChanges')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AdminReportingTab;

