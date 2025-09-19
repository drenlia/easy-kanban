import React, { useState, useEffect } from 'react';

interface AdminProjectSettingsTabProps {
  editingSettings: { [key: string]: string };
  onSettingsChange: (settings: { [key: string]: string }) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onAutoSave?: (key: string, value: string) => Promise<void>; // For immediate saving of specific settings
  successMessage?: string;
  error?: string;
}

const AdminProjectSettingsTab: React.FC<AdminProjectSettingsTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onAutoSave,
  successMessage,
  error
}) => {
  const [finishedColumnNames, setFinishedColumnNames] = useState<string[]>([]);
  const [newColumnName, setNewColumnName] = useState('');

  // Initialize finished column names from settings
  useEffect(() => {
    try {
      const savedNames = editingSettings.DEFAULT_FINISHED_COLUMN_NAMES 
        ? JSON.parse(editingSettings.DEFAULT_FINISHED_COLUMN_NAMES)
        : ['Done', 'Completed', 'Finished'];
      setFinishedColumnNames(savedNames);
    } catch (error) {
      console.error('Error parsing finished column names:', error);
      setFinishedColumnNames(['Done', 'Completed', 'Finished']);
    }
  }, [editingSettings.DEFAULT_FINISHED_COLUMN_NAMES]);

  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({
      ...editingSettings,
      [key]: value
    });
  };

  const addFinishedColumnName = async () => {
    const trimmedName = newColumnName.trim();
    if (trimmedName && !finishedColumnNames.includes(trimmedName)) {
      const updatedNames = [...finishedColumnNames, trimmedName];
      setFinishedColumnNames(updatedNames);
      setNewColumnName('');
      
      // Update local settings
      onSettingsChange({
        ...editingSettings,
        DEFAULT_FINISHED_COLUMN_NAMES: JSON.stringify(updatedNames)
      });
      
      // Auto-save to database
      if (onAutoSave) {
        await onAutoSave('DEFAULT_FINISHED_COLUMN_NAMES', JSON.stringify(updatedNames));
      }
    }
  };

  const removeFinishedColumnName = async (nameToRemove: string) => {
    const updatedNames = finishedColumnNames.filter(name => name !== nameToRemove);
    setFinishedColumnNames(updatedNames);
    
    // Update local settings
    onSettingsChange({
      ...editingSettings,
      DEFAULT_FINISHED_COLUMN_NAMES: JSON.stringify(updatedNames)
    });
    
    // Auto-save to database
    if (onAutoSave) {
      await onAutoSave('DEFAULT_FINISHED_COLUMN_NAMES', JSON.stringify(updatedNames));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFinishedColumnName();
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Project Settings</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure project and task identifier prefixes and finished column detection.
        </p>
      </div>

      {successMessage && (
        <div className="mb-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
          <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Finished Column Names Management */}
        <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Finished Column Names
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Define column names that should be automatically marked as "finished" (case-insensitive). 
              Tasks in these columns won't be considered overdue regardless of their due date.
            </p>
            
            {/* Add new column name input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter column name (e.g., 'Done')"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={addFinishedColumnName}
                disabled={!newColumnName.trim() || finishedColumnNames.includes(newColumnName.trim())}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            
            {/* Display current finished column names as pills */}
            <div className="flex flex-wrap gap-2">
              {finishedColumnNames.map((name) => (
                <div
                  key={name}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                >
                  <span>{name}</span>
                  <button
                    onClick={() => removeFinishedColumnName(name)}
                    className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Overdue Task Highlighting */}
        <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Highlight Overdue Tasks
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                When enabled, overdue tasks will be highlighted with a light red background in the Kanban view.
              </p>
            </div>
            <div className="flex items-center">
              <button
                onClick={async () => {
                  const newValue = editingSettings.HIGHLIGHT_OVERDUE_TASKS === 'true' ? 'false' : 'true';
                  handleInputChange('HIGHLIGHT_OVERDUE_TASKS', newValue);
                  if (onAutoSave) {
                    await onAutoSave('HIGHLIGHT_OVERDUE_TASKS', newValue);
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  editingSettings.HIGHLIGHT_OVERDUE_TASKS === 'true' ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editingSettings.HIGHLIGHT_OVERDUE_TASKS === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Default Project Prefix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Default Project Prefix
            </label>
            <input
              type="text"
              value={editingSettings.DEFAULT_PROJ_PREFIX || ''}
              onChange={(e) => handleInputChange('DEFAULT_PROJ_PREFIX', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="PROJ-"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Prefix used for new board project identifiers (e.g., "PROJ-" → "PROJ-00001")
            </p>
          </div>

          {/* Default Task Prefix */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Default Task Prefix
            </label>
            <input
              type="text"
              value={editingSettings.DEFAULT_TASK_PREFIX || ''}
              onChange={(e) => handleInputChange('DEFAULT_TASK_PREFIX', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="TASK-"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Prefix used for new task ticket identifiers (e.g., "TASK-" → "TASK-00001")
            </p>
          </div>
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">How it works:</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• New boards automatically get project identifiers: {editingSettings.DEFAULT_PROJ_PREFIX || 'PROJ-'}00001, {editingSettings.DEFAULT_PROJ_PREFIX || 'PROJ-'}00002, etc.</li>
            <li>• New tasks automatically get ticket identifiers: {editingSettings.DEFAULT_TASK_PREFIX || 'TASK-'}00001, {editingSettings.DEFAULT_TASK_PREFIX || 'TASK-'}00002, etc.</li>
            <li>• Numbers are auto-incremented and zero-padded to 5 digits</li>
            <li>• Column names matching the finished list (case-insensitive) will automatically be marked as completed</li>
            <li>• Tasks in finished columns won't be considered overdue regardless of their due date</li>
          </ul>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-end space-x-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default AdminProjectSettingsTab;
