import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('admin');
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
        showAutosaveSuccess(t('appSettings.emailThrottlingDelaySaved'));
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
        showAutosaveSuccess(t('appSettings.notificationDefaultsSaved'));
      } catch (error) {
        console.error('Failed to save notification defaults:', error);
      }
    }, 100);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('appSettings.title')}</h2>
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
            {t('appSettings.userInterface')}
          </button>
          <button
            onClick={() => handleSubTabChange('uploads')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'uploads'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.fileUploads')}
          </button>
          <button
            onClick={() => handleSubTabChange('notifications')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'notifications'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.notifications')}
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('appSettings.userInterfaceSettings')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('appSettings.userInterfaceSettingsDescription')}
              </p>
                </div>

            <div className="px-6 py-4 space-y-6">
              {/* Task Delete Confirmation Setting */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.taskDeleteConfirmation')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.taskDeleteConfirmationDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.TASK_DELETE_CONFIRM || 'true'}
                    onChange={(e) => handleTaskDeleteConfirmChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">{t('appSettings.enabled')}</option>
                    <option value="false">{t('appSettings.disabled')}</option>
                  </select>
                  </div>
                  </div>
                </div>

            {/* New User Defaults Section */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.newUserDefaults')}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('appSettings.newUserDefaultsDescription')}
              </p>
              
              <div className="space-y-6">
                {/* Default View Mode */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      {t('appSettings.defaultViewMode')}
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('appSettings.defaultViewModeDescription')}
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
                  {t('appSettings.defaultTaskViewMode')}
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('appSettings.defaultTaskViewModeDescription')}
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={editingSettings.DEFAULT_TASK_VIEW_MODE || 'expand'}
                      onChange={(e) => handleDefaultTaskViewModeChange(e.target.value)}
                      className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="expand">{t('appSettings.expanded')}</option>
                      <option value="collapse">{t('appSettings.collapsed')}</option>
                    </select>
                  </div>
                </div>

            {/* Activity Feed Defaults */}
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <h5 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">{t('appSettings.activityFeedDefaults')}</h5>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                {t('appSettings.activityFeedDefaultsDescription')}
              </p>
              
              {/* Activity Feed Visibility */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultVisibility')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultVisibilityDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.SHOW_ACTIVITY_FEED || 'true'}
                    onChange={(e) => handleShowActivityFeedChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">{t('appSettings.enabled')}</option>
                    <option value="false">{t('appSettings.disabled')}</option>
                  </select>
                  </div>
                  </div>
              
              {/* Activity Feed Position */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultPosition')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultPositionDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="text"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_POSITION || '{"x": 10, "y": 66}'}
                    onChange={(e) => handleDefaultActivityFeedPositionChange(e.target.value)}
                    className="block w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder='{"x": 10, "y": 66}'
                  />
                  </div>
                  </div>

              {/* Activity Feed Width */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultWidth')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultWidthDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="number"
                    min="180"
                    max="400"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_WIDTH || '180'}
                    onChange={(e) => handleDefaultActivityFeedWidthChange(e.target.value)}
                    className="block w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  </div>
                  </div>

              {/* Activity Feed Height */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultHeight')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultHeightDescription')}
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
                  {t('appSettings.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                  {isSaving ? t('appSettings.saving') : t('appSettings.saveChanges')}
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.emailThrottling')}</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="notification-delay" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('appSettings.notificationDelay')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {t('appSettings.notificationDelayDescription')}
                  </p>
                  <select
                    id="notification-delay"
                    value={editingSettings.NOTIFICATION_DELAY || '30'}
                    onChange={(e) => handleNotificationDelayChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="0">{t('appSettings.immediate')}</option>
                    <option value="15">{t('appSettings.minutes15')}</option>
                    <option value="30">{t('appSettings.minutes30')}</option>
                    <option value="60">{t('appSettings.hour1')}</option>
                    <option value="120">{t('appSettings.hours2')}</option>
                    <option value="240">{t('appSettings.hours4')}</option>
                    <option value="480">{t('appSettings.hours8')}</option>
                    <option value="1440">{t('appSettings.hours24')}</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('appSettings.notificationDelayHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Global Notification Defaults */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.globalNotificationDefaults')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('appSettings.globalNotificationDefaultsDescription')}
              </p>
              <div className="space-y-4">
                {[
                  { key: 'newTaskAssigned', label: t('appSettings.notificationTypes.newTaskAssigned'), description: t('appSettings.notificationTypes.newTaskAssignedDescription') },
                  { key: 'myTaskUpdated', label: t('appSettings.notificationTypes.myTaskUpdated'), description: t('appSettings.notificationTypes.myTaskUpdatedDescription') },
                  { key: 'watchedTaskUpdated', label: t('appSettings.notificationTypes.watchedTaskUpdated'), description: t('appSettings.notificationTypes.watchedTaskUpdatedDescription') },
                  { key: 'addedAsCollaborator', label: t('appSettings.notificationTypes.addedAsCollaborator'), description: t('appSettings.notificationTypes.addedAsCollaboratorDescription') },
                  { key: 'collaboratingTaskUpdated', label: t('appSettings.notificationTypes.collaboratingTaskUpdated'), description: t('appSettings.notificationTypes.collaboratingTaskUpdatedDescription') },
                  { key: 'commentAdded', label: t('appSettings.notificationTypes.commentAdded'), description: t('appSettings.notificationTypes.commentAddedDescription') },
                  { key: 'requesterTaskCreated', label: t('appSettings.notificationTypes.requesterTaskCreated'), description: t('appSettings.notificationTypes.requesterTaskCreatedDescription') },
                  { key: 'requesterTaskUpdated', label: t('appSettings.notificationTypes.requesterTaskUpdated'), description: t('appSettings.notificationTypes.requesterTaskUpdatedDescription') }
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.emailSystemStatus')}</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${settings.SMTP_HOST ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {settings.SMTP_HOST ? t('appSettings.emailSystemConfigured') : t('appSettings.emailSystemNotConfigured')}
                </span>
              </div>
              {!settings.SMTP_HOST && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('appSettings.emailSystemNotConfiguredHint')}
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
