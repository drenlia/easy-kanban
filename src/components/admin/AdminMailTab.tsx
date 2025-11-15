import React from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { toast } from '../../utils/toast';

interface Settings {
  MAIL_ENABLED?: string;
  MAIL_MANAGED?: string;
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
  onMailServerDisabled: () => void;
  isTestingEmail: boolean;
  showTestEmailModal: boolean;
  testEmailResult: TestEmailResult | null;
  onCloseTestModal: () => void;
  showTestEmailErrorModal: boolean;
  testEmailError: string;
  onCloseTestErrorModal: () => void;
  onAutoSave?: (key: string, value: string) => Promise<void>;
  onSettingsReload?: () => Promise<void>;
}

const AdminMailTab: React.FC<AdminMailTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onTestEmail,
  onMailServerDisabled,
  isTestingEmail,
  showTestEmailModal,
  testEmailResult,
  onCloseTestModal,
  showTestEmailErrorModal,
  testEmailError,
  onCloseTestErrorModal,
  onAutoSave,
  onSettingsReload,
}) => {
  const { t } = useTranslation('admin');
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };
  
  // Check if all required fields for testing are filled
  const canTestEmail = () => {
    return editingSettings.SMTP_HOST && 
           editingSettings.SMTP_PORT && 
           editingSettings.SMTP_USERNAME && 
           editingSettings.SMTP_PASSWORD && 
           editingSettings.SMTP_FROM_EMAIL;
  };

  // Check if running in demo mode
  const isDemoMode = process.env.DEMO_ENABLED === 'true';
  
  // Check if email is managed
  const isManagedEmail = editingSettings.MAIL_MANAGED === 'true';

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('mail.title')}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('mail.description')}
          </p>
          
          {/* Demo Mode Warning */}
          {isDemoMode && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 rounded-lg">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-amber-400 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('mail.demoModeActive')}</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {t('mail.demoModeDescription')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Managed Email Status */}
          {editingSettings.MAIL_MANAGED === 'true' && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-blue-400 dark:text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('mail.managedEmailService')}</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    {t('mail.managedEmailDescription')} <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">noreply@ezkan.cloud</code>.
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(t('mail.switchToCustomSMTPConfirm'))) {
                          try {
                            // Clear all mail-related settings in the database with a single API call
                            await api.post('/admin/settings/clear-mail');
                            
                            // Reload settings from server to get the cleared values
                            if (onSettingsReload) {
                              await onSettingsReload();
                            }
                            
                            // Update local state to clear all mail-related fields
                            const updatedSettings = {
                              ...editingSettings,
                              MAIL_MANAGED: 'false',
                              SMTP_HOST: '',
                              SMTP_PORT: '',
                              SMTP_USERNAME: '',
                              SMTP_PASSWORD: '',
                              SMTP_FROM_EMAIL: '',
                              SMTP_FROM_NAME: '',
                              MAIL_ENABLED: 'false',
                            };
                            onSettingsChange(updatedSettings);
                            
                            // Show success message
                            toast.success(t('mail.switchedToCustomSMTP') || 'Switched to custom SMTP settings', '');
                          } catch (error) {
                            console.error('Failed to switch to custom SMTP:', error);
                            toast.error(t('mail.failedToSwitchToCustomSMTP') || 'Failed to switch to custom SMTP settings', '');
                          }
                        }
                      }}
                      className="text-sm bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-md hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                    >
                      {t('mail.switchToCustomSMTP')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="max-w-4xl">
          {/* Mail Server Enable/Disable Toggle */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('mail.mailServerStatus')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isDemoMode 
                    ? t('mail.statusDemoMode')
                    : !testEmailResult 
                      ? t('mail.statusTestRequired')
                      : t('mail.statusTestedSuccessfully')
                  }
                </p>
              </div>
              
              {/* Toggle Button */}
              <div className="flex items-center">
                <span className={`text-sm font-medium mr-3 ${
                  isDemoMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {isDemoMode ? t('mail.disabledDemo') : editingSettings.MAIL_ENABLED === 'true' ? t('mail.enabled') : t('mail.disabled')}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!isDemoMode && testEmailResult) {
                      const newValue = editingSettings.MAIL_ENABLED === 'true' ? 'false' : 'true';
                      
                      // Update the state first
                      handleInputChange('MAIL_ENABLED', newValue);
                      
                      // Auto-save the toggle change immediately
                      try {
                        // Save the specific setting directly
                        await api.put('/admin/settings', { key: 'MAIL_ENABLED', value: newValue });
                        
                        // If disabling, clear test result to require re-testing
                        if (newValue === 'false' && testEmailResult) {
                          onMailServerDisabled();
                        }
                      } catch (error) {
                        console.error('Failed to save mail server toggle:', error);
                        // Revert the change if save failed
                        handleInputChange('MAIL_ENABLED', editingSettings.MAIL_ENABLED === 'true' ? 'false' : 'true');
                      }
                    }
                  }}
                  disabled={isDemoMode || !testEmailResult}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    isDemoMode || !testEmailResult
                      ? 'bg-gray-200 dark:bg-gray-600 cursor-not-allowed' 
                      : editingSettings.MAIL_ENABLED === 'true' 
                        ? 'bg-blue-600 dark:bg-blue-500 cursor-pointer' 
                        : 'bg-gray-200 dark:bg-gray-600 cursor-pointer'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                      editingSettings.MAIL_ENABLED === 'true' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Two-column layout for SMTP settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* SMTP Host */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.smtpHost')}
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_HOST || ''}
                  onChange={(e) => handleInputChange('SMTP_HOST', e.target.value)}
                  onFocus={() => {
                    // Pre-fill with example value if field is empty
                    if (!editingSettings.SMTP_HOST) {
                      handleInputChange('SMTP_HOST', 'smtp.gmail.com');
                    }
                  }}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder="smtp.gmail.com"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.smtpHostDescription')} <span className="text-blue-600">{t('mail.autoFillHint')}</span>
                </p>
              </div>

              {/* SMTP Port */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.smtpPort')}
                </label>
                <input
                  type="number"
                  value={editingSettings.SMTP_PORT || ''}
                  onChange={(e) => handleInputChange('SMTP_PORT', e.target.value)}
                  onFocus={() => {
                    // Pre-fill with example value if field is empty
                    if (!editingSettings.SMTP_PORT) {
                      handleInputChange('SMTP_PORT', '587');
                    }
                  }}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder="587"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.smtpPortDescription')} <span className="text-blue-600">{t('mail.autoFillPortHint')}</span>
                </p>
              </div>

              {/* SMTP Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.smtpUsername')}
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_USERNAME || ''}
                  onChange={(e) => handleInputChange('SMTP_USERNAME', e.target.value)}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder="admin@example.com"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.smtpUsernameDescription')}
                </p>
              </div>

              {/* SMTP Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.smtpPassword')}
                </label>
                <input
                  type="password"
                  value={editingSettings.SMTP_PASSWORD || ''}
                  onChange={(e) => handleInputChange('SMTP_PASSWORD', e.target.value)}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder={t('mail.enterSmtpPassword')}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.smtpPasswordDescription')}
                </p>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* From Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.fromEmail')}
                </label>
                <input
                  type="email"
                  value={editingSettings.SMTP_FROM_EMAIL || ''}
                  onChange={(e) => handleInputChange('SMTP_FROM_EMAIL', e.target.value)}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder="admin@example.com"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.fromEmailDescription')}
                </p>
              </div>

              {/* From Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.fromName')}
                </label>
                <input
                  type="text"
                  value={editingSettings.SMTP_FROM_NAME || ''}
                  onChange={(e) => handleInputChange('SMTP_FROM_NAME', e.target.value)}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                  placeholder={t('mail.fromNamePlaceholder')}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.fromNameDescription')}
                </p>
              </div>

              {/* SMTP Security */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('mail.smtpSecurity')}
                </label>
                <select
                  value={editingSettings.SMTP_SECURE || 'tls'}
                  onChange={(e) => handleInputChange('SMTP_SECURE', e.target.value)}
                  disabled={isManagedEmail}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 ${
                    isManagedEmail 
                      ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                      : 'bg-white dark:bg-gray-700'
                  }`}
                >
                  <option value="tls">{t('mail.tlsRecommended')}</option>
                  <option value="ssl">{t('mail.ssl')}</option>
                  <option value="none">{t('mail.nonePlain')}</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('mail.smtpSecurityDescription')}
                </p>
              </div>
            </div>
          </div>

          {/* Test Configuration Info */}
          <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400 dark:text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('mail.testConfiguration')}</h3>
                <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                  <p>
                    {t('mail.testConfigurationDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Success and Error Messages for Mail Server */}
          {/* Test Required Notice */}
          {!isDemoMode && !testEmailResult && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400 dark:text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('mail.testingRequired')}</h3>
                  <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    <p>{t('mail.testingRequiredDescription')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={() => onSave()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('mail.saveConfiguration')}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              {t('mail.cancel')}
            </button>
            <button
              onClick={isDemoMode || isManagedEmail ? undefined : onTestEmail}
              disabled={isTestingEmail || isDemoMode || isManagedEmail || !canTestEmail()}
              className={`px-4 py-2 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isTestingEmail || isDemoMode || isManagedEmail || !canTestEmail()
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              }`}
              title={isDemoMode ? t('mail.testDisabledDemo') : isManagedEmail ? t('mail.testNotNeededManaged') : !canTestEmail() ? t('mail.fillRequiredFields') : undefined}
            >
              {isTestingEmail ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('mail.testing')}
                </>
              ) : isDemoMode ? (
                t('mail.testEmailDisabledDemo')
              ) : isManagedEmail ? (
                t('mail.testEmailNotNeededManaged')
              ) : (
                t('mail.testEmail')
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Test Email Success Modal */}
      {showTestEmailModal && testEmailResult && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mt-4">
                {t('mail.emailSentSuccessfully')}
              </h3>
              <div className="mt-4 px-2 py-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>{t('mail.message')}:</strong> {testEmailResult.message}</p>
                  <p><strong>{t('mail.to')}:</strong> {testEmailResult.settings.to}</p>
                  <p><strong>{t('mail.messageId')}:</strong> {testEmailResult.messageId}</p>
                  <div className="border-t pt-2 mt-2">
                    <p className="font-medium text-gray-700 mb-1">{t('mail.configurationUsed')}:</p>
                    <p><strong>{t('mail.host')}:</strong> {testEmailResult.settings.host}</p>
                    <p><strong>{t('mail.port')}:</strong> {testEmailResult.settings.port}</p>
                    <p><strong>{t('mail.secure')}:</strong> {testEmailResult.settings.secure}</p>
                    <p><strong>{t('mail.from')}:</strong> {testEmailResult.settings.from}</p>
                  </div>
                </div>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={onCloseTestModal}
                  className="px-4 py-2 bg-blue-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {t('mail.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Email Error Modal */}
      {showTestEmailErrorModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mt-4">
                {t('mail.emailTestFailed')}
              </h3>
              <div className="mt-4 px-2 py-3 bg-red-50 rounded-lg">
                <div className="text-sm text-red-700">
                  <p className="font-medium mb-2">{t('mail.backendResponseDetails')}:</p>
                  <pre className="bg-red-100 p-2 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                    {testEmailError}
                  </pre>
                  <div className="mt-3 text-xs text-red-600">
                    <p>{t('mail.commonTroubleshootingSteps')}:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>{t('mail.checkEndpoint')}</li>
                      <li>{t('mail.verifySmtpSettings')}</li>
                      <li>{t('mail.checkCredentials')}</li>
                      <li>{t('mail.verifyPortSecurity')}</li>
                      <li>{t('mail.testNetworkConnectivity')}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={onCloseTestErrorModal}
                  className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  {t('mail.close')}
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
