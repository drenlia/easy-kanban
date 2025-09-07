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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">App Settings</h2>
        <p className="text-gray-600">
          Configure application-wide behavior settings. These settings apply as defaults for all users, but users can override them in their personal preferences.
        </p>
      </div>

      {/* Success and Error Messages */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
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
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">User Interface Settings</h3>
          <p className="mt-1 text-sm text-gray-500">
            Configure default behavior for user interactions
          </p>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Task Delete Confirmation Setting */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Task Delete Confirmation
              </label>
              <p className="text-sm text-gray-500">
                Require confirmation before deleting tasks. Users can override this in their personal preferences.
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <select
                value={editingSettings.TASK_DELETE_CONFIRM || 'true'}
                onChange={(e) => handleTaskDeleteConfirmChange(e.target.value)}
                className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Activity Feed Default Setting */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Activity Feed Default
              </label>
              <p className="text-sm text-gray-500">
                Default visibility setting for the activity feed. Users can override this in their personal preferences.
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <select
                value={editingSettings.SHOW_ACTIVITY_FEED || 'true'}
                onChange={(e) => handleShowActivityFeedChange(e.target.value)}
                className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {hasChanges() && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
