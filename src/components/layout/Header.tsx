import React, { useState, useRef, useEffect } from 'react';
import { Github, HelpCircle, LogOut, User, RefreshCw, UserPlus, Mail, X, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { CurrentUser, SiteSettings, TeamMember } from '../../types';
import ThemeToggle from '../ThemeToggle';
import { getAuthenticatedAvatarUrl } from '../../utils/authImageUrl';

interface HeaderProps {
  currentUser: CurrentUser | null;
  siteSettings: SiteSettings;
  currentPage: 'kanban' | 'admin';
  // isPolling: boolean; // Removed - using real-time WebSocket updates
  // lastPollTime: Date | null; // Removed - using real-time WebSocket updates
  members: TeamMember[];
  onProfileClick: () => void;
  onLogout: () => void;
  onPageChange: (page: 'kanban' | 'admin') => void;
  onRefresh: () => Promise<void>;
  onHelpClick: () => void;
  onInviteUser?: (email: string) => Promise<void>;
  // Auto-refresh toggle - DISABLED (using real-time updates)
  // isAutoRefreshEnabled: boolean;
  // onToggleAutoRefresh: () => void;
}

const Header: React.FC<HeaderProps> = ({
  currentUser,
  siteSettings,
  currentPage,
  // isPolling, // Removed - using real-time WebSocket updates
  // lastPollTime, // Removed - using real-time WebSocket updates
  members,
  onProfileClick,
  onLogout,
  onPageChange,
  onRefresh,
  onHelpClick,
  onInviteUser,
  // isAutoRefreshEnabled, // Disabled - using real-time updates
  // onToggleAutoRefresh, // Disabled - using real-time updates
}) => {
  const [showInviteDropdown, setShowInviteDropdown] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const inviteDropdownRef = useRef<HTMLDivElement>(null);

  const handleRefresh = async () => {
    try {
      await onRefresh();
    } catch (error) {
      console.error('Manual refresh failed:', error);
    }
  };

  // Close invite dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inviteDropdownRef.current && !inviteDropdownRef.current.contains(event.target as Node)) {
        setShowInviteDropdown(false);
        setInviteEmail('');
        setInviteError('');
        setInviteSuccess('');
      }
    };

    if (showInviteDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showInviteDropdown]);

  const handleInviteClick = () => {
    setShowInviteDropdown(!showInviteDropdown);
    setInviteEmail('');
    setInviteError('');
    setInviteSuccess('');
  };

  const handleInviteCancel = () => {
    setShowInviteDropdown(false);
    setInviteEmail('');
    setInviteError('');
    setInviteSuccess('');
  };

  const handleInviteSend = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      setInviteError('Please enter a valid email address');
      return;
    }

    if (!onInviteUser) {
      setInviteError('Invite functionality not available');
      return;
    }

    setIsInviting(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      await onInviteUser(inviteEmail.trim());
      setInviteSuccess('Invitation sent successfully!');
      setInviteEmail('');
      setTimeout(() => {
        setShowInviteDropdown(false);
        setInviteSuccess('');
      }, 2000);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleInviteKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInviteSend();
    } else if (e.key === 'Escape') {
      handleInviteCancel();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
      <div className="w-4/5 mx-auto px-6 py-2.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <a 
            href={siteSettings.SITE_URL || '#'} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {siteSettings.SITE_NAME || 'Easy Kanban'}
          </a>
        </div>
        
        <div className="flex items-center gap-3">
          {currentUser && (
            <>
              {/* Invite Button */}
              {currentUser.roles?.includes('admin') && onInviteUser && (
                <div className="relative" ref={inviteDropdownRef}>
                  <button
                    onClick={handleInviteClick}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-md transition-colors border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                    title="Invite User"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite
                  </button>

                  {/* Invite Dropdown */}
                  {showInviteDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Mail className="h-4 w-4 text-blue-600" />
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Invite New User</h3>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              onKeyDown={handleInviteKeyPress}
                              placeholder="Enter email address"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              disabled={isInviting}
                              autoFocus
                            />
                          </div>
                          
                          {inviteError && (
                            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900 px-2 py-1 rounded">
                              {inviteError}
                            </div>
                          )}
                          
                          {inviteSuccess && (
                            <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900 px-2 py-1 rounded">
                              {inviteSuccess}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={handleInviteSend}
                              disabled={isInviting || !inviteEmail.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isInviting ? (
                                <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                              ) : (
                                <Send className="h-3 w-3" />
                              )}
                              {isInviting ? 'Sending...' : 'Send'}
                            </button>
                            <button
                              onClick={handleInviteCancel}
                              disabled={isInviting}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-2">
                {/* User Avatar */}
                <div className="relative group">
                  <button
                    className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                    onClick={onProfileClick}
                    title="Profile Settings"
                  >
                    {currentUser?.googleAvatarUrl || currentUser?.avatarUrl ? (
                      <img
                        src={getAuthenticatedAvatarUrl(currentUser.googleAvatarUrl || currentUser.avatarUrl)}
                        alt="Profile"
                        className="h-8 w-8 rounded-full object-cover"
                        onError={(e) => {
                          // Fallback to initials if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'h-8 w-8 rounded-full flex items-center justify-center';
                            fallback.style.backgroundColor = members.find(m => m.user_id === currentUser?.id)?.color || '#4ECDC4';
                            const initials = document.createElement('span');
                            initials.className = 'text-sm font-medium text-white';
                            initials.textContent = `${currentUser.firstName?.[0] || ''}${currentUser.lastName?.[0] || ''}`;
                            fallback.appendChild(initials);
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div 
                        className="h-8 w-8 rounded-full flex items-center justify-center"
                        style={{ 
                          backgroundColor: members.find(m => m.user_id === currentUser?.id)?.color || '#4ECDC4' 
                        }}
                      >
                        <span className="text-sm font-medium text-white">
                          {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
                        </span>
                      </div>
                    )}
                  </button>
                  
                  {/* Profile Dropdown */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg z-50 border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <div className="py-1">
                      <button
                        onClick={onProfileClick}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <User size={16} />
                        Profile
                      </button>
                      <button
                        onClick={onLogout}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Navigation */}
              <div className="flex items-center gap-2 ml-4">
                {currentUser.roles?.includes('admin') && (
                  <button
                    onClick={() => onPageChange('kanban')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      currentPage === 'kanban'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                  >
                    Kanban
                  </button>
                )}
                {currentUser.roles?.includes('admin') && (
                  <button
                    onClick={() => onPageChange('admin')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      currentPage === 'admin'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                  >
                    Admin
                  </button>
                )}
              </div>
            </>
          )}
          
          {/* Auto-refresh toggle */}
          {/* Auto-refresh toggle - DISABLED (using real-time updates) */}
          {/* <button
            onClick={onToggleAutoRefresh}
            className="p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title={isAutoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            {isAutoRefreshEnabled ? (
              <ToggleRight size={16} className="text-blue-500" />
            ) : (
              <ToggleLeft size={16} className="text-gray-400" />
            )}
          </button> */}
          
          {/* Theme toggle */}
          <ThemeToggle />
          
          {/* Polling status indicator removed - using real-time WebSocket updates */}
          
          {/* Manual refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-gray-500 hover:text-gray-700"
            title="Refresh data now"
          >
            <RefreshCw size={16} />
          </button>
          
          <button
            onClick={onHelpClick}
            className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-gray-500 hover:text-gray-700"
            title="Help (F1)"
          >
            <HelpCircle size={20} />
          </button>
          
          <a
            href="https://github.com/drenlia/easy-kanban"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Github size={20} />
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
