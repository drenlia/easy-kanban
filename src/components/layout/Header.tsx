import React from 'react';
import { Github, HelpCircle, LogOut, User, RefreshCw } from 'lucide-react';
import { CurrentUser, SiteSettings, TeamMember } from '../../types';

interface HeaderProps {
  currentUser: CurrentUser | null;
  siteSettings: SiteSettings;
  currentPage: 'kanban' | 'admin';
  isPolling: boolean;
  lastPollTime: Date | null;
  members: TeamMember[];
  onProfileClick: () => void;
  onLogout: () => void;
  onPageChange: (page: 'kanban' | 'admin') => void;
  onRefresh: () => Promise<void>;
  onHelpClick: () => void;
}

const Header: React.FC<HeaderProps> = ({
  currentUser,
  siteSettings,
  currentPage,
  isPolling,
  lastPollTime,
  members,
  onProfileClick,
  onLogout,
  onPageChange,
  onRefresh,
  onHelpClick,
}) => {
  const handleRefresh = async () => {
    try {
      await onRefresh();
    } catch (error) {
      console.error('Manual refresh failed:', error);
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <a 
            href={siteSettings.SITE_URL || '#'} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
          >
            {siteSettings.SITE_NAME || 'Easy Kanban'}
          </a>
        </div>
        
        <div className="flex items-center gap-3">
          {currentUser && (
            <>
              <div className="flex items-center gap-2">
                {/* User Avatar */}
                <div className="relative group">
                  <button
                    className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                    onClick={onProfileClick}
                    title="Profile Settings"
                  >
                    {currentUser?.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt="Profile"
                        className="h-8 w-8 rounded-full object-cover"
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
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
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
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                  >
                    Admin
                  </button>
                )}
              </div>
            </>
          )}
          
          {/* Simple polling status indicator */}
          <div 
            className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs ${
              isPolling 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-gray-100 text-gray-500'
            }`}
            title={
              isPolling 
                ? 'Auto-refresh active (3s interval)'
                : 'Auto-refresh paused'
            }
          >
            <div className={`w-2 h-2 rounded-full ${
              isPolling ? 'bg-blue-500' : 'bg-gray-400'
            }`} />
            <span className="hidden sm:inline">
              {isPolling ? 'Auto-refresh' : 'Manual'}
            </span>
            {lastPollTime && (
              <span className="text-xs opacity-60 hidden md:inline">
                {lastPollTime.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  second: '2-digit' 
                })}
              </span>
            )}
          </div>
          
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
