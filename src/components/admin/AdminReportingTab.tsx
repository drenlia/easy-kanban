import React, { useState, useEffect } from 'react';
import { Save, Trophy, TrendingUp, Settings, Database, Eye, EyeOff } from 'lucide-react';

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const reportingSettings: Partial<ReportingSettings> = {};
        
        // Extract only reporting-related settings
        Object.keys(data).forEach(key => {
          if (key.startsWith('REPORTS_')) {
            reportingSettings[key as keyof ReportingSettings] = data[key] || settings[key as keyof ReportingSettings];
          }
        });

        const mergedSettings = { ...settings, ...reportingSettings };
        setSettings(mergedSettings);
        setOriginalSettings(mergedSettings);
      }
    } catch (error) {
      console.error('Failed to fetch reporting settings:', error);
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
        setMessage({ type: 'success', text: 'Visibility setting saved!' });
        setTimeout(() => setMessage(null), 2000);
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
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save visibility setting.'
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

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
      setMessage({ type: 'success', text: 'Reporting settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save reporting settings' 
      });
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
        setMessage({ type: 'success', text: 'Setting saved successfully!' });
        setTimeout(() => setMessage(null), 2000);
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
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save setting. Please try again.' 
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRefreshNow = async () => {
    try {
      setRefreshing(true);
      setMessage(null);

      const response = await fetch('/api/admin/jobs/snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setMessage({ 
          type: 'success', 
          text: `Snapshot complete! ${result.snapshotCount || 0} tasks captured in ${result.duration || 0}ms` 
        });
        setTimeout(() => setMessage(null), 5000);
      } else {
        throw new Error('Failed to trigger snapshot');
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to trigger snapshot' 
      });
      setTimeout(() => setMessage(null), 3000);
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
          Reports & Analytics Settings
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure reporting features, gamification, and data retention
        </p>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Module Enablement */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Module Configuration
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">Enable Reports Module</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Master toggle for all reporting features
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
                Enable Gamification
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Points, rankings, achievements, and badges
              </div>
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-medium">
                ⚠️ Disabling hides "My Stats" and "Leaderboard" tabs
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
              <div className="font-medium text-gray-900 dark:text-white">Enable Leaderboard</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Team rankings and competition (requires Gamification)
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
              <div className="font-medium text-gray-900 dark:text-white">Enable Achievements</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Badge rewards section in "My Stats" report
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
          Visibility & Access
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reports Visibility & Access
          </label>
          <select
            value={settings.REPORTS_VISIBLE_TO}
            onChange={(e) => handleVisibilityChange(e.target.value)}
            disabled={settings.REPORTS_ENABLED === 'false'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="all">All Users (Default)</option>
            <option value="admin">Admins Only</option>
          </select>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Control who can access the Reports module (auto-saved)
          </p>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Management
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Snapshot Frequency
            </label>
            <select
              value={settings.REPORTS_SNAPSHOT_FREQUENCY}
              onChange={(e) => setSettings(prev => ({ ...prev, REPORTS_SNAPSHOT_FREQUENCY: e.target.value }))}
              disabled={settings.REPORTS_ENABLED === 'false'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="daily">Daily (Midnight UTC)</option>
              <option value="weekly">Weekly (Sunday)</option>
              <option value="manual">Manual Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Retention (Days)
            </label>
            <select
              value={settings.REPORTS_RETENTION_DAYS}
              onChange={(e) => setSettings(prev => ({ ...prev, REPORTS_RETENTION_DAYS: e.target.value }))}
              disabled={settings.REPORTS_ENABLED === 'false'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="90">90 days</option>
              <option value="180">6 months</option>
              <option value="365">1 year</option>
              <option value="730">2 years</option>
              <option value="1825">5 years</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>
        </div>

        {/* Manual Snapshot Trigger */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Manual Snapshot</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Capture current state of all tasks immediately
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
                  Capturing...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Refresh Now
                </>
              )}
            </button>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>Impact:</strong> Frequent snapshots are safe and won't affect performance. 
              Each snapshot takes ~100-500ms and creates one record per task. 
              Use this to test reports or after making significant task changes.
            </p>
          </div>
        </div>
      </div>

      {/* Points Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Points Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'REPORTS_POINTS_TASK_CREATED', label: 'Task Created' },
            { key: 'REPORTS_POINTS_TASK_COMPLETED', label: 'Task Completed' },
            { key: 'REPORTS_POINTS_TASK_MOVED', label: 'Task Moved' },
            { key: 'REPORTS_POINTS_TASK_UPDATED', label: 'Task Updated' },
            { key: 'REPORTS_POINTS_COMMENT_ADDED', label: 'Comment Added' },
            { key: 'REPORTS_POINTS_WATCHER_ADDED', label: 'Watcher Added' },
            { key: 'REPORTS_POINTS_COLLABORATOR_ADDED', label: 'Collaborator Added' },
            { key: 'REPORTS_POINTS_TAG_ADDED', label: 'Tag Added' },
            { key: 'REPORTS_POINTS_EFFORT_MULTIPLIER', label: 'Effort Multiplier' },
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
          onClick={fetchSettings}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          disabled={saving || !hasChanges}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AdminReportingTab;

