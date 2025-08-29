import React, { useState, useEffect } from 'react';
import api, { createUser, updateUser } from '../api';
import { Edit, Trash2, Crown, User as UserIcon, Eye, EyeOff } from 'lucide-react';

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
}

const Admin: React.FC<AdminProps> = ({ currentUser, onUsersChanged, onSettingsChanged }) => {
  const [activeTab, setActiveTab] = useState(() => {
    // Get tab from URL hash, fallback to 'users'
    const hash = window.location.hash.replace('#', '');
    return ['users', 'site-settings', 'sso'].includes(hash) ? hash : 'users';
  });
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    memberColor: '#4ECDC4',
    selectedFile: null as File | null
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
  const [hasDefaultAdmin, setHasDefaultAdmin] = useState<boolean | null>(null);
  
  // Preset colors for easy selection
  const presetColors = [
    '#FF3B30', '#007AFF', '#4CD964', '#FF9500', '#5856D6',
    '#FF2D55', '#00C7BE', '#FFD60A', '#BF5AF2', '#34C759',
    '#FF6B6B', '#1C7ED6', '#845EF7', '#F76707', '#20C997',
    '#E599F7', '#40C057', '#F59F00', '#0CA678', '#FA5252'
  ];
  


  useEffect(() => {
    if (currentUser?.roles?.includes('admin')) {
      loadData();
    }
  }, [currentUser]);

  // Handle URL hash changes for tab selection
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['users', 'site-settings', 'sso'].includes(hash) && hash !== activeTab) {
        setActiveTab(hash);
      }
    };

    // Handle initial hash on component mount
    const initialHash = window.location.hash.replace('#', '');
    if (['users', 'site-settings', 'sso'].includes(initialHash) && initialHash !== activeTab) {
      setActiveTab(initialHash);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersResponse, settingsResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/settings')
      ]);
      
      setUsers(usersResponse.data || []);
      setSettings(settingsResponse.data || {});
      setEditingSettings(settingsResponse.data || {});
      
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

    // Show confirmation menu
    setShowDeleteConfirm(userId);
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

  // Close confirmation menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeleteConfirm && !(event.target as Element).closest('.delete-confirmation')) {
        setShowDeleteConfirm(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDeleteConfirm]);

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
      // Save each setting individually
      for (const [key, value] of Object.entries(editingSettings)) {
        if (value !== settings[key]) {
          await api.put('/admin/settings', { key, value });
        }
      }
      await loadData(); // Reload settings
      
      // Update the parent component's site settings immediately
      if (onSettingsChanged) {
        onSettingsChanged();
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to save settings');
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
      memberColor: user.memberColor || '#4ECDC4',
      selectedFile: null
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
      isActive: true
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
            {['users', 'site-settings', 'sso'].map((tab) => (
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
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
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
                              <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                                <input
                                  type="color"
                                  value={editingColor}
                                  onChange={(e) => setEditingColor(e.target.value)}
                                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                                />
                                <div className="flex flex-col space-y-1">
                                  <button
                                    onClick={() => handleSaveColor(user.id)}
                                    className="px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors font-medium"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    onClick={handleCancelColor}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                                  >
                                    Cancel
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
                                <div className="delete-confirmation absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 min-w-[120px]">
                                  <div className="text-sm text-gray-700 mb-2">Are you sure?</div>
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
                              {editingUserData.avatarUrl ? (
                                <img
                                  src={editingUserData.avatarUrl}
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
                      </div>
                    </div>
                  </div>
                </div>
                
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
