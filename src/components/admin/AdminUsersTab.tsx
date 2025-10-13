import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Edit, Trash2, Crown, User as UserIcon } from 'lucide-react';
import { getAuthenticatedAvatarUrl } from '../../utils/authImageUrl';

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

interface AdminUsersTabProps {
  users: User[];
  loading: boolean;
  currentUser: any;
  showDeleteConfirm: string | null;
  userTaskCounts: { [userId: string]: number };
  onRoleChange: (userId: string, action: 'promote' | 'demote') => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onConfirmDeleteUser: (userId: string) => Promise<void>;
  onCancelDeleteUser: () => void;
  onAddUser: (userData: any) => Promise<void>;
  onEditUser: (user: User) => void;
  onSaveUser: (userData: any) => Promise<void>;
  onColorChange: (userId: string, color: string) => Promise<void>;
  onRemoveAvatar: (userId: string) => Promise<void>;
  onResendInvitation: (userId: string) => Promise<void>;
  successMessage: string | null;
  error: string | null;
}

const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users,
  loading,
  currentUser,
  showDeleteConfirm,
  userTaskCounts,
  onRoleChange,
  onDeleteUser,
  onConfirmDeleteUser,
  onCancelDeleteUser,
  onAddUser,
  onEditUser,
  onSaveUser,
  onColorChange,
  onRemoveAvatar,
  onResendInvitation,
  successMessage,
  error,
}) => {
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showEditUserForm, setShowEditUserForm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>('#4ECDC4');
  const [originalColor, setOriginalColor] = useState<string>('#4ECDC4');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isResendingInvitation, setIsResendingInvitation] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccessMessage, setLocalSuccessMessage] = useState<string | null>(null);
  const [colorPickerPosition, setColorPickerPosition] = useState<{top: number, left: number, userId: string} | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  
  // Refs for button positioning and focus
  const deleteButtonRefs = useRef<{[key: string]: HTMLButtonElement | null}>({});
  const colorButtonRefs = useRef<{[key: string]: HTMLButtonElement | null}>({});
  const noButtonRef = useRef<HTMLButtonElement>(null);
  const [deleteButtonPosition, setDeleteButtonPosition] = useState<{top: number, left: number, userId: string} | null>(null);
  
  // Focus the "No" button when any delete dialog opens and handle Enter key
  useEffect(() => {
    if (showDeleteConfirm) {
      // Small delay to ensure the dialog has rendered
      setTimeout(() => {
        noButtonRef.current?.focus();
      }, 50);
    }
  }, [showDeleteConfirm]);

  // Handle click outside to close color picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColorPicker && colorPickerPosition) {
        const target = event.target as Element;
        // Check if click is outside the color picker and not on a color button
        if (!target.closest('.color-picker-portal') && 
            !colorButtonRefs.current[showColorPicker]?.contains(target)) {
          setShowColorPicker(null);
          setColorPickerPosition(null);
        }
      }
    };

    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker, colorPickerPosition]);

  // Cleanup preview URL on component unmount
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  // Handle Enter and ESC keys to choose "No"/cancel by default for all users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        setDeleteButtonPosition(null);
        onCancelDeleteUser();
      }
    };

    if (showDeleteConfirm) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDeleteConfirm, onCancelDeleteUser]);
  
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

  const handleColorChange = (userId: string, currentColor: string, event: React.MouseEvent) => {
    setEditingColor(currentColor);
    setOriginalColor(currentColor);
    
    // Calculate position for the color picker
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const pickerHeight = 120; // Approximate height of the color picker
    
    // Check if there's enough space below the button
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    
    let top: number;
    let left: number;
    
    if (spaceBelow >= pickerHeight + 10) {
      // Position below the button
      top = buttonRect.bottom + 10;
    } else if (spaceAbove >= pickerHeight + 10) {
      // Position above the button
      top = buttonRect.top - pickerHeight - 10;
    } else {
      // Position in the center of the viewport
      top = Math.max(10, (viewportHeight - pickerHeight) / 2);
    }
    
    // Center horizontally relative to the button
    left = buttonRect.left + (buttonRect.width / 2) - 60; // 60 is half the picker width
    
    // Ensure the picker doesn't go off the left or right edge
    left = Math.max(10, Math.min(left, window.innerWidth - 120));
    
    setColorPickerPosition({ top, left, userId });
    setShowColorPicker(userId);
  };

  const handleSaveColor = async (userId: string) => {
    try {
      await onColorChange(userId, editingColor);
      setShowColorPicker(null);
    } catch (err) {
      console.error('Failed to save color:', err);
    }
  };

  const handleCancelColor = () => {
    setShowColorPicker(null);
    setEditingColor(originalColor);
  };

  const handleUserAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.error('Please select an image file');
        return;
      }
      
      // Validate file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        console.error('Image size must be less than 2MB');
        return;
      }

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreviewUrl(previewUrl);

      setEditingUserData(prev => ({ ...prev, selectedFile: file }));
    }
  };

  const handleAddUser = async () => {
    try {
      setLocalError(null);
      setLocalSuccessMessage(null);
      await onAddUser(newUser);
      setShowAddUserForm(false);
      setNewUser({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        displayName: '',
        role: 'user'
      });
      setLocalSuccessMessage('User created successfully');
    } catch (err: any) {
      console.error('Failed to add user:', err);
      const errorMessage = err.response?.data?.error || 'Failed to create user';
      setLocalError(errorMessage);
    }
  };

  const handleEditUserClick = (user: User) => {
    // Clean up any existing preview URL
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
    }
    
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
    onEditUser(user);
  };

  const handleSaveUser = async () => {
    try {
      setIsSubmitting(true);
      setLocalError(null);
      await onSaveUser(editingUserData);
      
      // Clean up preview URL after successful save
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        setAvatarPreviewUrl(null);
      }
      
      setShowEditUserForm(false);
    } catch (err: any) {
      console.error('Failed to save user:', err);
      const errorMessage = err.response?.data?.error || 'Failed to update user';
      setLocalError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEditUser = () => {
    // Clean up preview URL
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
    }
    
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
  };

  const handleResendInvitation = async () => {
    try {
      setIsResendingInvitation(true);
      setLocalError(null);
      await onResendInvitation(editingUserData.id);
      setLocalSuccessMessage('Invitation email sent successfully!');
      // Clear success message after 3 seconds
      setTimeout(() => setLocalSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to resend invitation:', err);
      const errorMessage = err.response?.data?.error || 'Failed to send invitation email';
      setLocalError(errorMessage);
    } finally {
      setIsResendingInvitation(false);
    }
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
    setLocalError(null);
    setLocalSuccessMessage(null);
  };

  const handleNewUserChange = (field: string, value: string) => {
    setNewUser(prev => ({ ...prev, [field]: value }));
    // Clear local error when user starts typing
    if (localError) {
      setLocalError(null);
    }
  };

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Users</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Manage user accounts and permissions. Regular users can only manage their own profile information, 
                while administrators have full access to manage all content, users, and site settings.
              </p>
            </div>
            <button
              onClick={() => {
                setShowAddUserForm(true);
                setLocalError(null);
                setLocalSuccessMessage(null);
              }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2"
            >
              <UserIcon size={16} />
              Add User
            </button>
          </div>
        </div>

        {/* Success and Error Messages */}
        {(successMessage || localSuccessMessage) && (
          <div className="mb-6 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400 dark:text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">{localSuccessMessage || successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {(error || localError) && (
          <div className="mb-6 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{localError || error}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Avatar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">DISPLAY NAME</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">AUTH TYPE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Color</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {Array.isArray(users) && users.length > 0 ? (
                users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap w-16">
                    <div className="flex-shrink-0 h-10 w-10">
                      {(user.googleAvatarUrl || user.avatarUrl) ? (
                        <img
                          src={getAuthenticatedAvatarUrl(user.googleAvatarUrl || user.avatarUrl)}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="h-10 w-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
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
                  <td className="px-6 py-4 whitespace-nowrap w-20">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap w-32">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {user.firstName} {user.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-48">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-32">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-24">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.authProvider === 'google' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.authProvider === 'google' ? 'Google' : 'Local'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap w-20">
                    <div 
                      ref={(el) => { colorButtonRefs.current[user.id] = el; }}
                      className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: user.memberColor || '#4ECDC4' }}
                      onClick={(e) => handleColorChange(user.id, user.memberColor || '#4ECDC4', e)}
                      title="Click to change color"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 w-28">
                    {user.joined}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium w-48">
                    <div className="flex items-center space-x-2">
                      {user.roles.includes('admin') ? (
                        <button
                          onClick={() => onRoleChange(user.id, 'demote')}
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
                          onClick={() => onRoleChange(user.id, 'promote')}
                          className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 dark:hover:bg-green-900 rounded transition-colors group relative"
                          title="Promote to admin"
                        >
                          <Crown size={16} />
                          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            Promote to admin
                          </span>
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditUserClick(user)}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Edit user"
                      >
                        <Edit size={16} />
                      </button>
                      <div className="relative">
                        <button
                          ref={(el) => {
                            deleteButtonRefs.current[user.id] = el;
                          }}
                          onClick={(e) => {
                            if (user.id === currentUser?.id) return;
                            
                            const rect = e.currentTarget.getBoundingClientRect();
                            setDeleteButtonPosition({
                              top: rect.bottom + 5,
                              left: rect.right - 200, // Adjust positioning to ensure visibility
                              userId: user.id
                            });
                            onDeleteUser(user.id);
                          }}
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
                        
                      </div>
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    {loading ? 'Loading users...' : 'No users found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add New User</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => handleNewUserChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => handleNewUserChange('password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Enter password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Last Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={newUser.displayName || `${newUser.firstName} ${newUser.lastName}`}
                    onChange={(e) => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Display Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                  Invite User
                </button>
                <button
                  onClick={handleCancelAddUser}
                  className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
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
          <div className="relative top-20 mx-auto p-5 border border-gray-300 dark:border-gray-600 w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Edit User</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editingUserData.firstName}
                    onChange={(e) => setEditingUserData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editingUserData.lastName}
                    onChange={(e) => setEditingUserData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Last Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={editingUserData.displayName}
                    onChange={(e) => setEditingUserData(prev => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Display Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingUserData.email}
                    onChange={(e) => setEditingUserData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                      {avatarPreviewUrl ? (
                        <img
                          src={avatarPreviewUrl}
                          alt="Avatar preview"
                          className="w-12 h-12 rounded-full border-2 border-gray-200"
                        />
                      ) : (editingUserData.googleAvatarUrl || editingUserData.avatarUrl) ? (
                        <img
                          src={getAuthenticatedAvatarUrl(editingUserData.googleAvatarUrl || editingUserData.avatarUrl)}
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
                            onClick={() => onRemoveAvatar(editingUserData.id)}
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
              {/* Show resend invitation button for inactive local users */}
              {editingUserData.authProvider === 'local' && !editingUserData.isActive && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-800">Account Pending Activation</p>
                      <p className="text-xs text-amber-600">This user hasn't activated their account yet.</p>
                    </div>
                    <button
                      onClick={handleResendInvitation}
                      disabled={isResendingInvitation || isSubmitting}
                      className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isResendingInvitation ? 'Sending...' : 'Resend Invitation'}
                    </button>
                  </div>
                </div>
              )}

              {/* Local success/error messages */}
              {localSuccessMessage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">{localSuccessMessage}</p>
                </div>
              )}
              
              {localError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{localError}</p>
                </div>
              )}

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

      {/* Portal-based Delete Confirmation Dialog */}
      {showDeleteConfirm && deleteButtonPosition && deleteButtonPosition.userId === showDeleteConfirm && createPortal(
        <div 
          className="delete-confirmation fixed bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[9999]"
          style={{
            top: `${deleteButtonPosition.top}px`,
            left: `${deleteButtonPosition.left}px`,
            width: users.find(u => u.id === showDeleteConfirm)?.email === 'system@local' ? '320px' : '200px'
          }}
        >
          <div className="text-sm text-gray-700 mb-2 break-words">
            {(() => {
              const user = users.find(u => u.id === showDeleteConfirm);
              if (!user) return null;
              
              if (user.email === 'system@local') {
                return (
                  <>
                    <div className="font-medium mb-1 text-amber-600">⚠️ Delete System User?</div>
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mb-2">
                      <div className="font-medium mb-1">Critical Warning:</div>
                      <div className="break-words overflow-wrap-anywhere whitespace-normal">
                        Deleting the System User will affect users who delete their own accounts. 
                        Their tasks are normally reassigned to this account to preserve project history.
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      Are you absolutely sure you want to proceed?
                    </div>
                  </>
                );
              } else if (userTaskCounts[user.id] > 0) {
                return (
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
                );
              } else {
                return (
                  <>
                    <div className="font-medium mb-1">Delete user?</div>
                    <div className="text-xs text-gray-600">
                      No tasks will be affected for{' '}
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </>
                );
              }
            })()}
          </div>
          <div className="flex space-x-2">
            <button
              ref={noButtonRef}
              onClick={() => {
                onCancelDeleteUser();
                setDeleteButtonPosition(null);
              }}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              No
            </button>
            <button
              onClick={() => {
                onConfirmDeleteUser(showDeleteConfirm);
                setDeleteButtonPosition(null);
              }}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              Yes
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Color Picker Portal */}
      {showColorPicker && colorPickerPosition && colorPickerPosition.userId === showColorPicker && createPortal(
        <div 
          className="color-picker-portal fixed bg-white p-3 rounded-lg shadow-xl border border-gray-200 min-w-[120px] max-w-xs z-[60]"
          style={{
            top: `${colorPickerPosition.top}px`,
            left: `${colorPickerPosition.left}px`
          }}
        >
          {/* Buttons positioned at the top for better visibility */}
          <div className="flex space-x-2 justify-center mb-3">
            <button
              onClick={() => handleSaveColor(showColorPicker)}
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
          
          {/* Color picker positioned below buttons */}
          <div className="flex justify-center">
            <input
              type="color"
              value={editingColor}
              onChange={(e) => setEditingColor(e.target.value)}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default AdminUsersTab;
