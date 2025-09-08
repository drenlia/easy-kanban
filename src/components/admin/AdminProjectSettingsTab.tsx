import React from 'react';

interface AdminProjectSettingsTabProps {
  editingSettings: { [key: string]: string };
  onSettingsChange: (settings: { [key: string]: string }) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  successMessage?: string;
  error?: string;
}

const AdminProjectSettingsTab: React.FC<AdminProjectSettingsTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  successMessage,
  error
}) => {
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({
      ...editingSettings,
      [key]: value
    });
  };

  const handleCheckboxChange = (key: string, checked: boolean) => {
    onSettingsChange({
      ...editingSettings,
      [key]: checked ? 'true' : 'false'
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Settings</h2>
        <p className="text-gray-600">
          Configure automatic project and task identifier generation with customizable prefixes.
        </p>
      </div>

      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-4">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Enable Project and Task Identification */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Enable Project and Task Identification
              </label>
              <p className="text-sm text-gray-500">
                When enabled, new boards and tasks will automatically receive unique identifiers with the configured prefixes. 
                This setting only controls display visibility - identifiers are always generated internally.
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingSettings.USE_PREFIXES === 'true'}
                  onChange={(e) => handleCheckboxChange('USE_PREFIXES', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Default Project Prefix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Project Prefix
            </label>
            <input
              type="text"
              value={editingSettings.DEFAULT_PROJ_PREFIX || ''}
              onChange={(e) => handleInputChange('DEFAULT_PROJ_PREFIX', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="PROJ-"
            />
            <p className="mt-1 text-sm text-gray-500">
              Prefix used for new board project identifiers (e.g., "PROJ-" → "PROJ-00001")
            </p>
          </div>

          {/* Default Task Prefix */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Task Prefix
            </label>
            <input
              type="text"
              value={editingSettings.DEFAULT_TASK_PREFIX || ''}
              onChange={(e) => handleInputChange('DEFAULT_TASK_PREFIX', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="TASK-"
            />
            <p className="mt-1 text-sm text-gray-500">
              Prefix used for new task ticket identifiers (e.g., "TASK-" → "TASK-00001")
            </p>
          </div>
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• New boards automatically get project identifiers: {editingSettings.DEFAULT_PROJ_PREFIX || 'PROJ-'}00001, {editingSettings.DEFAULT_PROJ_PREFIX || 'PROJ-'}00002, etc.</li>
            <li>• New tasks automatically get ticket identifiers: {editingSettings.DEFAULT_TASK_PREFIX || 'TASK-'}00001, {editingSettings.DEFAULT_TASK_PREFIX || 'TASK-'}00002, etc.</li>
            <li>• Numbers are auto-incremented and zero-padded to 5 digits</li>
            <li>• Identifiers are always generated internally, the "Enable" checkbox only controls UI visibility</li>
            <li>• Future versions will support multiple projects/tasks with different prefixes</li>
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
