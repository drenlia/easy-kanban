import React, { useState, useEffect } from 'react';
import api, { createUser, updateUser, getUserTaskCount, getTags, createTag, updateTag, deleteTag, getTagUsage, getPriorities, createPriority, updatePriority, deletePriority, reorderPriorities } from '../api';
import { Edit, Trash2, Crown, User as UserIcon } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  [key: string]: string | undefined;
}

const Admin: React.FC<AdminProps> = ({ currentUser, onUsersChanged, onSettingsChanged }) => {
  const [activeTab, setActiveTab] = useState(() => {
    // Get tab from URL hash, fallback to 'users'
    const hash = window.location.hash.replace('#', '');
    return ['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities'].includes(hash) ? hash : 'users';
  });
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<any>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState<Settings>({});
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showEditUserForm, setShowEditUserForm] = useState(false);
  const [editingUserData, setEditingUserData] = useState({
    id: '',
    email: '',
    firstName: '',
    lastName: '',
    displayName: '',
    isActive: true,
    avatarUrl: '',
    googleAvatarUrl: '',
    memberColor: '#4ECDC4',
    selectedFile: null as File | null,
    authProvider: ''
  });
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    displayName: '',
    role: 'user'
  });
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>('#4ECDC4');
  const [originalColor, setOriginalColor] = useState<string>('#4ECDC4');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [userTaskCounts, setUserTaskCounts] = useState<{ [userId: string]: number }>({});
  const [showDeleteTagConfirm, setShowDeleteTagConfirm] = useState<number | null>(null);
  const [tagUsageCounts, setTagUsageCounts] = useState<{ [tagId: number]: number }>({});
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [showEditTagForm, setShowEditTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null);
  const [newTag, setNewTag] = useState({ tag: '', description: '', color: '#4ECDC4' });
  const [priorities, setPriorities] = useState<any[]>([]);
  const [showAddPriorityForm, setShowAddPriorityForm] = useState(false);
  const [showEditPriorityForm, setShowEditPriorityForm] = useState(false);
  const [editingPriority, setEditingPriority] = useState<any>(null);
  const [newPriority, setNewPriority] = useState({ priority: '', color: '#4CD964' });
  
  // DnD sensors for priority reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle priority reordering
  const handlePriorityDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = priorities.findIndex((priority) => priority.id === active.id);
      const newIndex = priorities.findIndex((priority) => priority.id === over.id);

      const reorderedPriorities = arrayMove(priorities, oldIndex, newIndex);
      setPriorities(reorderedPriorities);

      try {
        await reorderPriorities(reorderedPriorities);
        setSuccessMessage('Priorities reordered successfully');
      } catch (error: any) {
        // Revert on error
        setPriorities(priorities);
        setError(error.response?.data?.error || 'Failed to reorder priorities');
      }
    }
  };
  
  // Preset colors for easy selection
  const presetColors = [
    '#FF3B30', '#007AFF', '#4CD964', '#FF9500', '#5856D6',
    '#FF2D55', '#00C7BE', '#FFD60A', '#BF5AF2', '#34C759',
    '#FF6B6B', '#1C7ED6', '#845EF7', '#F76707', '#20C997',
    '#E599F7', '#40C057', '#F59F00', '#0CA678', '#FA5252'
  ];

  // Sortable Priority Row Component
  const SortablePriorityRow = ({ priority }: { priority: any }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: priority.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <tr ref={setNodeRef} style={style} className={isDragging ? 'z-50' : ''}>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div 
              {...attributes}
              {...listeners}
              className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-gray-100 text-gray-400 text-xs"
              title="Drag to reorder"
            >
              ⋮⋮
            </div>
            <div 
              className="w-4 h-4 rounded-full border border-gray-300"
              style={{ backgroundColor: priority.color }}
            />
            <span className="text-sm font-medium text-gray-900">{priority.priority}</span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div 
            className="px-2 py-1 rounded-full text-xs font-medium inline-block"
            style={(() => {
              if (!priority.color) {
                return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
              }
              try {
                // Convert hex to RGB for rgba - safer approach
                const hex = priority.color.replace('#', '');
                if (hex.length !== 6) {
                  return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
                }
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                
                // Validate RGB values
                if (isNaN(r) || isNaN(g) || isNaN(b)) {
                  return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
                }
                
                return {
                  backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
                  color: priority.color,
                  border: `1px solid rgba(${r}, ${g}, ${b}, 0.2)`
                };
              } catch (error) {
                // Fallback to gray if any error occurs
                return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' };
              }
            })()}
          >
            {priority.priority}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setEditingPriority(priority);
                setShowEditPriorityForm(true);
              }}
              className="p-1.5 rounded transition-colors text-blue-600 hover:text-blue-900 hover:bg-blue-50"
              title="Edit priority"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={async () => {
                try {
                  await deletePriority(priority.id);
                  const updatedPriorities = await getPriorities();
                  setPriorities(updatedPriorities);
                  setSuccessMessage('Priority deleted successfully');
                } catch (error: any) {
                  setError(error.response?.data?.error || 'Failed to delete priority');
                }
              }}
              className="p-1.5 rounded transition-colors text-red-600 hover:text-red-900 hover:bg-red-50"
              title="Delete priority"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

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
      
      if (['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities'].includes(tabHash) && tabHash !== activeTab) {
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
    
    if (['users', 'site-settings', 'sso', 'mail-server'].includes(tabHash) && tabHash !== activeTab) {
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
      setSettings(settingsResponse.data || {});
      setEditingSettings(settingsResponse.data || {});
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
      await api.put(`/admin/users/${userId}/role`, { action });
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

  const handleColorChange = (userId: string, currentColor: string) => {
    setShowColorPicker(userId);
    setEditingColor(currentColor);
    setOriginalColor(currentColor);
  };

  const handleSaveColor = async (userId: string) => {
    try {
      await api.put(`/admin/users/${userId}/color`, { color: editingColor });
      setShowColorPicker(null);
      await loadData(); // Reload users
      if (onUsersChanged) {
        onUsersChanged();
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update member color');
      console.error(err);
    }
  };

  const handleCancelColor = () => {
    setShowColorPicker(null);
    setEditingColor(originalColor);
    setError(null);
  };

  // Handle user avatar file selection
  const handleUserAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      // Validate file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        setError('Image size must be less than 2MB');
        return;
      }

      setEditingUserData(prev => ({ ...prev, selectedFile: file }));
      setError(null);
    }
  };

  // Handle removing user avatar
  const handleRemoveUserAvatar = async (userId: string) => {
    try {
      setIsSubmitting(true);
      await api.delete(`/admin/users/${userId}/avatar`);
      
      // Update local state
      setEditingUserData(prev => ({ ...prev, avatarUrl: '' }));
      
      // Refresh data
      await loadData();
      if (onUsersChanged) {
        onUsersChanged();
      }
    } catch (error) {
      console.error('Failed to remove user avatar:', error);
      setError('Failed to remove avatar');
    } finally {
      setIsSubmitting(false);
    }
    }

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

  const handleReloadOAuth = async () => {
    try {
      await api.post('/admin/reload-oauth');
      alert('✅ OAuth configuration reloaded successfully!');
    } catch (err: any) {
      setError('Failed to reload OAuth configuration');
      console.error(err);
    }
  };

  const handleAddUser = async () => {
    try {
      await createUser(newUser);
      setShowAddUserForm(false);
      setNewUser({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        displayName: '',
        role: 'user'
      });
      await loadData(); // Reload users
      setError(null);
      // Notify parent component that users have changed
      if (onUsersChanged) {
        onUsersChanged();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
      console.error(err);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUserData({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName || `${user.firstName} ${user.lastName}`,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl || '',
      googleAvatarUrl: user.googleAvatarUrl || '',
      memberColor: user.memberColor || '#4ECDC4',
      selectedFile: null,
      authProvider: user.authProvider || ''
    });
    setShowEditUserForm(true);
  };

  const handleSaveUser = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Update user basic info
      await updateUser(editingUserData.id, editingUserData);
      
      // Update display name in members table
      if (editingUserData.displayName) {
        await api.put(`/admin/users/${editingUserData.id}/member-name`, { 
          displayName: editingUserData.displayName.trim() 
        });
      }
      
      // Upload avatar if selected
      if (editingUserData.selectedFile) {
        const formData = new FormData();
        formData.append('avatar', editingUserData.selectedFile);
        await api.post(`/admin/users/${editingUserData.id}/avatar`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      
      setShowEditUserForm(false);
      await loadData(); // Reload users
      if (onUsersChanged) {
        onUsersChanged();
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEditUser = () => {
    setShowEditUserForm(false);
    setEditingUserData({
      id: '',
      email: '',
      firstName: '',
      lastName: '',
      displayName: '',
      isActive: true,
      avatarUrl: '',
      googleAvatarUrl: '',
      memberColor: '#4ECDC4',
      selectedFile: null,
      authProvider: ''
    });
    setError(null);
  };

  const handleCancelAddUser = () => {
    setShowAddUserForm(false);
    setNewUser({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      displayName: '',
      role: 'user'
    });
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
      const errorMessage = err.response?.data?.error || 'Failed to test email configuration';
      setError(errorMessage);
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
          <p className="text-gray-600">You don't have permission to access this page.</p>
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
            {['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities'].map((tab) => (
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
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white shadow rounded-lg">
          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Users</h2>
                    <p className="text-gray-600">
                      Manage user accounts and permissions. Regular users can only manage their own profile information, 
                      while administrators have full access to manage all content, users, and site settings.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddUserForm(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2"
                  >
                    <UserIcon size={16} />
                    Add User
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Avatar</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">DISPLAY NAME</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">AUTH TYPE</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Color</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Joined</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Array.isArray(users) && users.length > 0 ? (
                      users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap w-16">
                          <div className="flex-shrink-0 h-10 w-10">
                            {(user.googleAvatarUrl || user.avatarUrl) ? (
                              <img
                                src={user.googleAvatarUrl || user.avatarUrl}
                                alt={`${user.firstName} ${user.lastName}`}
                                className="h-10 w-10 rounded-full object-cover border-2 border-gray-200"
                              />
                            ) : (
                              <div 
                                className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium text-white"
                                style={{ backgroundColor: user.memberColor || '#4ECDC4' }}
                              >
                                {user.firstName?.[0]}{user.lastName?.[0]}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap w-32">
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-48">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-32">
                          {user.displayName || `${user.firstName} ${user.lastName}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap w-20">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.roles.includes('admin') 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.roles.includes('admin') ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-24">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.authProvider === 'google' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.authProvider === 'google' ? 'Google' : 'Local'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap w-20">
                          {showColorPicker === user.id ? (
                            <div className="relative">
                              <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 min-w-[120px]">
                                {/* Color picker */}
                                <div className="flex justify-center mb-3">
                                  <input
                                    type="color"
                                    value={editingColor}
                                    onChange={(e) => setEditingColor(e.target.value)}
                                    className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                                  />
                                </div>
                                
                                {/* Buttons positioned below, outside the picker area */}
                                <div className="flex space-x-2 justify-center">
                                  <button
                                    onClick={() => handleSaveColor(user.id)}
                                    className="px-3 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded transition-colors font-medium"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={handleCancelColor}
                                    className="px-3 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="w-6 h-6 rounded-full border-2 border-gray-200 cursor-pointer hover:scale-110 transition-transform"
                              style={{ backgroundColor: user.memberColor || '#4ECDC4' }}
                              onClick={() => handleColorChange(user.id, user.memberColor || '#4ECDC4')}
                              title="Click to change color"
                            />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 w-28">
                          {user.joined}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium w-48">
                          <div className="flex items-center space-x-2">
                            {user.roles.includes('admin') ? (
                              <button
                                onClick={() => handleRoleChange(user.id, 'demote')}
                                disabled={user.id === currentUser?.id}
                                className={`p-1.5 rounded transition-colors group relative ${
                                  user.id === currentUser?.id
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-red-600 hover:text-red-900 hover:bg-red-50'
                                }`}
                                title={user.id === currentUser?.id ? 'You cannot demote yourself' : 'Demote to user'}
                              >
                                <UserIcon size={16} />
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                  {user.id === currentUser?.id ? 'You cannot demote yourself' : 'Demote to user'}
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRoleChange(user.id, 'promote')}
                                className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors group relative"
                                title="Promote to admin"
                              >
                                <Crown size={16} />
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                  Promote to admin
                                </span>
                              </button>
                            )}
                            <button 
                              onClick={() => handleEditUser(user)}
                              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                              title="Edit user"
                            >
                              <Edit size={16} />
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={user.id === currentUser?.id}
                                className={`p-1.5 rounded transition-colors ${
                                  user.id === currentUser?.id
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-red-600 hover:text-red-900 hover:bg-red-50'
                                }`}
                                title={user.id === currentUser?.id ? 'You cannot delete your own account' : 'Delete user'}
                              >
                                <Trash2 size={16} />
                              </button>
                              
                              {/* Delete Confirmation Menu */}
                              {showDeleteConfirm === user.id && (
                                <div className="delete-confirmation absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 min-w-[180px]">
                                  <div className="text-sm text-gray-700 mb-2">
                                    {userTaskCounts[user.id] > 0 ? (
                                      <>
                                        <div className="font-medium mb-1">Delete user?</div>
                                        <div className="text-xs text-gray-700">
                                          <span className="text-red-600 font-medium">
                                            {userTaskCounts[user.id]} task{userTaskCounts[user.id] !== 1 ? 's' : ''}
                                          </span>{' '}
                                          will be removed for{' '}
                                          <span className="font-medium">{user.email}</span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="font-medium mb-1">Delete user?</div>
                                        <div className="text-xs text-gray-600">
                                          No tasks will be affected for{' '}
                                          <span className="font-medium">{user.email}</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => confirmDeleteUser(user.id)}
                                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={cancelDeleteUser}
                                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                          {loading ? 'Loading users...' : 'No users found'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Add User Modal */}
              {showAddUserForm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                  <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                    <div className="mt-3">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="user@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                          <input
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Enter password"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                          <input
                            type="text"
                            value={newUser.firstName}
                            onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="First Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                          <input
                            type="text"
                            value={newUser.lastName}
                            onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Last Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                          <input
                            type="text"
                            value={newUser.displayName || `${newUser.firstName} ${newUser.lastName}`}
                            onChange={(e) => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Display Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                          <select
                            value={newUser.role}
                            onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex space-x-3 mt-6">
                        <button
                          onClick={handleAddUser}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          Create User
                        </button>
                        <button
                          onClick={handleCancelAddUser}
                          className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Edit User Modal */}
              {showEditUserForm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                  <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                    <div className="mt-3">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Edit User</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                          <input
                            type="text"
                            value={editingUserData.firstName}
                            onChange={(e) => setEditingUserData(prev => ({ ...prev, firstName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="First Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                          <input
                            type="text"
                            value={editingUserData.lastName}
                            onChange={(e) => setEditingUserData(prev => ({ ...prev, lastName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Last Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                          <input
                            type="text"
                            value={editingUserData.displayName}
                            onChange={(e) => setEditingUserData(prev => ({ ...prev, displayName: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Display Name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={editingUserData.email}
                            onChange={(e) => setEditingUserData(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="user@example.com"
                          />
                        </div>
                        <div>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editingUserData.isActive}
                              onChange={(e) => setEditingUserData(prev => ({ ...prev, isActive: e.target.checked }))}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">Active</span>
                          </label>
                        </div>
                        
                        {/* Avatar Section */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Avatar</label>
                          <div className="flex items-center space-x-3">
                            {/* Current Avatar Display */}
                            <div className="flex-shrink-0">
                              {(editingUserData.googleAvatarUrl || editingUserData.avatarUrl) ? (
                                <img
                                  src={editingUserData.googleAvatarUrl || editingUserData.avatarUrl}
                                  alt="User avatar"
                                  className="w-12 h-12 rounded-full border-2 border-gray-200"
                                />
                              ) : (
                                <div 
                                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                                  style={{ backgroundColor: editingUserData.memberColor || '#4ECDC4' }}
                                >
                                  {editingUserData.firstName?.charAt(0)}{editingUserData.lastName?.charAt(0)}
                                </div>
                              )}
                            </div>
                            
                            {/* Avatar Upload Controls - Only for local users */}
                            {editingUserData.authProvider === 'local' ? (
                              <div className="flex-1 space-y-2">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleUserAvatarSelect}
                                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {editingUserData.avatarUrl && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUserAvatar(editingUserData.id)}
                                    className="text-sm text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                  >
                                    Remove Avatar
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex-1">
                                <div className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-200">
                                  <p className="text-blue-800 font-medium">Google Account</p>
                                  <p className="text-blue-700 text-xs mt-1">
                                    Avatar managed by Google account
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-3 mt-6">
                        <button
                          onClick={handleSaveUser}
                          disabled={isSubmitting}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={handleCancelEditUser}
                          disabled={isSubmitting}
                          className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Site Settings Tab */}
          {activeTab === 'site-settings' && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Site Settings</h2>
                <p className="text-gray-600">
                  Configure basic site information that appears throughout the application.
                </p>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Site Name
                  </label>
                  <input
                    type="text"
                    value={editingSettings.SITE_NAME || ''}
                    onChange={(e) => setEditingSettings(prev => ({ ...prev, SITE_NAME: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter site name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Site URL
                  </label>
                  <input
                    type="url"
                    value={editingSettings.SITE_URL || ''}
                    onChange={(e) => setEditingSettings(prev => ({ ...prev, SITE_URL: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://example.com"
                  />
                </div>
                
                {/* Success and Error Messages for Site Settings */}
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
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelSettings}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Single Sign-On Tab */}
          {activeTab === 'sso' && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Single Sign-On Configuration</h2>
                <p className="text-gray-600">
                  Configure Google OAuth authentication. Changes are applied immediately without requiring a restart.
                </p>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Client ID
                  </label>
                  <input
                    type="text"
                    value={editingSettings.GOOGLE_CLIENT_ID || ''}
                    onChange={(e) => setEditingSettings(prev => ({ ...prev, GOOGLE_CLIENT_ID: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter Google OAuth Client ID"
                  />
                                      <p className="mt-1 text-sm text-gray-500">
                      Found in your Google Cloud Console under APIs & Services &gt; Credentials
                    </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Client Secret
                  </label>
                  <input
                    type="password"
                    value={editingSettings.GOOGLE_CLIENT_SECRET || ''}
                    onChange={(e) => setEditingSettings(prev => ({ ...prev, GOOGLE_CLIENT_SECRET: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter Google OAuth Client Secret"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Keep this secret secure. Changes are applied immediately.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Callback URL
                  </label>
                  <input
                    type="text"
                    value={editingSettings.GOOGLE_CALLBACK_URL || ''}
                    onChange={(e) => setEditingSettings(prev => ({ ...prev, GOOGLE_CALLBACK_URL: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., https://yourdomain.com/auth/google/callback"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    This must match exactly what you configure in Google Cloud Console. Include the full URL with protocol.
                  </p>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">Hot Reload Enabled</h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          Google OAuth settings are automatically reloaded when you save changes. 
                          No application restart is required.
                        </p>
                        <p className="mt-1">
                          <strong>Tip:</strong> Use the "Reload OAuth Config" button if you need to force a reload.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Success and Error Messages for SSO */}
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
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Save Configuration
                  </button>
                  <button
                    onClick={handleReloadOAuth}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    🔄 Reload OAuth Config
                  </button>
                  <button
                    onClick={handleCancelSettings}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mail Server Tab */}
          {activeTab === 'mail-server' && (
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
                      onChange={(e) => setEditingSettings(prev => ({ 
                        ...prev, 
                        MAIL_ENABLED: e.target.checked ? 'true' : 'false' 
                      }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_HOST: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_PORT: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_USERNAME: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_PASSWORD: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_FROM_EMAIL: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_FROM_NAME: e.target.value }))}
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
                        onChange={(e) => setEditingSettings(prev => ({ ...prev, SMTP_SECURE: e.target.value }))}
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
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Save Configuration
                  </button>
                  <button
                    onClick={handleCancelSettings}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTestEmail}
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
          )}

          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Tags Management</h2>
                    <p className="text-gray-600">
                      Create and manage tags for organizing tasks. Tags can have custom colors and descriptions.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddTagForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Add Tag
                  </button>
                </div>
              </div>

              {/* Tags Table */}
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Tag</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Color</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Array.isArray(tags) && tags.length > 0 ? (
                      tags.map((tag) => (
                        <tr key={tag.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: tag.color || '#4ECDC4' }}
                              />
                              <span className="text-sm font-medium text-gray-900">{tag.tag}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">{tag.description || '-'}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div 
                              className="w-6 h-6 rounded-full border-2 border-gray-200"
                              style={{ backgroundColor: tag.color || '#4ECDC4' }}
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setEditingTag(tag);
                                  setShowEditTagForm(true);
                                }}
                                className="p-1.5 rounded transition-colors text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                title="Edit tag"
                              >
                                <Edit size={16} />
                              </button>
                              <div className="relative">
                                <button
                                  onClick={() => handleDeleteTag(tag.id)}
                                  className="p-1.5 rounded transition-colors text-red-600 hover:text-red-900 hover:bg-red-50"
                                  title="Delete tag"
                                >
                                  <Trash2 size={16} />
                                </button>
                                
                                {/* Delete Tag Confirmation Menu */}
                                {showDeleteTagConfirm === tag.id && (
                                  <div className="delete-confirmation absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[200px]">
                                    <div className="text-sm text-gray-700 mb-2">
                                      {tagUsageCounts[tag.id] > 0 ? (
                                        <>
                                          <div className="font-medium mb-1">Delete tag?</div>
                                          <div className="text-xs text-gray-700">
                                            <span className="text-red-600 font-medium">
                                              {tagUsageCounts[tag.id]} task{tagUsageCounts[tag.id] !== 1 ? 's' : ''}
                                            </span>{' '}
                                            will lose this tag:{' '}
                                            <span className="font-medium">{tag.tag}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="font-medium mb-1">Delete tag?</div>
                                          <div className="text-xs text-gray-600">
                                            No tasks will be affected for{' '}
                                            <span className="font-medium">{tag.tag}</span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex space-x-2">
                                      <button
                                        onClick={() => confirmDeleteTag(tag.id)}
                                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                      >
                                        Yes
                                      </button>
                                      <button
                                        onClick={cancelDeleteTag}
                                        className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                                      >
                                        No
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                          {loading ? 'Loading tags...' : 'No tags found'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Priorities Tab */}
          {activeTab === 'priorities' && (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Priorities Management</h2>
                    <p className="text-gray-600">
                      Create and manage priority levels for tasks. Each priority has a custom color for visual identification.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddPriorityForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Add Priority
                  </button>
                </div>
              </div>

              {/* Priorities Table with Drag and Drop */}
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePriorityDragEnd}
                >
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Priority</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Preview</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
                      </tr>
                    </thead>
                    <SortableContext
                      items={priorities.map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody className="bg-white divide-y divide-gray-200">
                        {Array.isArray(priorities) && priorities.length > 0 ? (
                          priorities.map((priority) => (
                            <SortablePriorityRow key={priority.id} priority={priority} />
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                              {loading ? 'Loading priorities...' : 'No priorities found'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Add Tag Modal */}
      {showAddTagForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Tag</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setIsSubmitting(true);
                  await createTag(newTag);
                  const updatedTags = await getTags();
                  setTags(updatedTags);
                  setShowAddTagForm(false);
                  setNewTag({ tag: '', description: '', color: '#4ECDC4' });
                  setSuccessMessage('Tag created successfully');
                } catch (error: any) {
                  setError(error.response?.data?.error || 'Failed to create tag');
                } finally {
                  setIsSubmitting(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name *</label>
                    <input
                      type="text"
                      required
                      value={newTag.tag}
                      onChange={(e) => setNewTag(prev => ({ ...prev, tag: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter tag name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={newTag.description}
                      onChange={(e) => setNewTag(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={newTag.color}
                        onChange={(e) => setNewTag(prev => ({ ...prev, color: e.target.value }))}
                        className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2">
                        {presetColors.slice(0, 8).map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewTag(prev => ({ ...prev, color }))}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Tag'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTagForm(false);
                      setNewTag({ tag: '', description: '', color: '#4ECDC4' });
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tag Modal */}
      {showEditTagForm && editingTag && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Tag</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setIsSubmitting(true);
                  await updateTag(editingTag.id, {
                    tag: editingTag.tag,
                    description: editingTag.description,
                    color: editingTag.color
                  });
                  const updatedTags = await getTags();
                  setTags(updatedTags);
                  setShowEditTagForm(false);
                  setEditingTag(null);
                  setSuccessMessage('Tag updated successfully');
                } catch (error: any) {
                  setError(error.response?.data?.error || 'Failed to update tag');
                } finally {
                  setIsSubmitting(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name *</label>
                    <input
                      type="text"
                      required
                      value={editingTag.tag}
                      onChange={(e) => setEditingTag(prev => ({ ...prev, tag: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter tag name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={editingTag.description || ''}
                      onChange={(e) => setEditingTag(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={editingTag.color || '#4ECDC4'}
                        onChange={(e) => setEditingTag(prev => ({ ...prev, color: e.target.value }))}
                        className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2">
                        {presetColors.slice(0, 8).map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditingTag(prev => ({ ...prev, color }))}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditTagForm(false);
                      setEditingTag(null);
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Priority Modal */}
      {showAddPriorityForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Priority</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setIsSubmitting(true);
                  await createPriority(newPriority);
                  const updatedPriorities = await getPriorities();
                  setPriorities(updatedPriorities);
                  setShowAddPriorityForm(false);
                  setNewPriority({ priority: '', color: '#4CD964' });
                  setSuccessMessage('Priority created successfully');
                } catch (error: any) {
                  setError(error.response?.data?.error || 'Failed to create priority');
                } finally {
                  setIsSubmitting(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority Name *</label>
                    <input
                      type="text"
                      required
                      value={newPriority.priority}
                      onChange={(e) => setNewPriority(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter priority name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color *</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        required
                        value={newPriority.color}
                        onChange={(e) => setNewPriority(prev => ({ ...prev, color: e.target.value }))}
                        className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2">
                        {presetColors.slice(0, 8).map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewPriority(prev => ({ ...prev, color }))}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Priority'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPriorityForm(false);
                      setNewPriority({ priority: '', color: '#4CD964' });
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Priority Modal */}
      {showEditPriorityForm && editingPriority && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Priority</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setIsSubmitting(true);
                  await updatePriority(editingPriority.id, {
                    priority: editingPriority.priority,
                    color: editingPriority.color
                  });
                  const updatedPriorities = await getPriorities();
                  setPriorities(updatedPriorities);
                  setShowEditPriorityForm(false);
                  setEditingPriority(null);
                  setSuccessMessage('Priority updated successfully');
                } catch (error: any) {
                  setError(error.response?.data?.error || 'Failed to update priority');
                } finally {
                  setIsSubmitting(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority Name *</label>
                    <input
                      type="text"
                      required
                      value={editingPriority.priority}
                      onChange={(e) => setEditingPriority(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter priority name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color *</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        required
                        value={editingPriority.color}
                        onChange={(e) => setEditingPriority(prev => ({ ...prev, color: e.target.value }))}
                        className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-2">
                        {presetColors.slice(0, 8).map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditingPriority(prev => ({ ...prev, color }))}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditPriorityForm(false);
                      setEditingPriority(null);
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
                  onClick={() => setShowTestEmailModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
