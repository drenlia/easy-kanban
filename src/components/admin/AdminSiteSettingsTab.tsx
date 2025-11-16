import React from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api';

interface Settings {
  SITE_NAME?: string;
  SITE_URL?: string;
  WEBSITE_URL?: string;
  SITE_OPENS_NEW_TAB?: string;
  [key: string]: string | undefined;
}

interface AdminSiteSettingsTabProps {
  editingSettings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  onCancel: () => void;
  onAutoSave?: (key: string, value: string) => Promise<void>;
}

const AdminSiteSettingsTab: React.FC<AdminSiteSettingsTabProps> = ({
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onAutoSave,
}) => {
  const { t } = useTranslation('admin');
  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('siteSettings.title')}</h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t('siteSettings.description')}
        </p>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('siteSettings.siteName')}
          </label>
          <input
            type="text"
            value={editingSettings.SITE_NAME || ''}
            onChange={(e) => handleInputChange('SITE_NAME', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={t('siteSettings.enterSiteName')}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('siteSettings.siteUrl')}
          </label>
          <input
            type="url"
            value={editingSettings.SITE_URL || ''}
            onChange={(e) => handleInputChange('SITE_URL', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="https://example.com"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('siteSettings.websiteUrl')}
          </label>
          <input
            type="url"
            value={editingSettings.WEBSITE_URL || ''}
            readOnly
            disabled
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            placeholder="https://customer-portal.example.com"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('siteSettings.websiteUrlDescription')}
          </p>
        </div>
        
        {/* Open Links in New Tab Toggle */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('siteSettings.opensNewTab')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('siteSettings.opensNewTabDescription')}
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium mr-3 text-gray-700 dark:text-gray-300">
                {(editingSettings.SITE_OPENS_NEW_TAB === 'true' || editingSettings.SITE_OPENS_NEW_TAB === undefined) ? t('siteSettings.enabled') : t('siteSettings.disabled')}
              </span>
              <button
                type="button"
                onClick={async () => {
                  // Default to 'true' if setting doesn't exist (matches current behavior)
                  const currentValue = editingSettings.SITE_OPENS_NEW_TAB === undefined ? 'true' : editingSettings.SITE_OPENS_NEW_TAB;
                  const newValue = currentValue === 'true' ? 'false' : 'true';
                  
                  // Update the state first
                  handleInputChange('SITE_OPENS_NEW_TAB', newValue);
                  
                  // Auto-save the toggle change immediately
                  try {
                    if (onAutoSave) {
                      await onAutoSave('SITE_OPENS_NEW_TAB', newValue);
                    } else {
                      // Fallback: save directly via API
                      await api.put('/admin/settings', { key: 'SITE_OPENS_NEW_TAB', value: newValue });
                    }
                  } catch (error) {
                    console.error('Failed to save opens new tab toggle:', error);
                    // Revert the change if save failed
                    const currentValue = editingSettings.SITE_OPENS_NEW_TAB === undefined ? 'true' : editingSettings.SITE_OPENS_NEW_TAB;
                    handleInputChange('SITE_OPENS_NEW_TAB', currentValue);
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  (editingSettings.SITE_OPENS_NEW_TAB === 'true' || editingSettings.SITE_OPENS_NEW_TAB === undefined)
                    ? 'bg-blue-600 dark:bg-blue-500 cursor-pointer' 
                    : 'bg-gray-200 dark:bg-gray-600 cursor-pointer'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                    (editingSettings.SITE_OPENS_NEW_TAB === 'true' || editingSettings.SITE_OPENS_NEW_TAB === undefined) ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => onSave()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('siteSettings.saveChanges')}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {t('siteSettings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSiteSettingsTab;
