import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isMaskedApiKeyDisplay } from '../../utils/maskSecret';
import { adminSettingsHaveChanges } from '../../utils/adminSettingsDirty';
import { AdminUnsavedHint } from './AdminUnsavedChanges';

interface Settings {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_SECRET_SET?: string;
  GOOGLE_CALLBACK_URL?: string;
  [key: string]: string | undefined;
}

interface AdminSSOTabProps {
  settings: Settings;
  editingSettings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  onCancel: () => void;
  onReloadOAuth: () => void;
}

const AdminSSOTab: React.FC<AdminSSOTabProps> = ({
  settings,
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onReloadOAuth,
}) => {
  const { t } = useTranslation('admin');
  const hasChanges = useMemo(
    () => adminSettingsHaveChanges(settings, editingSettings),
    [settings, editingSettings]
  );
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };

  const clientSecretSet =
    editingSettings.GOOGLE_CLIENT_SECRET_SET === 'true' ||
    Boolean(
      editingSettings.GOOGLE_CLIENT_SECRET &&
        isMaskedApiKeyDisplay(editingSettings.GOOGLE_CLIENT_SECRET)
    );
  const clientSecretDraft = editingSettings.GOOGLE_CLIENT_SECRET || '';

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('sso.title')}</h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t('sso.description')}
        </p>
      </div>
      
      <div className="space-y-6">
        <div data-setting-key="GOOGLE_CLIENT_ID">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('sso.googleClientId')}
          </label>
          <input
            type="text"
            value={editingSettings.GOOGLE_CLIENT_ID || ''}
            onChange={(e) => handleInputChange('GOOGLE_CLIENT_ID', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={t('sso.enterGoogleClientId')}
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('sso.googleClientIdDescription')}
          </p>
        </div>
        
        <div data-setting-key="GOOGLE_CLIENT_SECRET">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('sso.googleClientSecret')}
            {clientSecretSet && (
              <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                {t('sso.googleClientSecretSet')}
              </span>
            )}
          </label>
          <input
            type="password"
            value={clientSecretDraft}
            onChange={(e) => handleInputChange('GOOGLE_CLIENT_SECRET', e.target.value)}
            onFocus={() => {
              if (isMaskedApiKeyDisplay(clientSecretDraft)) {
                handleInputChange('GOOGLE_CLIENT_SECRET', '');
              }
            }}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={
              clientSecretSet
                ? t('sso.googleClientSecretLeaveBlank')
                : t('sso.enterGoogleClientSecret')
            }
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('sso.googleClientSecretDescription')}
          </p>
        </div>
        
        <div data-setting-key="GOOGLE_CALLBACK_URL">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('sso.googleCallbackUrl')}
          </label>
          <input
            type="text"
            value={editingSettings.GOOGLE_CALLBACK_URL || ''}
            onChange={(e) => handleInputChange('GOOGLE_CALLBACK_URL', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={t('sso.googleCallbackUrlPlaceholder')}
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('sso.googleCallbackUrlDescription')}
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
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('sso.hotReloadEnabled')}</h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <p>
                  {t('sso.hotReloadDescription')}
                </p>
                <p className="mt-1">
                  <strong>{t('sso.tip')}:</strong> {t('sso.reloadOAuthConfigTip')}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AdminUnsavedHint show={hasChanges} />
          <div className="flex flex-wrap space-x-3 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={!hasChanges}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('sso.cancel')}
            </button>
            <button
              type="button"
              onClick={onReloadOAuth}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              {t('sso.reloadOAuthConfig')}
            </button>
            <button
              type="button"
              onClick={() => onSave()}
              disabled={!hasChanges}
              className={`px-4 py-2 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                hasChanges
                  ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-amber-400 ring-offset-2'
                  : 'bg-blue-600'
              }`}
            >
              {t('sso.saveConfiguration')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSSOTab;
