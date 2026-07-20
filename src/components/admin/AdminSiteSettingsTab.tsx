import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X } from 'lucide-react';
import api from '../../api';
import { getAuthenticatedAvatarUrl } from '../../utils/authImageUrl';
import { useSettings } from '../../contexts/SettingsContext';

interface Settings {
  SITE_NAME?: string;
  SITE_URL?: string;
  WEBSITE_URL?: string;
  SITE_OPENS_NEW_TAB?: string;
  SITE_LOGO?: string;
  SITE_LOGO_DARK?: string;
  HIDE_GITHUB_LINK?: string;
  HIDE_SITE_LOGO?: string;
  FE_PERF_TESTS?: string;
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
  const { updateSiteSetting } = useSettings();
  const lightFileRef = useRef<HTMLInputElement>(null);
  const darkFileRef = useRef<HTMLInputElement>(null);
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const DEFAULT_SITE_LOGO = '/kanban.ico';

  const handleInputChange = (key: string, value: string) => {
    onSettingsChange({ ...editingSettings, [key]: value });
  };

  const resolvePreviewSrc = (value: string | undefined, variant: 'light' | 'dark') => {
    const trimmed = value?.trim() || '';
    if (trimmed) {
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/kanban') ||
        trimmed.startsWith('/assets/')
      ) {
        return trimmed;
      }
      return getAuthenticatedAvatarUrl(trimmed) || trimmed;
    }
    // Match header fallback: dark → light custom → default ico
    if (variant === 'dark') {
      const light = editingSettings.SITE_LOGO?.trim() || '';
      if (light) {
        if (
          light.startsWith('http://') ||
          light.startsWith('https://') ||
          light.startsWith('/kanban') ||
          light.startsWith('/assets/')
        ) {
          return light;
        }
        return getAuthenticatedAvatarUrl(light) || light;
      }
    }
    return DEFAULT_SITE_LOGO;
  };

  const uploadLogo = async (file: File, variant: 'light' | 'dark') => {
    const setUploading = variant === 'dark' ? setUploadingDark : setUploadingLight;
    const settingKey = variant === 'dark' ? 'SITE_LOGO_DARK' : 'SITE_LOGO';
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await api.post(`/admin/settings/logo?variant=${variant}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const path = response.data?.value || '';
      handleInputChange(settingKey, path);
      updateSiteSetting(settingKey, path);
    } catch (error) {
      console.error(`Failed to upload ${variant} logo:`, error);
      alert(t('siteSettings.logoUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const clearLogo = async (settingKey: 'SITE_LOGO' | 'SITE_LOGO_DARK') => {
    handleInputChange(settingKey, '');
    updateSiteSetting(settingKey, '');
    try {
      if (onAutoSave) {
        await onAutoSave(settingKey, '');
      } else {
        await api.put('/admin/settings', { key: settingKey, value: '' });
      }
    } catch (error) {
      console.error('Failed to clear logo:', error);
    }
  };

  const renderLogoField = (
    settingKey: 'SITE_LOGO' | 'SITE_LOGO_DARK',
    label: string,
    description: string,
    fileRef: React.RefObject<HTMLInputElement | null>,
    uploading: boolean,
    variant: 'light' | 'dark'
  ) => {
    const value = editingSettings[settingKey] || '';
    const src = resolvePreviewSrc(value, variant);
    const isDefaultPreview = !value.trim() && (variant === 'light' || !(editingSettings.SITE_LOGO || '').trim());

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{description}</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
          <div className="flex-1 space-y-2">
            <input
              type="url"
              value={value}
              onChange={(e) => handleInputChange(settingKey, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder={t('siteSettings.logoUrlPlaceholder')}
            />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file, variant);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <Upload size={14} />
                {uploading ? t('siteSettings.uploading') : t('siteSettings.uploadLogo')}
              </button>
              {value.trim() && (
                <button
                  type="button"
                  onClick={() => clearLogo(settingKey)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <X size={14} />
                  {t('siteSettings.clearLogo')}
                </button>
              )}
            </div>
          </div>
          <div className="w-28 h-14 flex flex-col items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 overflow-hidden px-1">
            {src ? (
              <>
                <img src={src} alt="" className="max-h-10 max-w-full object-contain" />
                {isDefaultPreview && (
                  <span className="text-[10px] text-gray-400 mt-0.5">{t('siteSettings.defaultLogoPreview')}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400 px-2 text-center">{t('siteSettings.noLogoPreview')}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const hideGithub = editingSettings.HIDE_GITHUB_LINK === 'true';
  const perfTestsEnabled = editingSettings.FE_PERF_TESTS === 'true';
  const hideSiteLogo = editingSettings.HIDE_SITE_LOGO === 'true';

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
            value={editingSettings.SITE_NAME ?? ''}
            onChange={(e) => handleInputChange('SITE_NAME', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder={t('siteSettings.enterSiteName')}
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('siteSettings.siteNameEmptyHint')}
          </p>
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

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
            {t('siteSettings.brandingSection')}
          </h3>

          {renderLogoField(
            'SITE_LOGO',
            t('siteSettings.siteLogo'),
            t('siteSettings.siteLogoDescription'),
            lightFileRef,
            uploadingLight,
            'light'
          )}

          {renderLogoField(
            'SITE_LOGO_DARK',
            t('siteSettings.siteLogoDark'),
            t('siteSettings.siteLogoDarkDescription'),
            darkFileRef,
            uploadingDark,
            'dark'
          )}

          {/* Hide site logo */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('siteSettings.hideSiteLogo')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('siteSettings.hideSiteLogoDescription')}
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium mr-3 text-gray-700 dark:text-gray-300">
                {hideSiteLogo ? t('siteSettings.enabled') : t('siteSettings.disabled')}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const newValue = hideSiteLogo ? 'false' : 'true';
                  handleInputChange('HIDE_SITE_LOGO', newValue);
                  updateSiteSetting('HIDE_SITE_LOGO', newValue);
                  try {
                    if (onAutoSave) {
                      await onAutoSave('HIDE_SITE_LOGO', newValue);
                    } else {
                      await api.put('/admin/settings', { key: 'HIDE_SITE_LOGO', value: newValue });
                    }
                  } catch (error) {
                    console.error('Failed to save hide site logo toggle:', error);
                    handleInputChange('HIDE_SITE_LOGO', hideSiteLogo ? 'true' : 'false');
                    updateSiteSetting('HIDE_SITE_LOGO', hideSiteLogo ? 'true' : 'false');
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer ${
                  hideSiteLogo ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                    hideSiteLogo ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
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
                  const currentValue = editingSettings.SITE_OPENS_NEW_TAB === undefined ? 'true' : editingSettings.SITE_OPENS_NEW_TAB;
                  const newValue = currentValue === 'true' ? 'false' : 'true';
                  handleInputChange('SITE_OPENS_NEW_TAB', newValue);
                  try {
                    if (onAutoSave) {
                      await onAutoSave('SITE_OPENS_NEW_TAB', newValue);
                    } else {
                      await api.put('/admin/settings', { key: 'SITE_OPENS_NEW_TAB', value: newValue });
                    }
                  } catch (error) {
                    console.error('Failed to save opens new tab toggle:', error);
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

        {/* Hide GitHub link */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('siteSettings.hideGithubLink')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('siteSettings.hideGithubLinkDescription')}
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium mr-3 text-gray-700 dark:text-gray-300">
                {hideGithub ? t('siteSettings.enabled') : t('siteSettings.disabled')}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const newValue = hideGithub ? 'false' : 'true';
                  handleInputChange('HIDE_GITHUB_LINK', newValue);
                  try {
                    if (onAutoSave) {
                      await onAutoSave('HIDE_GITHUB_LINK', newValue);
                    } else {
                      await api.put('/admin/settings', { key: 'HIDE_GITHUB_LINK', value: newValue });
                    }
                  } catch (error) {
                    console.error('Failed to save hide GitHub toggle:', error);
                    handleInputChange('HIDE_GITHUB_LINK', hideGithub ? 'true' : 'false');
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer ${
                  hideGithub ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                    hideGithub ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Performance Test Overlay */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('siteSettings.perfTests')}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('siteSettings.perfTestsDescription')}
              </p>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium mr-3 text-gray-700 dark:text-gray-300">
                {perfTestsEnabled ? t('siteSettings.enabled') : t('siteSettings.disabled')}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const newValue = perfTestsEnabled ? 'false' : 'true';
                  handleInputChange('FE_PERF_TESTS', newValue);
                  try {
                    if (onAutoSave) {
                      await onAutoSave('FE_PERF_TESTS', newValue);
                    } else {
                      await api.put('/admin/settings', { key: 'FE_PERF_TESTS', value: newValue });
                    }
                    updateSiteSetting('FE_PERF_TESTS', newValue);
                  } catch (error) {
                    console.error('Failed to save FE_PERF_TESTS toggle:', error);
                    handleInputChange('FE_PERF_TESTS', perfTestsEnabled ? 'true' : 'false');
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer ${
                  perfTestsEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-300 shadow ring-0 transition duration-200 ease-in-out ${
                    perfTestsEnabled ? 'translate-x-5' : 'translate-x-0'
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
