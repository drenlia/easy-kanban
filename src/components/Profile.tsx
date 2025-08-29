import React, { useState, useEffect } from 'react';
import { X, Upload, User } from 'lucide-react';
import { uploadAvatar } from '../api';
import api from '../api';

interface ProfileProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onProfileUpdated: () => void;
}

export default function Profile({ isOpen, onClose, currentUser, onProfileUpdated }: ProfileProps) {
  const [displayName, setDisplayName] = useState(currentUser?.firstName + ' ' + currentUser?.lastName || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setDisplayName(currentUser?.displayName || currentUser?.firstName + ' ' + currentUser?.lastName || '');
      setSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, currentUser]);

  // Handle file selection with live preview
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      setSelectedFile(file);
      setError(null);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  // Handle file removal
  const handleRemoveFile = async () => {
    try {
      // If there's a preview (new file), just clear it
      if (previewUrl) {
        setSelectedFile(null);
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        return;
      }
      
      // If there's an existing avatar, remove it from backend
      if (currentUser?.avatarUrl) {
        setIsSubmitting(true);
        await api.delete('/users/avatar');
        
        // Refresh user data to get updated avatar state
        onProfileUpdated();
      }
    } catch (error) {
      console.error('Failed to remove avatar:', error);
      setError('Failed to remove avatar');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Update display name and upload avatar in parallel if both are needed
      const promises = [
        api.put('/users/profile', { displayName: displayName.trim() })
      ];
      
      if (selectedFile) {
        promises.push(uploadAvatar(selectedFile));
      }
      
      // Wait for all operations to complete
      await Promise.all(promises);

      // Call the callback to refresh user data
      onProfileUpdated();
      
      // Close modal immediately
      onClose();
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update profile');
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
      onClose();
    }
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
    
    if (currentUser?.avatarUrl) {
      return (
        <img
          src={currentUser.avatarUrl}
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
      <div className="relative top-20 mx-auto p-6 border w-[480px] shadow-xl rounded-lg bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Profile Settings</h3>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Profile Picture
              </label>
              <div className="flex items-center space-x-4">
                {/* Avatar Display */}
                <div className="flex-shrink-0 relative">
                  {getAvatarDisplay()}
                  
                  {/* Remove button - only show when there's a file preview or current avatar */}
                  {(previewUrl || currentUser?.avatarUrl) && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                      title="Remove avatar"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                
                {/* Upload Controls */}
                <div className="flex-1 space-y-3">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="avatar-upload"
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="avatar-upload"
                      className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                        isSubmitting
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border-blue-300 hover:border-blue-400'
                      }`}
                    >
                      <Upload size={16} className="mr-2" />
                      {selectedFile ? 'Change Image' : 'Upload Image'}
                    </label>
                  </div>
                  
                  {selectedFile && (
                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      <p className="font-medium">Selected: {selectedFile.name}</p>
                      <p className="text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Supported formats: JPG, PNG, GIF. Max size: 2MB
                  </p>
                </div>
              </div>
            </div>

            {/* Display Name Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter display name"
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 mt-1">
                This name will appear on your tasks and team member list
              </p>
            </div>

            {/* Error Messages */}
            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
                {error}
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
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
