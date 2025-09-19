import React, { useState } from 'react';

interface AdminAppSettingsTabProps {
  settings: { [key: string]: string | undefined };
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onSave: () => Promise<void>;
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">App Settings</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure application-wide behavior settings. These settings apply as defaults for all users, but users can override them in their personal preferences.
        </p>
      </div>

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

      {/* Settings Form */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">User Interface Settings</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure default behavior for user interactions
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
    </div>
  );
};

export default AdminAppSettingsTab;
