import React, { useState } from 'react';

interface Settings {
  MAIL_ENABLED?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  SMTP_SECURE?: string;
  [key: string]: string | undefined;
}

interface TestEmailResult {
  message: string;
  messageId: string;
  settings: {
    to: string;
    host: string;
    port: string;
    secure: string;
    from: string;
  };
}

interface AdminMailTabProps {
  editingSettings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  onCancel: () => void;
  onTestEmail: () => Promise<void>;
  successMessage: string | null;
  error: string | null;
  isTestingEmail: boolean;
  showTestEmailModal: boolean;
  testEmailResult: TestEmailResult | null;
  onCloseTestModal: () => void;
}

const AdminMailTab: React.FC<AdminMailTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onTestEmail,
  successMessage,
  error,
  isTestingEmail,
  showTestEmailModal,
  testEmailResult,
  onCloseTestModal,
}) => {
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Mail Server Configuration</h2>
          <p className="text-gray-600">
            Configure SMTP settings for sending emails. Changes are applied immediately.
          </p>
        </div>
        
        <div className="max-w-4xl">
          {/* Mail Server Enable/Disable */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={editingSettings.MAIL_ENABLED === 'true'}
                onChange={(e) => handleInputChange('MAIL_ENABLED', e.target.checked ? 'true' : 'false')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">Enable Mail Server</span>
            </label>
            <p className="mt-1 text-sm text-gray-500">
              Check this to enable email functionality. Uncheck to disable all email features.
            </p>
          </div>

          {/* Two-column layout for SMTP settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* SMTP Host */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_HOST || ''}
                  onChange={(e) => handleInputChange('SMTP_HOST', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="smtp.gmail.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Hostname or IP of your SMTP server
                </p>
              </div>

              {/* SMTP Port */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Port
                </label>
                <input
                  type="number"
                  value={editingSettings.SMTP_PORT || ''}
                  onChange={(e) => handleInputChange('SMTP_PORT', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="587"
                />
                <p className="mt-1 text-xs text-gray-500">
                  587 (TLS), 465 (SSL), 25 (plain)
                </p>
              </div>

              {/* SMTP Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Username
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_USERNAME || ''}
                  onChange={(e) => handleInputChange('SMTP_USERNAME', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Usually your email address
                </p>
              </div>

              {/* SMTP Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Password
                </label>
                <input
                  type="password"
                  value={editingSettings.SMTP_PASSWORD || ''}
                  onChange={(e) => handleInputChange('SMTP_PASSWORD', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your SMTP password"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use App Password for Gmail
                </p>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* From Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Email
                </label>
                <input
                  type="email"
                  value={editingSettings.SMTP_FROM_EMAIL || ''}
                  onChange={(e) => handleInputChange('SMTP_FROM_EMAIL', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Email address that appears as sender
                </p>
              </div>

              {/* From Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Name
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_FROM_NAME || ''}
                  onChange={(e) => handleInputChange('SMTP_FROM_NAME', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Kanban Admin"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Display name that appears as sender
                </p>
              </div>

              {/* SMTP Security */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP Security
                </label>
                <select
                  value={editingSettings.SMTP_SECURE || 'tls'}
                  onChange={(e) => handleInputChange('SMTP_SECURE', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="tls">TLS (Recommended)</option>
                  <option value="ssl">SSL</option>
                  <option value="none">None (Plain)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  TLS recommended for modern servers
                </p>
              </div>
            </div>
          </div>

          {/* Test Configuration Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Test Configuration</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Use the test button below to verify your mail server configuration works correctly.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Success and Error Messages for Mail Server */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
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
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
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
          
          <div className="flex space-x-3">
            <button
              onClick={onSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Save Configuration
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              onClick={onTestEmail}
              disabled={isTestingEmail}
              className={`px-4 py-2 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isTestingEmail 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              }`}
            >
              {isTestingEmail ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Testing...
                </>
              ) : (
                'Test Email'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Test Email Success Modal */}
      {showTestEmailModal && testEmailResult && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                ✅ Email Sent Successfully!
              </h3>
              <div className="mt-4 px-2 py-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Message:</strong> {testEmailResult.message}</p>
                  <p><strong>To:</strong> {testEmailResult.settings.to}</p>
                  <p><strong>Message ID:</strong> {testEmailResult.messageId}</p>
                  <div className="border-t pt-2 mt-2">
                    <p className="font-medium text-gray-700 mb-1">Configuration Used:</p>
                    <p><strong>Host:</strong> {testEmailResult.settings.host}</p>
                    <p><strong>Port:</strong> {testEmailResult.settings.port}</p>
                    <p><strong>Secure:</strong> {testEmailResult.settings.secure}</p>
                    <p><strong>From:</strong> {testEmailResult.settings.from}</p>
                  </div>
                </div>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={onCloseTestModal}
                  className="px-4 py-2 bg-blue-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminMailTab;
