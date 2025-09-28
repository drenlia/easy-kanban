import React, { useState, useEffect } from 'react';
import AdminFileUploadsTab from './AdminFileUploadsTab';

interface AdminAppSettingsTabProps {
  settings: { [key: string]: string | undefined };
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onSave: (settings?: { [key: string]: string | undefined }) => Promise<void>;
  onCancel: () => void;
  successMessage: string | null;
  error: string | null;
}

const AdminAppSettingsTab: React.FC<AdminAppSettingsTabProps> = ({
  settings,
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  successMessage,
  error,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'ui' | 'uploads' | 'notifications'>('ui');
  const [notificationDefaults, setNotificationDefaults] = useState<{ [key: string]: boolean }>({});
  const [autosaveSuccess, setAutosaveSuccess] = useState<string | null>(null);

  // Initialize notification defaults from settings
  useEffect(() => {
    if (settings.NOTIFICATION_DEFAULTS) {
      try {
        const defaults = JSON.parse(settings.NOTIFICATION_DEFAULTS);
        setNotificationDefaults(defaults);
      } catch (error) {
        console.error('Failed to parse notification defaults:', error);
        // Set default values
        setNotificationDefaults({
          newTaskAssigned: true,
          myTaskUpdated: true,
          watchedTaskUpdated: true,
          addedAsCollaborator: true,
          collaboratingTaskUpdated: true,
          commentAdded: true,
          requesterTaskCreated: true,
          requesterTaskUpdated: true
        });
      }
    } else {
      // Set default values if no settings exist
      setNotificationDefaults({
        newTaskAssigned: true,
        myTaskUpdated: true,
        watchedTaskUpdated: true,
        addedAsCollaborator: true,
        collaboratingTaskUpdated: true,
        commentAdded: true,
        requesterTaskCreated: true,
        requesterTaskUpdated: true
      });
    }
  }, [settings.NOTIFICATION_DEFAULTS]);

  // Initialize activeSubTab from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#admin#app-settings#file-uploads') {
      setActiveSubTab('uploads');
    } else if (hash === '#admin#app-settings#notifications') {
      setActiveSubTab('notifications');
    } else if (hash === '#admin#app-settings#user-interface') {
      setActiveSubTab('ui');
    }
  }, []);

  // Update URL hash when activeSubTab changes
  const handleSubTabChange = (tab: 'ui' | 'uploads' | 'notifications') => {
    setActiveSubTab(tab);
    let newHash = '#admin#app-settings#user-interface';
    if (tab === 'uploads') {
      newHash = '#admin#app-settings#file-uploads';
    } else if (tab === 'notifications') {
      newHash = '#admin#app-settings#notifications';
    }
    window.location.hash = newHash;
  };

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin#app-settings#file-uploads') {
        setActiveSubTab('uploads');
      } else if (hash === '#admin#app-settings#notifications') {
        setActiveSubTab('notifications');
      } else if (hash === '#admin#app-settings#user-interface') {
        setActiveSubTab('ui');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(settings) !== JSON.stringify(editingSettings);
  };

  const handleTaskDeleteConfirmChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      TASK_DELETE_CONFIRM: value
    });
  };

  const handleShowActivityFeedChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      SHOW_ACTIVITY_FEED: value
    });
  };

  const handleDefaultViewModeChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_VIEW_MODE: value
    });
  };

  const handleDefaultTaskViewModeChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_TASK_VIEW_MODE: value
    });
  };

  const handleDefaultActivityFeedPositionChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_POSITION: value
    });
  };

  const handleDefaultActivityFeedWidthChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_WIDTH: value
    });
  };

  const handleDefaultActivityFeedHeightChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_HEIGHT: value
    });
  };

  const handleNotificationDelayChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      NOTIFICATION_DELAY: value
    });
    
    // Auto-save the notification delay change
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          NOTIFICATION_DELAY: value
        });
        showAutosaveSuccess('Email throttling delay saved successfully');
      } catch (error) {
        console.error('Failed to save notification delay:', error);
      }
    }, 100);
  };

  // Helper function to get notification default value
  const getNotificationDefault = (key: string): boolean => {
    return notificationDefaults[key] ?? true;
  };

  // Helper function to show autosave success message
  const showAutosaveSuccess = (message: string) => {
    setAutosaveSuccess(message);
    setTimeout(() => {
      setAutosaveSuccess(null);
    }, 3000);
  };

  // Handler for notification default changes
  const handleNotificationDefaultChange = (key: string, value: boolean) => {
    const newDefaults = { ...notificationDefaults, [key]: value };
    setNotificationDefaults(newDefaults);
    
    // Auto-save the changes
    onSettingsChange({
      ...editingSettings,
      NOTIFICATION_DEFAULTS: JSON.stringify(newDefaults)
    });
    
    // Auto-save the notification defaults change
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          NOTIFICATION_DEFAULTS: JSON.stringify(newDefaults)
        });
        showAutosaveSuccess('Notification defaults saved successfully');
      } catch (error) {
        console.error('Failed to save notification defaults:', error);
      }
    }, 100);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">App Settings</h2>
      </div>

      {/* Sub-tab Navigation */}
      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => handleSubTabChange('ui')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'ui'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            User Interface
          </button>
          <button
            onClick={() => handleSubTabChange('uploads')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'uploads'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            File Uploads
          </button>
          <button
            onClick={() => handleSubTabChange('notifications')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'notifications'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Notifications
          </button>
        </nav>
      </div>

      {/* Conditional Content Based on Active Sub-tab */}
      {activeSubTab === 'ui' ? (
        <>
          {/* Success and Error Messages */}
          {successMessage && (
            <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">{successMessage}</p>
                  </div>
                  </div>
                </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              </div>
          )}

          {autosaveSuccess && (
            <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{autosaveSuccess}</p>
                  </div>
                </div>
              </div>
          )}

          {/* Settings Form */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">User Interface Settings</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Configure application-wide behavior settings. These settings apply as defaults for all users, but users can override them in their personal preferences.
              </p>
                </div>

            <div className="px-6 py-4 space-y-6">
              {/* Task Delete Confirmation Setting */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Task Delete Confirmation
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Require confirmation before deleting tasks. Users can override this in their personal preferences.
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.TASK_DELETE_CONFIRM || 'true'}
                    onChange={(e) => handleTaskDeleteConfirmChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                  </div>
                  </div>
                </div>

            {/* New User Defaults Section */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">New User Defaults</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Configure default preferences for new users. Existing users keep their current settings.
              </p>
              
              <div className="space-y-6">
                {/* Default View Mode */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      Default View Mode
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Default view mode for new users (Kanban or List view)
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={editingSettings.DEFAULT_VIEW_MODE || 'kanban'}
                      onChange={(e) => handleDefaultViewModeChange(e.target.value)}
                      className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="kanban">Kanban</option>
                      <option value="list">List</option>
                    </select>
                  </div>
                </div>

            {/* Default Task View Mode */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Default Task View Mode
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                  Default task card size for new users (Expanded or Collapsed)
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={editingSettings.DEFAULT_TASK_VIEW_MODE || 'expand'}
                      onChange={(e) => handleDefaultTaskViewModeChange(e.target.value)}
                      className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="expand">Expanded</option>
                      <option value="collapse">Collapsed</option>
                    </select>
                  </div>
                </div>

            {/* Activity Feed Defaults */}
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <h5 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">Activity Feed Defaults</h5>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                Configure default activity feed settings for new users. Users can override these in their personal preferences.
              </p>
              
              {/* Activity Feed Visibility */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Default Visibility
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Whether the activity feed is shown by default
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.SHOW_ACTIVITY_FEED || 'true'}
                    onChange={(e) => handleShowActivityFeedChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                  </div>
                  </div>
              
              {/* Activity Feed Position */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Default Position
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Default position for activity feed (JSON format: {`{"x": 0, "y": 66}`})
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="text"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_POSITION || '{"x": 0, "y": 66}'}
                    onChange={(e) => handleDefaultActivityFeedPositionChange(e.target.value)}
                    className="block w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder='{"x": 0, "y": 66}'
                  />
                  </div>
                  </div>

              {/* Activity Feed Width */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Default Width
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Default width in pixels (180-400)
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="number"
                    min="180"
                    max="400"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_WIDTH || '208'}
                    onChange={(e) => handleDefaultActivityFeedWidthChange(e.target.value)}
                    className="block w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  </div>
                  </div>

              {/* Activity Feed Height */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    Default Height
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Default height in pixels (200-800)
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="number"
                    min="200"
                    max="800"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_HEIGHT || '400'}
                    onChange={(e) => handleDefaultActivityFeedHeightChange(e.target.value)}
                    className="block w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  </div>
                  </div>
                </div>
          </div>
        </div>

            {/* Action Buttons */}
            {hasChanges() && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onCancel}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                  </div>
            )}
          </div>
        </>
      ) : activeSubTab === 'notifications' ? (
        <>
          {/* Success and Error Messages for Notifications */}
          {successMessage && (
            <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{successMessage}</p>
                  </div>
                </div>
              </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              </div>
          )}

          {autosaveSuccess && (
            <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{autosaveSuccess}</p>
                  </div>
                </div>
              </div>
          )}

          <div className="space-y-6">
            {/* Notification Delay Setting */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Email Throttling</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="notification-delay" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notification Delay (minutes)
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Accumulate task changes and send consolidated notifications. Set to 0 for immediate notifications.
                  </p>
                  <select
                    id="notification-delay"
                    value={editingSettings.NOTIFICATION_DELAY || '30'}
                    onChange={(e) => handleNotificationDelayChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="0">Immediate (0 minutes)</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes (recommended)</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                    <option value="240">4 hours</option>
                    <option value="480">8 hours</option>
                    <option value="1440">24 hours</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    When multiple changes occur to the same task within this time period, they will be combined into a single notification email.
                  </p>
                </div>
              </div>
            </div>

            {/* Global Notification Defaults */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Global Notification Defaults</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                These settings control the default notification preferences for all users. Users can override these settings in their profile.
              </p>
              <div className="space-y-4">
                {[
                  { key: 'newTaskAssigned', label: 'New task assigned to me', description: 'Get notified when someone assigns a task to you' },
                  { key: 'myTaskUpdated', label: 'My task is updated', description: 'Get notified when tasks assigned to you are modified' },
                  { key: 'watchedTaskUpdated', label: 'A task I\'m watching is updated', description: 'Get notified when tasks you\'re watching are modified' },
                  { key: 'addedAsCollaborator', label: 'I\'m added as a collaborator on a task', description: 'Get notified when someone adds you as a collaborator' },
                  { key: 'collaboratingTaskUpdated', label: 'A task I\'m collaborating in is updated', description: 'Get notified when tasks you\'re collaborating on are modified' },
                  { key: 'commentAdded', label: 'A comment is added to a task I\'m involved in', description: 'Get notified when comments are added to tasks you\'re assigned, watching, or collaborating on' },
                  { key: 'requesterTaskCreated', label: 'A task is created and I\'m the requester', description: 'Get notified when tasks you requested are created' },
                  { key: 'requesterTaskUpdated', label: 'A task is updated where I\'m the requester', description: 'Get notified when tasks you requested are modified' }
                ].map((notification) => (
                  <div key={notification.key} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full ${
                            notification.key === 'newTaskAssigned' ? 'bg-blue-500' :
                            notification.key === 'myTaskUpdated' ? 'bg-green-500' :
                            notification.key === 'watchedTaskUpdated' ? 'bg-purple-500' :
                            notification.key === 'addedAsCollaborator' ? 'bg-yellow-500' :
                            notification.key === 'collaboratingTaskUpdated' ? 'bg-orange-500' :
                            notification.key === 'commentAdded' ? 'bg-red-500' :
                            notification.key === 'requesterTaskCreated' ? 'bg-indigo-500' :
                            'bg-teal-500'
                          }`}></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{notification.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{notification.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={getNotificationDefault(notification.key)}
                          onChange={(e) => handleNotificationDefaultChange(notification.key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email System Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Email System Status</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${settings.SMTP_HOST ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {settings.SMTP_HOST ? 'Email system is configured and active' : 'Email system is not configured'}
                </span>
              </div>
              {!settings.SMTP_HOST && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Configure SMTP settings in the Mail tab to enable email notifications.
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {hasChanges() && (
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </>
      ) : (
        <AdminFileUploadsTab
          settings={settings}
          editingSettings={editingSettings}
          onSettingsChange={onSettingsChange}
          onSave={onSave}
          onCancel={onCancel}
          successMessage={successMessage}
          error={error}
        />
      )}
    </div>
  );
};

export default AdminAppSettingsTab;
