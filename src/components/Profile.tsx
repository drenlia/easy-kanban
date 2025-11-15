import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, Trash2 } from 'lucide-react';
import { uploadAvatar, deleteAccount, getUserSettings } from '../api';
import { loadUserPreferences, loadUserPreferencesAsync, updateUserPreference } from '../utils/userPreferences';
import api from '../api';
import { getAuthenticatedAvatarUrl } from '../utils/authImageUrl';
import { useSettings } from '../contexts/SettingsContext';

interface ProfileProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onProfileUpdated: () => void;
  isProfileBeingEdited: boolean;
  onProfileEditingChange: (isEditing: boolean) => void;
  onActivityFeedToggle?: (enabled: boolean) => void;
  onAccountDeleted?: () => void;
}

export default function Profile({ isOpen, onClose, currentUser, onProfileUpdated, isProfileBeingEdited, onProfileEditingChange, onActivityFeedToggle, onAccountDeleted }: ProfileProps) {
  const { t } = useTranslation('common');
  const { systemSettings: contextSystemSettings } = useSettings(); // Use SettingsContext instead of fetching
  const [activeTab, setActiveTab] = useState<'profile' | 'app-settings' | 'notifications'>('profile');
  const [displayName, setDisplayName] = useState(currentUser?.firstName + ' ' + currentUser?.lastName || '');
  const [systemSettings, setSystemSettings] = useState<{ TASK_DELETE_CONFIRM?: string; SHOW_ACTIVITY_FEED?: string; MAIL_ENABLED?: string }>({});
  const [userSettings, setUserSettings] = useState<{ showActivityFeed?: boolean }>({});
  const [userPrefs, setUserPrefs] = useState(loadUserPreferences(currentUser?.id));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Refs for focus management
  const displayNameRef = useRef<HTMLInputElement>(null);
  const deleteConfirmationRef = useRef<HTMLInputElement>(null);
  
  // Track original values to detect changes
  const [originalDisplayName, setOriginalDisplayName] = useState(currentUser?.displayName || currentUser?.firstName + ' ' + currentUser?.lastName || '');
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState(currentUser?.googleAvatarUrl || currentUser?.avatarUrl || '');

  // Load system settings when modal opens - use SettingsContext instead of fetching
  useEffect(() => {
    if (isOpen && contextSystemSettings) {
      // Use settings from SettingsContext instead of fetching
      setSystemSettings(contextSystemSettings);
    }
  }, [isOpen, contextSystemSettings]);

  // Load user settings when system settings are available
  useEffect(() => {
    const loadUserSettings = async () => {
      if (isOpen && Object.keys(systemSettings).length > 0) {
        try {
          // Load unified preferences (cookie + database)
          const unifiedPrefs = await loadUserPreferencesAsync(currentUser?.id);
          setUserPrefs(unifiedPrefs);
          
          // Also load database-only settings for backwards compatibility
          const settings = await getUserSettings();
          // Use system defaults for any settings not explicitly set by user
          const settingsWithDefaults = {
            showActivityFeed: unifiedPrefs.appSettings.showActivityFeed !== undefined 
              ? unifiedPrefs.appSettings.showActivityFeed 
              : systemSettings.SHOW_ACTIVITY_FEED !== 'false', // Default to true unless system says false
            ...settings
          };
          setUserSettings(settingsWithDefaults);
        } catch (error) {
          console.error('Failed to load user settings:', error);
        }
      }
    };
    
    loadUserSettings();
  }, [isOpen, systemSettings, currentUser?.id]);

  // Reset form when modal opens (but not when currentUser changes during editing)
  useEffect(() => {
    if (isOpen && !isProfileBeingEdited) {
      const initialDisplayName = currentUser?.displayName || currentUser?.firstName + ' ' + currentUser?.lastName || '';
      const initialAvatarUrl = currentUser?.googleAvatarUrl || currentUser?.avatarUrl || '';
      
      setDisplayName(initialDisplayName);
      setOriginalDisplayName(initialDisplayName);
      setOriginalAvatarUrl(initialAvatarUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
      setIsSubmitting(false);
      setActiveTab('profile'); // Reset to profile tab
      onProfileEditingChange(false); // Reset editing state when modal opens
    }
  }, [isOpen, onProfileEditingChange]); // Removed currentUser dependency to prevent resets during editing

  // Monitor for changes to display name or avatar to set editing state
  useEffect(() => {
    if (isOpen) {
      const hasDisplayNameChanged = displayName.trim() !== originalDisplayName.trim();
      const hasAvatarChanged = selectedFile !== null || 
        (currentUser?.authProvider === 'local' && !currentUser?.avatarUrl && originalAvatarUrl);

      const isEditing = hasDisplayNameChanged || hasAvatarChanged;
      onProfileEditingChange(isEditing);
    }
  }, [displayName, selectedFile, originalDisplayName, originalAvatarUrl, currentUser, isOpen, onProfileEditingChange]);

  // Auto-focus display name field when modal opens
  useEffect(() => {
    if (isOpen && displayNameRef.current) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        displayNameRef.current?.focus();
        displayNameRef.current?.select();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-focus delete confirmation field when it becomes visible
  useEffect(() => {
    if (showDeleteConfirm && deleteConfirmationRef.current) {
      const timer = setTimeout(() => {
        deleteConfirmationRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [showDeleteConfirm]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      setSelectedFile(file);
      setError(null);

      // Create preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const newPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(newPreviewUrl);
    }
  };

  const handleRemoveFile = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Only call API for local users who have an existing avatar
      if (currentUser?.authProvider === 'local' && currentUser?.avatarUrl) {
        await api.delete('/users/avatar');
      }
      
      // Clear local state
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      
      // Call the callback to refresh user data
      onProfileUpdated();
      
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.failedToRemoveAvatar'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError(t('profile.displayNameRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Update display name first (fast operation)
      await api.put('/users/profile', { displayName: displayName.trim() });
      
      // Handle avatar upload if needed
      if (currentUser?.authProvider === 'local' && selectedFile) {
        try {
          await uploadAvatar(selectedFile);
        } catch (avatarError) {
          console.error('❌ Avatar upload failed:', avatarError);
          // Don't show error to user since profile was already updated
        }
      }
      
      // Call the callback to refresh user data AFTER all updates
      onProfileUpdated();
      
      // Clear editing state after successful save
      onProfileEditingChange(false);
      
      // Close modal immediately
      onClose();
      
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.failedToUpdateProfile'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      // Clean up preview URL if exists
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      // Clear editing state when modal is manually closed
      onProfileEditingChange(false);
      onClose();
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setError(t('profile.pleaseTypeDelete'));
      return;
    }

    setIsDeletingAccount(true);
    setError(null);

    try {
      await deleteAccount();
      
      // Call the account deletion callback to handle logout and redirect
      if (onAccountDeleted) {
        onAccountDeleted();
      }
      
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.failedToDeleteAccount'));
      setIsDeletingAccount(false);
    }
  };

  // App Settings handlers
  const handleTaskDeleteConfirmChange = (value: boolean | 'system') => {
    const currentPrefs = loadUserPreferences(currentUser?.id);
    const newAppSettings = {
      ...currentPrefs.appSettings,
      taskDeleteConfirm: value === 'system' ? undefined : value
    };
    
    updateUserPreference('appSettings', newAppSettings, currentUser?.id);
  };

  const handleActivityFeedToggle = async (enabled: boolean) => {
    try {
      // Update the unified preferences
      const updatedPrefs = {
        ...userPrefs,
        appSettings: { 
          ...userPrefs.appSettings, 
          showActivityFeed: enabled 
        }
      };
      
      await updateUserPreference('appSettings', updatedPrefs.appSettings, currentUser?.id);
      
      // Update local state
      setUserPrefs(updatedPrefs);
      setUserSettings(prev => ({ ...prev, showActivityFeed: enabled }));
      
      // Also update the parent state
      if (onActivityFeedToggle) {
        onActivityFeedToggle(enabled);
      }
    } catch (error) {
      console.error('Failed to update activity feed setting:', error);
      setError(t('profile.failedToUpdateActivityFeed'));
    }
  };

  const getCurrentTaskDeleteConfirmSetting = () => {
    const userPrefs = loadUserPreferences(currentUser?.id);
    
    // If user has explicitly set a preference, return that
    if (userPrefs.appSettings.taskDeleteConfirm !== undefined) {
      return userPrefs.appSettings.taskDeleteConfirm;
    }
    
    // Otherwise, return 'system' to indicate inheriting from system
    return 'system';
  };

  if (!isOpen) return null;

  // Function to get avatar display
  const getAvatarDisplay = () => {
    // Priority: File preview > Current avatar > Default initials
    if (previewUrl) {
      return (
        <img
          src={previewUrl}
          alt="Preview"
          className="h-20 w-20 rounded-full object-cover border-2 border-white shadow-lg"
        />
      );
    }
    
    if (currentUser?.googleAvatarUrl) {
      return (
        <img
          src={getAuthenticatedAvatarUrl(currentUser.googleAvatarUrl)}
          alt="Profile"
          className="h-20 w-20 rounded-full object-cover border-2 border-white shadow-lg"
        />
      );
    }
    
    if (currentUser?.avatarUrl) {
      return (
        <img
          src={getAuthenticatedAvatarUrl(currentUser.avatarUrl)}
          alt="Profile"
          className="h-20 w-20 rounded-full object-cover border-2 border-white shadow-lg"
        />
      );
    }
    
    // Default initials avatar
    const initials = (currentUser?.firstName?.[0] || '') + (currentUser?.lastName?.[0] || '');
    return (
      <div className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white border-2 border-white shadow-lg bg-gradient-to-br from-blue-500 to-purple-600">
        {initials || 'U'}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-6 border w-[480px] shadow-xl rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.title')}</h3>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('profile.profileSettings')}
              </button>
              <button
                onClick={() => setActiveTab('app-settings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'app-settings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('profile.appSettings')}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'notifications'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t('profile.notifications')}
              </button>
            </nav>
          </div>

          {/* Profile Tab Content */}
          {activeTab === 'profile' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Avatar Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    {t('profile.profilePicture')}
                  </label>
                  <div className="flex items-center space-x-4">
                    {/* Avatar Display */}
                    <div className="flex-shrink-0 relative">
                      {getAvatarDisplay()}
                      
                      {/* Remove button - only show for local users with file preview or current avatar */}
                      {currentUser?.authProvider === 'local' && (previewUrl || currentUser?.avatarUrl) && (
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                          title={t('profile.removeAvatar')}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    
                    {/* Upload Controls - Only show for local users */}
                    {currentUser?.authProvider === 'local' ? (
                      <div className="flex-1 space-y-3">
                        <div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="avatar-upload"
                            ref={fileInputRef}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {currentUser?.avatarUrl || previewUrl ? t('profile.changePhoto') : t('profile.uploadPhoto')}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">
                          {t('profile.photoFormatHint')}
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">
                          {t('profile.profilePictureManaged', { provider: currentUser?.authProvider === 'google' ? 'Google' : 'SSO' })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Display Name */}
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.displayName')}
                  </label>
                  <input
                    ref={displayNameRef}
                    type="text"
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={t('profile.displayNamePlaceholder')}
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    {t('profile.displayNameHint')}
                  </p>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="text-sm text-red-600">{error}</div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                      isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting ? t('profile.saving') : t('profile.saveChanges')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                  >
                    {t('buttons.cancel')}
                  </button>
                </div>
              </form>

              {/* Danger Zone - Account Deletion */}
              <div className="mt-8 pt-6 border-t border-red-200">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 mb-2 flex items-center">
                    <Trash2 className="h-5 w-5 mr-2" />
                    {t('profile.dangerZone')}
                  </h3>
                  <p className="text-sm text-red-700 mb-4">
                    {t('profile.deleteAccountWarning')}
                  </p>
                  
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSubmitting || isDeletingAccount}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors text-sm font-medium"
                    >
                      {t('profile.deleteMyAccount')}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-red-100 border border-red-300 rounded-md p-3">
                        <p className="text-sm text-red-800 font-medium mb-2">
                          {t('profile.deleteAccountPermanent')}
                        </p>
                        <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                          <li>{t('profile.deleteAccountList1')}</li>
                          <li>{t('profile.deleteAccountList2')}</li>
                          <li>{t('profile.deleteAccountList3')}</li>
                          <li>{t('profile.deleteAccountList4')}</li>
                        </ul>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-red-800 mb-2">
                            {t('profile.typeDeleteToConfirm')}
                          </label>
                          <input
                            ref={deleteConfirmationRef}
                            type="text"
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            placeholder={t('profile.typeDeletePlaceholder')}
                            disabled={isDeletingAccount}
                          />
                        </div>
                        
                        {error && (
                          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                            {error}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex space-x-3">
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleteConfirmation !== 'DELETE' || isDeletingAccount}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteMyAccountForever')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmation('');
                            setError(null);
                          }}
                          disabled={isDeletingAccount}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors text-sm"
                        >
                          {t('buttons.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* App Settings Tab Content */}
          {activeTab === 'app-settings' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('profile.applicationPreferences')}</h4>
                <p className="text-sm text-gray-600 mb-6">
                  {t('profile.appPreferencesDescription')}
                </p>
              </div>

              {/* Task Delete Confirmation Setting */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      {t('profile.taskDeleteConfirmation')}
                    </label>
                    <p className="text-sm text-gray-500">
                      {t('profile.taskDeleteConfirmationDescription')}
                      {systemSettings.TASK_DELETE_CONFIRM !== 'false' ? ` ${t('profile.systemDefaultEnabled')}` : ` ${t('profile.systemDefaultDisabled')}`}
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={(() => {
                        const current = getCurrentTaskDeleteConfirmSetting();
                        return current === 'system' ? 'system' : current.toString();
                      })()}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'system') {
                          handleTaskDeleteConfirmChange('system');
                        } else {
                          handleTaskDeleteConfirmChange(value === 'true');
                        }
                      }}
                      className="block w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="system">{t('profile.useSystemDefault')}</option>
                      <option value="true">{t('profile.alwaysConfirm')}</option>
                      <option value="false">{t('profile.neverConfirm')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Activity Feed Setting */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      {t('profile.activityFeed')}
                    </label>
                    <p className="text-sm text-gray-500">
                      {t('profile.activityFeedDescription')}
                      {systemSettings.SHOW_ACTIVITY_FEED !== 'false' ? ` ${t('profile.systemDefaultEnabled')}` : ` ${t('profile.systemDefaultDisabled')}`}
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userSettings.showActivityFeed || false}
                        onChange={(e) => handleActivityFeedToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-500 italic">
                {t('profile.changesSavedAutomatically')}
              </div>
            </div>
          )}

          {/* Notifications Tab Content */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('profile.emailNotifications')}</h4>
                <p className="text-sm text-gray-600 mb-6">
                  {t('profile.emailNotificationsDescription')}
                </p>

                {/* Check if email is enabled */}
                {systemSettings.MAIL_ENABLED !== 'true' ? (
                  <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">{t('profile.emailServerDisabled')}</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          {t('profile.emailServerDisabledDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Notification Settings */}
                <div className={`space-y-4 ${systemSettings.MAIL_ENABLED !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="text-sm font-medium text-gray-700 mb-3">{t('profile.notifyMeWhen')}</div>
                  
                  {/* New Task Assigned */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.newTaskAssigned')}</label>
                      <p className="text-xs text-gray-500">{t('profile.newTaskAssignedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.newTaskAssigned || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              newTaskAssigned: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* My Task Updated */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.myTaskUpdated')}</label>
                      <p className="text-xs text-gray-500">{t('profile.myTaskUpdatedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.myTaskUpdated || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              myTaskUpdated: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Watched Task Updated */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.watchedTaskUpdated')}</label>
                      <p className="text-xs text-gray-500">{t('profile.watchedTaskUpdatedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.watchedTaskUpdated || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              watchedTaskUpdated: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Added as Collaborator */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.addedAsCollaborator')}</label>
                      <p className="text-xs text-gray-500">{t('profile.addedAsCollaboratorDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.addedAsCollaborator || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              addedAsCollaborator: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Collaborating Task Updated */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.collaboratingTaskUpdated')}</label>
                      <p className="text-xs text-gray-500">{t('profile.collaboratingTaskUpdatedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.collaboratingTaskUpdated || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              collaboratingTaskUpdated: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Comment Added */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.commentAdded')}</label>
                      <p className="text-xs text-gray-500">{t('profile.commentAddedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.commentAdded || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              commentAdded: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Requester Task Created */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.requesterTaskCreated')}</label>
                      <p className="text-xs text-gray-500">{t('profile.requesterTaskCreatedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.requesterTaskCreated || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              requesterTaskCreated: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Requester Task Updated */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">{t('profile.requesterTaskUpdated')}</label>
                      <p className="text-xs text-gray-500">{t('profile.requesterTaskUpdatedDescription')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPrefs.notifications?.requesterTaskUpdated || false}
                        onChange={(e) => {
                          const newPrefs = {
                            ...userPrefs,
                            notifications: {
                              ...userPrefs.notifications,
                              requesterTaskUpdated: e.target.checked
                            }
                          };
                          setUserPrefs(newPrefs);
                          updateUserPreference('notifications', newPrefs.notifications, currentUser?.id);
                        }}
                        className="sr-only peer"
                        disabled={systemSettings.MAIL_ENABLED !== 'true'}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                <div className="text-sm text-gray-500 italic mt-6">
                  {t('profile.changesSavedAutomatically')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}