import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api, { createUser, updateUser, getUserTaskCount, resendUserInvitation, getTags, createTag, updateTag, deleteTag, getTagUsage, getBatchTagUsage, getPriorities, createPriority, updatePriority, deletePriority, reorderPriorities, setDefaultPriority, getPriorityUsage, getBatchPriorityUsage } from '../api';
import { ADMIN_TABS, ROUTES } from '../constants';
import { toast } from '../utils/toast';
import AdminSiteSettingsTab from './admin/AdminSiteSettingsTab';
import AdminSSOTab from './admin/AdminSSOTab';
import AdminTagsTab from './admin/AdminTagsTab';
import AdminMailTab from './admin/AdminMailTab';
import AdminPrioritiesTab from './admin/AdminPrioritiesTab';
import AdminUsersTab from './admin/AdminUsersTab';
import AdminAppSettingsTab from './admin/AdminAppSettingsTab';
import AdminProjectSettingsTab from './admin/AdminProjectSettingsTab';
import AdminSprintSettingsTab from './admin/AdminSprintSettingsTab';
import AdminReportingTab from './admin/AdminReportingTab';
import AdminLicensingTab from './admin/AdminLicensingTab';
import AdminNotificationQueueTab from './admin/AdminNotificationQueueTab';
import websocketClient from '../services/websocketClient';
import { useSettings } from '../contexts/SettingsContext';

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
  WEBSITE_URL?: string;
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
}

// SystemInfo interface removed - Header.tsx handles all system info

const Admin: React.FC<AdminProps> = ({ currentUser, onUsersChanged, onSettingsChanged }) => {
  const { t } = useTranslation('admin');
  const { systemSettings, refreshSettings } = useSettings(); // Use SettingsContext for admin settings
  const [activeTab, setActiveTab] = useState(() => {
    // Get tab from URL hash, fallback to default
    const fullHash = window.location.hash;
    
    // Check for sub-tab patterns like #admin#app-settings#user-interface
    if (fullHash.startsWith('#admin#app-settings#')) {
      return 'app-settings';
    }
    
    // Parse compound hash format like #admin#sso
    const hashParts = fullHash.split('#');
    const tabHash = hashParts[hashParts.length - 1]; // Get the last part
    
    return ADMIN_TABS.includes(tabHash) ? tabHash : ROUTES.DEFAULT_ADMIN_TAB;
  });
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  // systemInfo removed - Header.tsx handles all system info polling and display
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
  const [showDeletePriorityConfirm, setShowDeletePriorityConfirm] = useState<string | null>(null);
  const [priorityUsageCounts, setPriorityUsageCounts] = useState<{ [priorityId: string]: number }>({});
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.roles?.includes('admin')) {
      // Only load data when systemSettings are available (from SettingsContext)
      // This prevents loading with empty settings
      if (systemSettings && Object.keys(systemSettings).length > 0) {
        loadData();
      }
      fetchOwner();
    }
  }, [currentUser, systemSettings]);

  // Fetch instance owner
  const fetchOwner = async () => {
    try {
      const response = await api.get('/admin/owner');
      setOwnerEmail(response.data.owner);
    } catch (err) {
      console.error('Failed to fetch owner:', err);
      setOwnerEmail(null);
    }
  };

  // Handle URL hash changes for tab selection
  useEffect(() => {
    const handleHashChange = () => {
      const fullHash = window.location.hash;
      // Parse compound hash format like #admin#sso or #admin#app-settings#user-interface
      const hashParts = fullHash.split('#');
      const tabHash = hashParts[hashParts.length - 1]; // Get the last part
      
      // Check for sub-tab patterns like admin#app-settings#user-interface
      if (fullHash.startsWith('#admin#app-settings#')) {
        if (activeTab !== 'app-settings') {
          setActiveTab('app-settings');
        }
        return; // Don't process further, let AdminAppSettingsTab handle the sub-tab
      }
      
      // Check for sub-tab patterns like admin#licensing#overview or admin#licensing#subscription
      if (fullHash.startsWith('#admin#licensing#')) {
        if (activeTab !== 'licensing') {
          setActiveTab('licensing');
          // Clear tab-specific messages for the new tab
        }
        return; // Don't process further, let AdminLicensingTab handle the sub-tab
      }
      
      if (ADMIN_TABS.includes(tabHash) && tabHash !== activeTab) {
        setActiveTab(tabHash);
        // Clear tab-specific messages for the new tab
      }
    };

    // Handle initial hash on component mount
    const fullHash = window.location.hash;
    const hashParts = fullHash.split('#');
    const tabHash = hashParts[hashParts.length - 1]; // Get the last part
    
    // Check for sub-tab patterns on initial load
    if (fullHash.startsWith('#admin#app-settings#')) {
      if (activeTab !== 'app-settings') {
        setActiveTab('app-settings');
      }
    } else if (fullHash.startsWith('#admin#licensing#')) {
      if (activeTab !== 'licensing') {
        setActiveTab('licensing');
      }
    } else if (ADMIN_TABS.includes(tabHash) && tabHash !== activeTab) {
      setActiveTab(tabHash);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // WebSocket event listeners for real-time updates
  useEffect(() => {
    if (!currentUser?.roles?.includes('admin')) return;

    // Tag management event handlers
    const handleTagCreated = async (data: any) => {
      try {
        const tags = await getTags();
        setTags(tags);
      } catch (error) {
        console.error('Failed to refresh tags after creation:', error);
      }
    };

    const handleTagUpdated = async (data: any) => {
      try {
        const tags = await getTags();
        setTags(tags);
      } catch (error) {
        console.error('Failed to refresh tags after update:', error);
      }
    };

    const handleTagDeleted = async (data: any) => {
      try {
        const tags = await getTags();
        setTags(tags);
      } catch (error) {
        console.error('Failed to refresh tags after deletion:', error);
      }
    };

    // Priority management event handlers
    const handlePriorityCreated = async (data: any) => {
      try {
        const priorities = await getPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after creation:', error);
      }
    };

    const handlePriorityUpdated = async (data: any) => {
      try {
        const priorities = await getPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after update:', error);
      }
    };

    const handlePriorityDeleted = async (data: any) => {
      try {
        const priorities = await getPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after deletion:', error);
      }
    };

    const handlePriorityReordered = async (data: any) => {
      try {
        const priorities = await getPriorities();
        setPriorities(priorities);
      } catch (error) {
        console.error('Failed to refresh priorities after reorder:', error);
      }
    };

    // Register WebSocket event listeners
    websocketClient.onTagCreated(handleTagCreated);
    websocketClient.onTagUpdated(handleTagUpdated);
    websocketClient.onTagDeleted(handleTagDeleted);
    websocketClient.onPriorityCreated(handlePriorityCreated);
    websocketClient.onPriorityUpdated(handlePriorityUpdated);
    websocketClient.onPriorityDeleted(handlePriorityDeleted);
    websocketClient.onPriorityReordered(handlePriorityReordered);

    // User management event handlers
    const handleUserCreated = async (data: any) => {
      try {
        const usersResponse = await api.get('/admin/users');
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error('Failed to refresh users after creation:', error);
      }
    };

    const handleUserUpdated = async (data: any) => {
      try {
        const usersResponse = await api.get('/admin/users');
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error('Failed to refresh users after update:', error);
      }
    };

    const handleUserRoleUpdated = async (data: any) => {
      try {
        const usersResponse = await api.get('/admin/users');
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error('Failed to refresh users after role update:', error);
      }
    };

    const handleUserDeleted = async (data: any) => {
      try {
        const usersResponse = await api.get('/admin/users');
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error('Failed to refresh users after deletion:', error);
      }
    };

    const handleUserProfileUpdated = async (data: any) => {
      try {
        // Refresh users list to get updated avatar/color/profile info
        const usersResponse = await api.get('/admin/users');
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error('Failed to refresh users after profile update:', error);
      }
    };

    // Settings event handlers
    const handleSettingsUpdated = async (data: any) => {
      try {
        // Update the specific setting directly from WebSocket data instead of fetching all settings
        if (data.key && data.value !== undefined) {
          setSettings(prev => ({
            ...prev,
            [data.key]: data.value
          }));
          setEditingSettings(prev => ({
            ...prev,
            [data.key]: data.value
          }));
        } else {
          // Fallback: Refresh from SettingsContext if WebSocket data is incomplete
          await refreshSettings();
          // SettingsContext will update, and our useEffect will trigger loadData() to sync local state
        }
      } catch (error) {
        console.error('Failed to refresh settings after update:', error);
      }
    };

    // Register WebSocket event listeners
    websocketClient.onUserCreated(handleUserCreated);
    websocketClient.onUserUpdated(handleUserUpdated);
    websocketClient.onUserRoleUpdated(handleUserRoleUpdated);
    websocketClient.onUserDeleted(handleUserDeleted);
    websocketClient.onUserProfileUpdated(handleUserProfileUpdated);
    websocketClient.onSettingsUpdated(handleSettingsUpdated);

    // Cleanup function
    return () => {
      websocketClient.offTagCreated(handleTagCreated);
      websocketClient.offTagUpdated(handleTagUpdated);
      websocketClient.offTagDeleted(handleTagDeleted);
      websocketClient.offPriorityCreated(handlePriorityCreated);
      websocketClient.offPriorityUpdated(handlePriorityUpdated);
      websocketClient.offPriorityDeleted(handlePriorityDeleted);
      websocketClient.offPriorityReordered(handlePriorityReordered);
      websocketClient.offUserCreated(handleUserCreated);
      websocketClient.offUserUpdated(handleUserUpdated);
      websocketClient.offUserRoleUpdated(handleUserRoleUpdated);
      websocketClient.offUserDeleted(handleUserDeleted);
      websocketClient.offUserProfileUpdated(handleUserProfileUpdated);
      websocketClient.offSettingsUpdated(handleSettingsUpdated);
    };
  }, [currentUser?.roles, refreshSettings]);

  // System info fetching removed - Header.tsx handles all system info polling
  // Header is always loaded and has the same admin check, so no need for duplicate polling

  const loadData = async () => {
    try {
      setLoading(true);
      // Use SettingsContext for settings (already fetched for admins) instead of duplicate API call
      const [usersResponse, tagsResponse, prioritiesResponse] = await Promise.all([
        api.get('/admin/users'),
        getTags(),
        getPriorities()
      ]);
      
      setUsers(usersResponse.data || []);
      
      // Use settings from SettingsContext (already fetched for admins)
      // Ensure default values for settings
      const loadedSettings = systemSettings || {};
      const settingsWithDefaults = {
        ...loadedSettings,
        TASK_DELETE_CONFIRM: loadedSettings.TASK_DELETE_CONFIRM || 'true'
      };
      
      setSettings(settingsWithDefaults);
      setEditingSettings(settingsWithDefaults);
      setTags(tagsResponse || []);
      setPriorities(prioritiesResponse || []);
      
      // Load tag usage counts for all tags (batch query - fixes N+1 problem)
      if (tagsResponse && tagsResponse.length > 0) {
        try {
          const tagIds = tagsResponse.map((tag: any) => tag.id);
          const batchUsageData = await getBatchTagUsage(tagIds);
          const tagUsageCountsMap: { [tagId: number]: number } = {};
          tagIds.forEach((tagId: number) => {
            tagUsageCountsMap[tagId] = batchUsageData[tagId]?.count || 0;
          });
          setTagUsageCounts(tagUsageCountsMap);
        } catch (error) {
          console.error('Failed to get batch tag usage:', error);
          // Fallback to empty map
          setTagUsageCounts({});
        }
      }
      
      // Load priority usage counts for all priorities (batch query - fixes N+1 problem)
      if (prioritiesResponse && prioritiesResponse.length > 0) {
        try {
          const priorityIds = prioritiesResponse.map((priority: any) => priority.id);
          const batchUsageData = await getBatchPriorityUsage(priorityIds);
          const priorityUsageCountsMap: { [priorityId: string]: number } = {};
          priorityIds.forEach((priorityId: string) => {
            priorityUsageCountsMap[priorityId] = batchUsageData[priorityId]?.count || 0;
          });
          setPriorityUsageCounts(priorityUsageCountsMap);
        } catch (error) {
          console.error('Failed to get batch priority usage:', error);
          // Fallback to empty map
          setPriorityUsageCounts({});
        }
      }
      
      // Check if default admin account still exists
      const defaultAdminExists = usersResponse.data?.some((user: any) => 
        user.email === 'admin@example.com'
      );
      setHasDefaultAdmin(defaultAdminExists);
    } catch (err) {
      toast.error(t('failedToLoadAdminData'), '');
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
      toast.success(action === 'promote' ? t('userPromotedSuccessfully') : t('userDemotedSuccessfully'), '');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 
                          (action === 'promote' ? t('failedToPromoteUser') : t('failedToDemoteUser'));
      toast.error(errorMessage, '');
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    // Prevent users from deleting themselves
    if (userId === currentUser?.id) {
      toast.error(t('cannotDeleteOwnAccount'), '');
      return;
    }

    try {
      // Fetch task count for this user
      const taskCountData = await getUserTaskCount(userId);
      setUserTaskCounts(prev => ({ ...prev, [userId]: taskCountData.count }));
      setShowDeleteConfirm(userId);
    } catch (error: any) {
      console.error('Failed to get task count:', error);
      // Show error toast but still allow deletion
      const errorMessage = error.response?.data?.error || error.message || t('failedToGetTaskCount');
      toast.error(errorMessage, '');
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
      toast.success(t('userDeletedSuccessfully'), '');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || t('failedToDeleteUser');
      toast.error(errorMessage, '');
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
      toast.success(t('tagDeletedSuccessfully'), '');
    } catch (error: any) {
      toast.error(t('failedToDeleteTag'), error.response?.data?.error || '');
    }
  };

  const cancelDeleteTag = () => {
    setShowDeleteTagConfirm(null);
  };

  const handleAddTag = async (tagData: { tag: string; description: string; color: string }) => {
    await createTag(tagData);
    const updatedTags = await getTags();
    setTags(updatedTags);
    toast.success(t('tagCreatedSuccessfully'), '');
  };

  const handleUpdateTag = async (tagId: number, updates: { tag: string; description: string; color: string }) => {
    await updateTag(tagId, updates);
    const updatedTags = await getTags();
    setTags(updatedTags);
    toast.success(t('tagUpdatedSuccessfully'), '');
  };

  const handleAddPriority = async (priorityData: { priority: string; color: string }) => {
    await createPriority(priorityData);
    const updatedPriorities = await getPriorities();
    setPriorities(updatedPriorities);
    toast.success(t('priorityCreatedSuccessfully'), '');
  };

  const handleUpdatePriority = async (priorityId: string, updates: { priority: string; color: string }) => {
    await updatePriority(Number(priorityId), updates);
    const updatedPriorities = await getPriorities();
    setPriorities(updatedPriorities);
    toast.success(t('priorityUpdatedSuccessfully'), '');
  };

  const handleDeletePriority = async (priorityId: string) => {
    try {
      // Fetch usage count for this priority
      const usageData = await getPriorityUsage(priorityId);
      setPriorityUsageCounts(prev => ({ ...prev, [priorityId]: usageData.count }));
      setShowDeletePriorityConfirm(priorityId);
    } catch (error) {
      console.error('Failed to get priority usage:', error);
      // Still show confirmation even if usage count fails
      setPriorityUsageCounts(prev => ({ ...prev, [priorityId]: 0 }));
      setShowDeletePriorityConfirm(priorityId);
    }
  };

  const confirmDeletePriority = async (priorityId: string) => {
    try {
      const response = await deletePriority(Number(priorityId));
      const updatedPriorities = await getPriorities();
      setPriorities(updatedPriorities);
      setShowDeletePriorityConfirm(null);
      
      // Show success message with reassignment info if applicable
      const reassignedCount = response?.data?.reassignedTasks || 0;
      let successMessage = t('priorityDeletedSuccessfully');
      if (reassignedCount > 0) {
        successMessage += ` (${t('tasksReassignedToDefault', { count: reassignedCount })})`;
      }
      
      toast.success(successMessage, '');
    } catch (error: any) {
      console.error('Failed to delete priority:', error);
      
      // Extract specific error message from backend response
      let errorMessage = t('failedToDeletePriority');
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, '');
    }
  };

  const cancelDeletePriority = () => {
    setShowDeletePriorityConfirm(null);
  };

  const handleReorderPriorities = async (reorderedPriorities: any[]) => {
    setPriorities(reorderedPriorities);
    try {
      await reorderPriorities(reorderedPriorities);
      toast.success(t('prioritiesReorderedSuccessfully'), '');
    } catch (error: any) {
      // Revert on error
      const currentPriorities = await getPriorities();
      setPriorities(currentPriorities);
      toast.error(error.response?.data?.error || t('failedToReorderPriorities'), '');
    }
  };

  const handleSetDefaultPriority = async (priorityId: string) => {
    try {
      await setDefaultPriority(Number(priorityId));
      const updatedPriorities = await getPriorities();
      setPriorities(updatedPriorities);
      toast.success(t('defaultPriorityUpdatedSuccessfully'), '');
    } catch (error: any) {
      console.error('Failed to set default priority:', error);
      toast.error(error?.response?.data?.error || t('failedToSetDefaultPriority'), '');
    }
  };

  const handleUserColorChange = async (userId: string, color: string) => {
    try {
      await api.put(`/admin/users/${userId}/color`, { color });
      await loadData(); // Reload users
      if (onUsersChanged) {
        onUsersChanged();
      }
      toast.success(t('userColorUpdatedSuccessfully'), '');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || t('failedToUpdateUserColor');
      toast.error(errorMessage, '');
      console.error('Failed to update user color:', err);
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
      toast.error(t('failedToRemoveAvatar'), '');
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

  const handleSaveSettings = async (newSettings?: { [key: string]: string | undefined }) => {
    try {
      
      let hasChanges = false;
      const changedKeys: string[] = [];
      // Use passed settings if available, otherwise use editingSettings
      const settingsToSave = newSettings || editingSettings;
      
      // Save each setting individually
      for (const [key, value] of Object.entries(settingsToSave)) {
        // Skip WEBSITE_URL - it's read-only and set during instance purchase
        if (key === 'WEBSITE_URL') {
          continue;
        }
        
        // Skip APP_URL - it's owner-only and must be updated via dedicated endpoint
        if (key === 'APP_URL') {
          continue;
        }
        
        if (value !== settings[key]) {
          // Skip console log for NOTIFICATION_* settings to reduce noise
          if (!key.startsWith('NOTIFICATION_')) {
            console.log(`Saving setting: ${key}`, {
              oldValue: settings[key],
              newValue: value
            });
          }
          await api.put('/admin/settings', { key, value });
          hasChanges = true;
          changedKeys.push(key);
        }
      }
      
      if (hasChanges) {
        // Refresh settings from SettingsContext (which will refetch from API via WebSocket or manual refresh)
        await refreshSettings();
        await loadData(); // Reload data (users, tags, priorities, and settings from context)
        
        // Update the parent component's site settings immediately
        if (onSettingsChanged) {
          onSettingsChanged();
        }
        
        // Check if this is only UPLOAD_LIMITS_ENFORCED (which has its own toast message)
        const isOnlyUploadLimitsEnforced = changedKeys.length === 1 && changedKeys[0] === 'UPLOAD_LIMITS_ENFORCED';
        
        // Show success toast (skip for UPLOAD_LIMITS_ENFORCED as it has its own specific message)
        if (!isOnlyUploadLimitsEnforced) {
          toast.success(t('settingsSavedSuccessfully'), '');
        }
      } else {
        toast.info(t('noChangesToSave'), '', 3000);
      }
    } catch (err) {
      toast.error(t('failedToSaveSettings'), '');
      console.error(err);
    }
  };

  // Auto-save function for immediate saving of individual settings
  const handleAutoSaveSetting = async (key: string, value: string) => {
    try {
      
      // Save the setting immediately
      await api.put('/admin/settings', { key, value });
      
      // Update the settings state
      setSettings(prev => ({ ...prev, [key]: value }));
      
      // Update the parent component's site settings immediately
      if (onSettingsChanged) {
        onSettingsChanged();
      }
      
      // Show brief success message for auto-save
      toast.success(t('settingsSavedSuccessfully'), '', 3000);
      
    } catch (err) {
      toast.error(t('failedToSaveSetting', { key }), '');
      console.error(err);
      throw err; // Re-throw so the component can handle the error
    }
  };

  const handleReloadOAuth = async () => {
    try {
      await api.post('/auth/reload-oauth');
      toast.success(t('oauthReloadedSuccessfully'), '');
    } catch (err: any) {
      toast.error(t('failedToReloadOAuth'), '');
      console.error(err);
    }
  };

  const handleAddUser = async (userData: any) => {
    try {
      // Only check email server status if sending an invite (isActive = false)
      if (!userData.isActive) {
        const emailStatusResponse = await fetch('/api/admin/email-status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        
        if (emailStatusResponse.ok) {
          const emailStatus = await emailStatusResponse.json();
          if (!emailStatus.available) {
            throw new Error(t('emailServerNotAvailable', { error: emailStatus.error }));
          }
        } else {
          console.warn('Could not check email status, proceeding with user creation');
        }
      }

      const result = await createUser(userData);
      
      // Check if email was actually sent (only relevant if isActive is false)
      if (!userData.isActive && result.emailSent === false) {
        toast.warning(t('userCreatedButEmailFailed', { error: result.emailError || t('emailServiceUnavailable') }), '');
      } else {
      }
      
      await loadData(); // Reload users
      // Notify parent component that users have changed
      if (onUsersChanged) {
        onUsersChanged();
      }
    } catch (error: any) {
      console.error('Failed to create user:', error);
      toast.error(error.message || t('failedToCreateUser'), '');
      throw error; // Re-throw so the UI can handle it
    }
  };

  const handleResendInvitation = async (userId: string) => {
    try {
      
      // Check email server status first
      const emailStatusResponse = await fetch('/api/admin/email-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (emailStatusResponse.ok) {
        const emailStatus = await emailStatusResponse.json();
        if (!emailStatus.available) {
          throw new Error(t('emailServerNotAvailableForResend', { error: emailStatus.error }));
        }
      } else {
        console.warn('Could not check email status, proceeding with resend');
        // If we can't check status, we should still try but warn the user
        console.warn('Email status check failed with status:', emailStatusResponse.status);
      }

      const result = await resendUserInvitation(userId);
      
      // Verify the result actually indicates success
      // The API returns { success: true, email: ... } on success or { success: false, error: ... } on failure
      if (result && result.success === true && result.email) {
        toast.success(t('invitationEmailSent', { email: result.email }), '');
      } else {
        // Check for error in response data (from axios error handling)
        const errorMessage = result?.error || result?.details || t('failedToSendInvitationEmail');
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      console.error('Failed to resend invitation:', err);
      const errorMessage = err.response?.data?.error || err.message || t('failedToSendInvitationEmail');
      toast.error(errorMessage, '');
    }
  };

  const handleEditUser = (_user: User) => {
    // This will be handled by the AdminUsersTab component
  };

  const handleSaveUser = async (userData: any) => {
    try {
      // Update user basic info
      await updateUser(userData.id, userData);
      
      // Update display name in members table
      if (userData.displayName) {
        await api.put(`/admin/users/${userData.id}/member-name`, { 
          displayName: userData.displayName.trim() 
        });
      }
      
      // Upload avatar if selected
      if (userData.selectedFile) {
        const formData = new FormData();
        formData.append('avatar', userData.selectedFile);
        await api.post(`/admin/users/${userData.id}/avatar`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      
      await loadData(); // Reload users
      
      if (onUsersChanged) {
        onUsersChanged();
      }
      
      toast.success(t('userUpdatedSuccessfully'), '');
    } catch (err: any) {
      console.error('❌ Failed to save user:', err);
      // Extract detailed error message, including user limit errors
      let errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || t('failedToUpdateUser');
      
      // Check for user limit error specifically
      if (err.response?.status === 403 && (errorMessage.includes('limit') || errorMessage.includes('Limit'))) {
        errorMessage = err.response?.data?.message || err.response?.data?.error || t('users.userLimitReached');
      }
      
      toast.error(errorMessage, '');
      throw err; // Re-throw so the calling component can handle it
    }
  };

  const handleCancelSettings = () => {
    setEditingSettings(settings);
  };

  const handleMailServerDisabled = () => {
    // Clear test result when mail server is disabled to require re-testing
    setTestEmailResult(null);
  };

  const handleTestEmail = async () => {
    try {
      setIsTestingEmail(true);
      
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
      
      // Auto-enable mail server if test succeeds and it's not already enabled
      if (response.data && editingSettings.MAIL_ENABLED !== 'true') {
        setEditingSettings(prev => ({ ...prev, MAIL_ENABLED: 'true' }));
        // Save the auto-enabled setting
        await api.put('/admin/settings', { key: 'MAIL_ENABLED', value: 'true' });
        console.log('✅ Mail server auto-enabled after successful test');
      }
      
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('accessDenied')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{t('noPermissionToAccess')}</p>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            ← {t('goBackHome')}
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">{t('loadingAdminPanel')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('adminPanel')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t('adminPanelDescription')}
          </p>
        </div>


        {/* Security Warning - Default Admin Account */}
        {hasDefaultAdmin && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400 dark:text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t('securityWarning')}</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {t('defaultAdminAccountWarning')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="sticky top-16 z-40 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 mb-6 -mx-4 px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" data-tour-id="admin-tabs">
          <nav className="-mb-px flex space-x-8">
            {['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities', 'app-settings', 'project-settings', 'sprint-settings', 'reporting', 'licensing'].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                data-tour-id={`admin-${tab}`}
              >
                {tab === 'users' && t('tabs.users')}
                {tab === 'site-settings' && t('tabs.siteSettings')}
                {tab === 'sso' && t('tabs.sso')}
                {tab === 'mail-server' && t('tabs.mailServer')}
                {tab === 'tags' && t('tabs.tags')}
                {tab === 'priorities' && t('tabs.priorities')}
                {tab === 'app-settings' && t('tabs.appSettings')}
                {tab === 'project-settings' && t('tabs.projectSettings')}
                {tab === 'sprint-settings' && t('tabs.sprintSettings')}
                {tab === 'reporting' && t('tabs.reporting')}
                {tab === 'licensing' && t('tabs.licensing')}
                {tab === 'notification-queue' && t('tabs.notificationQueue')}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          {/* Users Tab */}
          {activeTab === 'users' && (
            <AdminUsersTab
              users={users}
              loading={loading}
              currentUser={currentUser}
              ownerEmail={ownerEmail}
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
            />
          )}

          {/* Site Settings Tab */}
          {activeTab === 'site-settings' && (
            <AdminSiteSettingsTab
              editingSettings={editingSettings}
              onSettingsChange={setEditingSettings}
              onSave={handleSaveSettings}
              onCancel={handleCancelSettings}
              onAutoSave={handleAutoSaveSetting}
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
              onMailServerDisabled={handleMailServerDisabled}
              isTestingEmail={isTestingEmail}
              showTestEmailModal={showTestEmailModal}
              testEmailResult={testEmailResult}
              onCloseTestModal={() => setShowTestEmailModal(false)}
              showTestEmailErrorModal={showTestEmailErrorModal}
              testEmailError={testEmailError}
              onCloseTestErrorModal={() => setShowTestEmailErrorModal(false)}
              onAutoSave={handleAutoSaveSetting}
              onSettingsReload={loadData}
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
              onConfirmDeletePriority={confirmDeletePriority}
              onCancelDeletePriority={cancelDeletePriority}
              onReorderPriorities={handleReorderPriorities}
              onSetDefaultPriority={handleSetDefaultPriority}
              showDeletePriorityConfirm={showDeletePriorityConfirm}
              priorityUsageCounts={priorityUsageCounts}
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
            />
          )}

          {/* Sprint Settings Tab */}
          {activeTab === 'sprint-settings' && (
            <AdminSprintSettingsTab />
          )}

          {/* Reporting Tab */}
          {activeTab === 'reporting' && (
            <AdminReportingTab />
          )}

          {/* Licensing Tab */}
          {activeTab === 'licensing' && (
            <AdminLicensingTab
              currentUser={currentUser}
              settings={settings}
            />
          )}

          {/* Notification Queue Tab */}
          {activeTab === 'notification-queue' && (
            <AdminNotificationQueueTab />
          )}
        </div>
    </div>
  );
};

export default Admin;