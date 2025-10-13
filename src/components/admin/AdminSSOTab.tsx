import React from 'react';

interface Settings {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALLBACK_URL?: string;
  GOOGLE_SSO_DEBUG?: string;
  [key: string]: string | undefined;
}

interface AdminSSOTabProps {
  editingSettings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  onCancel: () => void;
  onReloadOAuth: () => void;
  successMessage: string | null;
  error: string | null;
}

const AdminSSOTab: React.FC<AdminSSOTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onReloadOAuth,
  successMessage,
  error,
}) => {
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Single Sign-On Configuration</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure Google OAuth authentication. Changes are applied immediately without requiring a restart.
        </p>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Google Client ID
          </label>
          <input
            type="text"
            value={editingSettings.GOOGLE_CLIENT_ID || ''}
            onChange={(e) => handleInputChange('GOOGLE_CLIENT_ID', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Enter Google OAuth Client ID"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Found in your Google Cloud Console under APIs & Services &gt; Credentials
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Google Client Secret
          </label>
          <input
            type="password"
            value={editingSettings.GOOGLE_CLIENT_SECRET || ''}
            onChange={(e) => handleInputChange('GOOGLE_CLIENT_SECRET', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Enter Google OAuth Client Secret"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Keep this secret secure. Changes are applied immediately.
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Google Callback URL
          </label>
          <input
            type="text"
            value={editingSettings.GOOGLE_CALLBACK_URL || ''}
            onChange={(e) => handleInputChange('GOOGLE_CALLBACK_URL', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="e.g., https://yourdomain.com/api/auth/google/callback"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This must match exactly what you configure in Google Cloud Console. Include the full URL with protocol. https://yourdomain.com/api/auth/google/callback
          </p>
        </div>
        
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={editingSettings.GOOGLE_SSO_DEBUG === 'true'}
              onChange={(e) => handleInputChange('GOOGLE_SSO_DEBUG', e.target.checked ? 'true' : 'false')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Enable Google SSO Debug Logging</span>
          </label>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            When enabled, detailed Google SSO authentication logs will be displayed in the server console for debugging purposes.
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠️ Note: A service/Docker restart may be required for debug log changes to take effect due to caching.
          </p>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400 dark:text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">Hot Reload Enabled</h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <p>
                  Google OAuth settings are automatically reloaded when you save changes. 
                  No application restart is required for most settings.
                </p>
                <p className="mt-1">
                  <strong>Tip:</strong> Use the "Reload OAuth Config" button if you need to force a reload.
                </p>
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  <strong>Note:</strong> Debug logging changes may require a service restart due to memory caching.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Success and Error Messages for SSO */}
        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400 dark:text-green-500" viewBox="0 0 20 20" fill="currentColor">
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
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex space-x-3">
          <button
            onClick={() => onSave()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Save Configuration
          </button>
          <button
            onClick={onReloadOAuth}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            🔄 Reload OAuth Config
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSSOTab;
