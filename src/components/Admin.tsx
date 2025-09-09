import React, { useState, useEffect } from 'react';
import api, { createUser, updateUser, getUserTaskCount, resendUserInvitation, getTags, createTag, updateTag, deleteTag, getTagUsage, getPriorities, createPriority, updatePriority, deletePriority, reorderPriorities, setDefaultPriority } from '../api';
import { ADMIN_TABS, ROUTES } from '../constants';
import AdminSiteSettingsTab from './admin/AdminSiteSettingsTab';
import AdminSSOTab from './admin/AdminSSOTab';
import AdminTagsTab from './admin/AdminTagsTab';
import AdminMailTab from './admin/AdminMailTab';
import AdminPrioritiesTab from './admin/AdminPrioritiesTab';
import AdminUsersTab from './admin/AdminUsersTab';
import AdminAppSettingsTab from './admin/AdminAppSettingsTab';
import AdminProjectSettingsTab from './admin/AdminProjectSettingsTab';

interface AdminProps {
  currentUser: any;
  onUsersChanged?: () => void;
  onSettingsChanged?: () => void;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  isActive: boolean;
  roles: string[];
  joined: string;
  createdAt: string;
  avatarUrl?: string;
  authProvider?: string;
  googleAvatarUrl?: string;
  memberColor?: string;
}

interface Settings {
  SITE_NAME?: string;
  SITE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALLBACK_URL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  SMTP_SECURE?: string;
  MAIL_ENABLED?: string;
  TASK_DELETE_CONFIRM?: string;
  SHOW_ACTIVITY_FEED?: string;
  DEFAULT_VIEW_MODE?: string;
  DEFAULT_TASK_VIEW_MODE?: string;
  DEFAULT_ACTIVITY_FEED_POSITION?: string;
  DEFAULT_ACTIVITY_FEED_WIDTH?: string;
  DEFAULT_ACTIVITY_FEED_HEIGHT?: string;
  USE_PREFIXES?: string;
  DEFAULT_PROJ_PREFIX?: string;
  DEFAULT_TASK_PREFIX?: string;
  [key: string]: string | undefined;
}

const Admin: React.FC<AdminProps> = ({ currentUser, onUsersChanged, onSettingsChanged }) => {
  const [activeTab, setActiveTab] = useState(() => {
    // Get tab from URL hash, fallback to default
    const hash = window.location.hash.replace('#', '');
    return ADMIN_TABS.includes(hash) ? hash : ROUTES.DEFAULT_ADMIN_TAB;
  });
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [showTestEmailErrorModal, setShowTestEmailErrorModal] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<any>(null);
  const [testEmailError, setTestEmailError] = useState<string>('');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [editingSettings, setEditingSettings] = useState<Settings>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [userTaskCounts, setUserTaskCounts] = useState<{ [userId: string]: number }>({});
  const [showDeleteTagConfirm, setShowDeleteTagConfirm] = useState<number | null>(null);
  const [tagUsageCounts, setTagUsageCounts] = useState<{ [tagId: number]: number }>({});
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);

  useEffect(() => {
    if (currentUser?.roles?.includes('admin')) {
      loadData();
    }
  }, [currentUser]);

  // Handle URL hash changes for tab selection
  useEffect(() => {
    const handleHashChange = () => {
      const fullHash = window.location.hash;
      // Parse compound hash format like #admin#sso
      const hashParts = fullHash.split('#');
      const tabHash = hashParts[hashParts.length - 1]; // Get the last part
      
      if (ADMIN_TABS.includes(tabHash) && tabHash !== activeTab) {
        setActiveTab(tabHash);
        // Clear messages when switching tabs
        setSuccessMessage(null);
        setError(null);
      }
    };

    // Handle initial hash on component mount
    const fullHash = window.location.hash;
    const hashParts = fullHash.split('#');
    const tabHash = hashParts[hashParts.length - 1]; // Get the last part
    
    if (ADMIN_TABS.includes(tabHash) && tabHash !== activeTab) {
      setActiveTab(tabHash);
      // Clear messages when switching tabs
      setSuccessMessage(null);
      setError(null);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersResponse, settingsResponse, tagsResponse, prioritiesResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/settings'),
        getTags(),
        getPriorities()
      ]);
      
      setUsers(usersResponse.data || []);
      
      // Ensure default values for settings
      const loadedSettings = settingsResponse.data || {};
      const settingsWithDefaults = {
        ...loadedSettings,
        TASK_DELETE_CONFIRM: loadedSettings.TASK_DELETE_CONFIRM || 'true'
      };
      
      setSettings(settingsWithDefaults);
      setEditingSettings(settingsWithDefaults);
      setTags(tagsResponse || []);
      setPriorities(prioritiesResponse || []);
      
      // Check if default admin account still exists
      const defaultAdminExists = usersResponse.data?.some((user: any) => 
        user.email === 'admin@example.com'
      );
      setHasDefaultAdmin(defaultAdminExists);
    } catch (err) {
      setError('Failed to load admin data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, action: 'promote' | 'demote') => {
    try {
      const role = action === 'promote' ? 'admin' : 'user';
      await api.put(`/admin/users/${userId}/role`, { role });
      await loadData(); // Reload users
    } catch (err) {
      setError(`Failed to ${action} user`);
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    // Prevent users from deleting themselves
    if (userId === currentUser?.id) {
      setError('You cannot delete your own account');
      return;
    }

    try {
      // Fetch task count for this user
      const taskCountData = await getUserTaskCount(userId);
      setUserTaskCounts(prev => ({ ...prev, [userId]: taskCountData.count }));
      setShowDeleteConfirm(userId);
    } catch (error) {
      console.error('Failed to get task count:', error);
      // Still show confirmation even if task count fails
      setUserTaskCounts(prev => ({ ...prev, [userId]: 0 }));
      setShowDeleteConfirm(userId);
    }
  };

  const confirmDeleteUser = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      await loadData(); // Reload users
      if (onUsersChanged) {
        onUsersChanged();
      }
      setShowDeleteConfirm(null);
    } catch (err) {
      setError('Failed to delete user');
      console.error(err);
    }
  };

  const cancelDeleteUser = () => {
    setShowDeleteConfirm(null);
  };

  const handleDeleteTag = async (tagId: number) => {
    try {
      // Fetch usage count for this tag
      const usageData = await getTagUsage(tagId);
      setTagUsageCounts(prev => ({ ...prev, [tagId]: usageData.count }));
      setShowDeleteTagConfirm(tagId);
    } catch (error) {
      console.error('Failed to get tag usage:', error);
      // Still show confirmation even if usage count fails
      setTagUsageCounts(prev => ({ ...prev, [tagId]: 0 }));
      setShowDeleteTagConfirm(tagId);
    }
  };

  const confirmDeleteTag = async (tagId: number) => {
    try {
      await deleteTag(tagId);
      const updatedTags = await getTags();
      setTags(updatedTags);
      setShowDeleteTagConfirm(null);
      setSuccessMessage('Tag and all associations deleted successfully');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to delete tag');
    }
  };

  const cancelDeleteTag = () => {
    setShowDeleteTagConfirm(null);
  };

  const handleAddTag = async (tagData: { tag: string; description: string; color: string }) => {
    await createTag(tagData);
    const updatedTags = await getTags();
    setTags(updatedTags);
    setSuccessMessage('Tag created successfully');
  };

  const handleUpdateTag = async (tagId: number, updates: { tag: string; description: string; color: string }) => {
    await updateTag(tagId, updates);
    const updatedTags = await getTags();
    setTags(updatedTags);
    setSuccessMessage('Tag updated successfully');
  };

  const handleAddPriority = async (priorityData: { priority: string; color: string }) => {
    await createPriority(priorityData);
    const updatedPriorities = await getPriorities();
    setPriorities(updatedPriorities);
    setSuccessMessage('Priority created successfully');
  };

  const handleUpdatePriority = async (priorityId: string, updates: { priority: string; color: string }) => {
    await updatePriority(Number(priorityId), updates);
    const updatedPriorities = await getPriorities();
    setPriorities(updatedPriorities);
    setSuccessMessage('Priority updated successfully');
  };

  const handleDeletePriority = async (priorityId: string) => {
    await deletePriority(Number(priorityId));
    const updatedPriorities = await getPriorities();
    setPriorities(updatedPriorities);
    setSuccessMessage('Priority deleted successfully');
  };

  const handleReorderPriorities = async (reorderedPriorities: any[]) => {
    setPriorities(reorderedPriorities);
    try {
      await reorderPriorities(reorderedPriorities);
      setSuccessMessage('Priorities reordered successfully');
    } catch (error: any) {
      // Revert on error
      const currentPriorities = await getPriorities();
      setPriorities(currentPriorities);
      setError(error.response?.data?.error || 'Failed to reorder priorities');
    }
  };

  const handleSetDefaultPriority = async (priorityId: string) => {
    try {
      await setDefaultPriority(Number(priorityId));
      const updatedPriorities = await getPriorities();
      setPriorities(updatedPriorities);
      setSuccessMessage('Default priority updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      console.error('Failed to set default priority:', error);
      setError(error?.response?.data?.error || 'Failed to set default priority');
    }
  };

  const handleUserColorChange = async (userId: string, color: string) => {
    await api.put(`/admin/users/${userId}/color`, { color });
    await loadData(); // Reload users
    if (onUsersChanged) {
      onUsersChanged();
    }
  };

  const handleUserRemoveAvatar = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}/avatar`);
      await loadData();
      if (onUsersChanged) {
        onUsersChanged();
      }
    } catch (error) {
      console.error('Failed to remove user avatar:', error);
      setError('Failed to remove avatar');
    }
  };

  // Close confirmation menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeleteConfirm && !(event.target as Element).closest('.delete-confirmation')) {
        setShowDeleteConfirm(null);
      }
      if (showDeleteTagConfirm && !(event.target as Element).closest('.delete-confirmation')) {
        setShowDeleteTagConfirm(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDeleteConfirm, showDeleteTagConfirm]);

  const handleSaveSettings = async () => {
    try {
      setError(null);
      setSuccessMessage(null);
      
      let hasChanges = false;
      // Save each setting individually
      for (const [key, value] of Object.entries(editingSettings)) {
        if (value !== settings[key]) {
          await api.put('/admin/settings', { key, value });
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        await loadData(); // Reload settings
        
        // Update the parent component's site settings immediately
        if (onSettingsChanged) {
          onSettingsChanged();
        }
        
        // Show success message
        setSuccessMessage('✅ Settings saved successfully! Changes are applied immediately.');
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setSuccessMessage('ℹ️ No changes to save');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    }
  };

  // Auto-save function for immediate saving of individual settings
  const handleAutoSaveSetting = async (key: string, value: string) => {
    try {
      setError(null);
      
      // Save the setting immediately
      await api.put('/admin/settings', { key, value });
      
      // Update the settings state
      setSettings(prev => ({ ...prev, [key]: value }));
      
      // Update the parent component's site settings immediately
      if (onSettingsChanged) {
        onSettingsChanged();
      }
      
      // Show brief success message for auto-save
      setSuccessMessage(`✅ ${key} setting saved automatically!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err) {
      setError(`Failed to save ${key} setting`);
      console.error(err);
      throw err; // Re-throw so the component can handle the error
    }
  };

  const handleReloadOAuth = async () => {
    try {
      await api.post('/auth/reload-oauth');
      setSuccessMessage('✅ OAuth configuration reloaded successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError('Failed to reload OAuth configuration');
      console.error(err);
    }
  };

  const handleAddUser = async (userData: any) => {
    await createUser(userData);
    await loadData(); // Reload users
    setError(null);
    // Notify parent component that users have changed
    if (onUsersChanged) {
      onUsersChanged();
    }
  };

  const handleResendInvitation = async (userId: string) => {
    try {
      setError(null);
      const result = await resendUserInvitation(userId);
      setSuccessMessage(`Invitation email sent successfully to ${result.email}`);
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to resend invitation:', err);
      const errorMessage = err.response?.data?.error || 'Failed to send invitation email';
      setError(errorMessage);
    }
  };

  const handleEditUser = (_user: User) => {
    // This will be handled by the AdminUsersTab component
  };

  const handleSaveUser = async (userData: any) => {
    console.log('👤 Admin saving user:', userData.id, 'displayName:', userData.displayName);
    
    // Update user basic info
    console.log('📝 Updating user basic info...');
    await updateUser(userData.id, userData);
    console.log('✅ User basic info updated');
    
    // Update display name in members table
    if (userData.displayName) {
      console.log('🏷️ Updating member display name to:', userData.displayName.trim());
      await api.put(`/admin/users/${userData.id}/member-name`, { 
        displayName: userData.displayName.trim() 
      });
      console.log('✅ Member display name updated');
    }
    
    // Upload avatar if selected
    if (userData.selectedFile) {
      console.log('📷 Uploading avatar...');
      const formData = new FormData();
      formData.append('avatar', userData.selectedFile);
      await api.post(`/admin/users/${userData.id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('✅ Avatar uploaded');
    }
    
    console.log('🔄 Reloading admin data...');
    await loadData(); // Reload users
    console.log('✅ Admin data reloaded');
    
    if (onUsersChanged) {
      console.log('🔄 Triggering main app members refresh...');
      onUsersChanged();
    }
    setError(null);
  };

  const handleCancelSettings = () => {
    setEditingSettings(settings);
    setError(null);
  };

  const handleTestEmail = async () => {
    try {
      setIsTestingEmail(true);
      setError(null);
      setSuccessMessage(null);
      
      // First, save any unsaved settings
      let hasChanges = false;
      for (const [key, value] of Object.entries(editingSettings)) {
        if (value !== settings[key]) {
          await api.put('/admin/settings', { key, value });
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        await loadData(); // Reload settings
        if (onSettingsChanged) {
          onSettingsChanged();
        }
      }
      
      // Now test the email
      const response = await api.post('/admin/test-email');
      
      // Show success modal
      setTestEmailResult(response.data);
      setShowTestEmailModal(true);
      
    } catch (err: any) {
      // Capture the full error details for debugging
      const errorDetails = {
        message: err.message || 'Unknown error',
        status: err.response?.status || 'No status',
        statusText: err.response?.statusText || 'No status text',
        data: err.response?.data || 'No response data',
        url: err.config?.url || '/admin/test-email',
        method: err.config?.method || 'POST'
      };
      
      setTestEmailError(JSON.stringify(errorDetails, null, 2));
      setShowTestEmailErrorModal(true);
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Update URL hash for tab persistence - preserve admin context
    window.location.hash = `admin#${tab}`;
  };

  if (!currentUser?.roles?.includes('admin')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            ← Go back home
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-2 text-gray-600">
            Manage users, site settings, and authentication configuration
          </p>
        </div>

        {/* Security Warning - Default Admin Account */}
        {hasDefaultAdmin && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Security Warning</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  The default admin account (admin@example.com) still exists. This is a security risk. 
                  Please create a new admin user first, then delete this default account.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities', 'app-settings', 'project-settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'users' && 'Users'}
                {tab === 'site-settings' && 'Site Settings'}
                {tab === 'sso' && 'Single Sign-On'}
                {tab === 'mail-server' && 'Mail Server'}
                {tab === 'tags' && 'Tags'}
                {tab === 'priorities' && 'Priorities'}
                {tab === 'app-settings' && 'App Settings'}
                {tab === 'project-settings' && 'Project Settings'}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white shadow rounded-lg">
          {/* Users Tab */}
          {activeTab === 'users' && (
            <AdminUsersTab
              users={users}
              loading={loading}
              currentUser={currentUser}
              showDeleteConfirm={showDeleteConfirm}
              userTaskCounts={userTaskCounts}
              onRoleChange={handleRoleChange}
              onDeleteUser={handleDeleteUser}
              onConfirmDeleteUser={confirmDeleteUser}
              onCancelDeleteUser={cancelDeleteUser}
              onAddUser={handleAddUser}
              onEditUser={handleEditUser}
              onSaveUser={handleSaveUser}
              onColorChange={handleUserColorChange}
              onRemoveAvatar={handleUserRemoveAvatar}
              onResendInvitation={handleResendInvitation}
              successMessage={successMessage}
              error={error}
            />
          )}

          {/* Site Settings Tab */}
          {activeTab === 'site-settings' && (
            <AdminSiteSettingsTab
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              successMessage={successMessage}
              error={error}
            />
          )}

          {/* Single Sign-On Tab */}
          {activeTab === 'sso' && (
            <AdminSSOTab
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              onReloadOAuth={handleReloadOAuth}
              successMessage={successMessage}
              error={error}
            />
          )}

          {/* Mail Server Tab */}
          {activeTab === 'mail-server' && (
            <AdminMailTab
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              onTestEmail={handleTestEmail}
              successMessage={successMessage}
              error={error}
              isTestingEmail={isTestingEmail}
              showTestEmailModal={showTestEmailModal}
              testEmailResult={testEmailResult}
              onCloseTestModal={() => setShowTestEmailModal(false)}
              showTestEmailErrorModal={showTestEmailErrorModal}
              testEmailError={testEmailError}
              onCloseTestErrorModal={() => setShowTestEmailErrorModal(false)}
            />
          )}

          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <AdminTagsTab
              tags={tags}
              loading={loading}
              onAddTag={handleAddTag}
              onUpdateTag={handleUpdateTag}
              onDeleteTag={handleDeleteTag}
              onConfirmDeleteTag={confirmDeleteTag}
              onCancelDeleteTag={cancelDeleteTag}
              showDeleteTagConfirm={showDeleteTagConfirm}
              tagUsageCounts={tagUsageCounts}
            />
          )}

          {/* Priorities Tab */}
          {activeTab === 'priorities' && (
            <AdminPrioritiesTab
              priorities={priorities}
              loading={loading}
              onAddPriority={handleAddPriority}
              onUpdatePriority={handleUpdatePriority}
              onDeletePriority={handleDeletePriority}
              onReorderPriorities={handleReorderPriorities}
              onSetDefaultPriority={handleSetDefaultPriority}
              successMessage={successMessage}
              error={error}
            />
          )}

          {/* App Settings Tab */}
          {activeTab === 'app-settings' && (
            <AdminAppSettingsTab
              settings={settings}
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              successMessage={successMessage}
              error={error}
            />
          )}

          {/* Project Settings Tab */}
          {activeTab === 'project-settings' && (
            <AdminProjectSettingsTab
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              onAutoSave={handleAutoSaveSetting}
              successMessage={successMessage}
              error={error}
            />
          )}
        </div>
      </div>

    </div>
  );
};

export default Admin;