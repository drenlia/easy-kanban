import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Users, ClipboardList, Layout, HardDrive, Shield, ExternalLink } from 'lucide-react';
import api from '../../api';

interface BoardTaskCount {
  id: string;
  title: string;
  taskCount: number;
}

interface LicenseInfo {
  enabled: boolean;
  limits: {
    USER_LIMIT: number;
    TASK_LIMIT: number;
    BOARD_LIMIT: number;
    STORAGE_LIMIT: number;
    SUPPORT_TYPE: string;
  };
  usage: {
    users: number;
    boards: number;
    totalTasks: number;
    storage: number;
  };
  limitsReached: {
    users: boolean;
    boards: boolean;
    storage: boolean;
  };
  boardTaskCounts?: BoardTaskCount[];
  message?: string;
  error?: string;
}

interface AdminLicensingTabProps {
  currentUser: any;
  settings: any;
}

const AdminLicensingTab: React.FC<AdminLicensingTabProps> = ({ currentUser, settings }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'subscription'>('overview');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Subscription management state
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetchLicenseInfo();
    checkOwnership();
  }, []);

  // Initialize activeSubTab from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#admin#licensing#subscription') {
      setActiveSubTab('subscription');
    } else if (hash === '#admin#licensing#overview') {
      setActiveSubTab('overview');
    }
  }, []);

  // Update URL hash when activeSubTab changes
  const handleSubTabChange = (tab: 'overview' | 'subscription') => {
    setActiveSubTab(tab);
    const newHash = tab === 'subscription' 
      ? '#admin#licensing#subscription' 
      : '#admin#licensing#overview';
    window.location.hash = newHash;
  };

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin#licensing#subscription') {
        setActiveSubTab('subscription');
      } else if (hash === '#admin#licensing#overview') {
        setActiveSubTab('overview');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const checkOwnership = async () => {
    try {
      const response = await api.get('/admin/owner');
      setIsOwner(response.data.owner === currentUser?.email);
    } catch (err) {
      console.error('Failed to check ownership:', err);
      setIsOwner(false);
    }
  };

  const fetchLicenseInfo = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/license-info');
      setLicenseInfo(response.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSupportTypeColor = (supportType: string): string => {
    switch (supportType.toLowerCase()) {
      case 'pro':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'basic':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'free':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getSupportTypeIcon = (supportType: string) => {
    switch (supportType.toLowerCase()) {
      case 'pro':
        return <Shield className="h-4 w-4" />;
      case 'basic':
        return <CheckCircle className="h-4 w-4" />;
      case 'free':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const calculateUsagePercentage = (current: number, limit: number): number => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((current / limit) * 100, 100);
  };

  const renderOverviewContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-red-800 dark:text-red-200">Error loading license information: {error}</p>
          </div>
        </div>
      );
    }

    if (!licenseInfo) {
      return (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <p className="text-gray-600 dark:text-gray-400">No license information available.</p>
        </div>
      );
    }

    // Handle API errors
    if (licenseInfo.error) {
      return (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-red-800 dark:text-red-200">Error loading license information: {licenseInfo.error}</p>
          </div>
        </div>
      );
    }

    // Handle case where license info doesn't have the expected structure
    if (!licenseInfo.usage || !licenseInfo.limits) {
      return (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
            <p className="text-yellow-800 dark:text-yellow-200">
              {licenseInfo.message || 'License information is incomplete or unavailable.'}
            </p>
          </div>
        </div>
      );
    }

    if (!licenseInfo.enabled) {
      const isDemoMode = process.env.DEMO_ENABLED === 'true';
      return (
        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
          <div className="flex items-center">
            <CheckCircle className="h-6 w-6 text-blue-500 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                {isDemoMode ? 'Demo Mode' : 'Self-Hosted Mode'}
              </h3>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                {isDemoMode 
                  ? 'License system is disabled for demo purposes. This instance resets hourly and is for evaluation only.'
                  : 'License system is disabled. This instance is running in self-hosted mode with no restrictions.'
                }
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Plan Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold flex items-center mb-4 text-gray-900 dark:text-white">
              <Shield className="h-5 w-5 mr-2" />
              Current Plan
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getSupportTypeIcon(licenseInfo.limits.SUPPORT_TYPE)}
                <div>
                  <h3 className="text-xl font-semibold capitalize text-gray-900 dark:text-white">{licenseInfo.limits.SUPPORT_TYPE} Plan</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {licenseInfo.limits.SUPPORT_TYPE.toLowerCase() === 'pro' && 'Full-featured plan with unlimited resources'}
                    {licenseInfo.limits.SUPPORT_TYPE.toLowerCase() === 'basic' && 'Standard plan with moderate limits'}
                    {licenseInfo.limits.SUPPORT_TYPE.toLowerCase() === 'free' && 'Free plan with basic features'}
                  </p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSupportTypeColor(licenseInfo.limits.SUPPORT_TYPE)}`}>
                {licenseInfo.limits.SUPPORT_TYPE.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Users */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-6">
              <h3 className="text-sm font-medium flex items-center mb-3 text-gray-900 dark:text-white">
                <Users className="h-4 w-4 mr-2" />
                Users
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{licenseInfo.usage.users}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    / {licenseInfo.limits.USER_LIMIT === -1 ? '∞' : licenseInfo.limits.USER_LIMIT}
                  </span>
                </div>
                {licenseInfo.limits.USER_LIMIT !== -1 && (
                  <>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
                        style={{ transform: `translateX(-${100 - calculateUsagePercentage(licenseInfo.usage.users, licenseInfo.limits.USER_LIMIT)}%)` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {calculateUsagePercentage(licenseInfo.usage.users, licenseInfo.limits.USER_LIMIT).toFixed(1)}% used
                      </span>
                      {licenseInfo.limitsReached.users && (
                        <span className="text-red-500 font-medium">Limit reached</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Boards */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-6">
              <h3 className="text-sm font-medium flex items-center mb-3 text-gray-900 dark:text-white">
                <Layout className="h-4 w-4 mr-2" />
                Boards
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{licenseInfo.usage.boards}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    / {licenseInfo.limits.BOARD_LIMIT === -1 ? '∞' : licenseInfo.limits.BOARD_LIMIT}
                  </span>
                </div>
                {licenseInfo.limits.BOARD_LIMIT !== -1 && (
                  <>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
                        style={{ transform: `translateX(-${100 - calculateUsagePercentage(licenseInfo.usage.boards, licenseInfo.limits.BOARD_LIMIT)}%)` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {calculateUsagePercentage(licenseInfo.usage.boards, licenseInfo.limits.BOARD_LIMIT).toFixed(1)}% used
                      </span>
                      {licenseInfo.limitsReached.boards && (
                        <span className="text-red-500 font-medium">Limit reached</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Storage */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-6">
              <h3 className="text-sm font-medium flex items-center mb-3 text-gray-900 dark:text-white">
                <HardDrive className="h-4 w-4 mr-2" />
                Storage
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(licenseInfo.usage.storage)}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    / {formatBytes(licenseInfo.limits.STORAGE_LIMIT)}
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
                    style={{ transform: `translateX(-${100 - calculateUsagePercentage(licenseInfo.usage.storage, licenseInfo.limits.STORAGE_LIMIT)}%)` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    {calculateUsagePercentage(licenseInfo.usage.storage, licenseInfo.limits.STORAGE_LIMIT).toFixed(1)}% used
                  </span>
                  {licenseInfo.limitsReached.storage && (
                    <span className="text-red-500 font-medium">Limit reached</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Task Limits */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold flex items-center mb-4 text-gray-900 dark:text-white">
              <ClipboardList className="h-5 w-5 mr-2" />
              Task Limits per Board
            </h3>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {licenseInfo.limits.TASK_LIMIT === -1 ? 'Unlimited' : licenseInfo.limits.TASK_LIMIT} tasks per board
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Maximum number of tasks allowed in each board
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {licenseInfo.limits.TASK_LIMIT === -1 ? '∞' : licenseInfo.limits.TASK_LIMIT}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">per board</div>
              </div>
            </div>

            {/* Board Task Count Breakdown - Only show if not unlimited and we have data */}
            {licenseInfo.limits.TASK_LIMIT !== -1 && licenseInfo.boardTaskCounts && licenseInfo.boardTaskCounts.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Board Usage Breakdown
                </h4>
                <div className="space-y-3">
                  {licenseInfo.boardTaskCounts.map((board) => {
                    const usagePercentage = calculateUsagePercentage(board.taskCount, licenseInfo.limits.TASK_LIMIT);
                    const isNearLimit = usagePercentage >= 80;
                    const isAtLimit = usagePercentage >= 100;
                    
                    return (
                      <div key={board.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {board.title}
                            </span>
                            <span className={`text-sm font-semibold ${
                              isAtLimit ? 'text-red-600' : 
                              isNearLimit ? 'text-yellow-600' : 
                              'text-gray-600 dark:text-gray-300'
                            }`}>
                              {board.taskCount} / {licenseInfo.limits.TASK_LIMIT}
                            </span>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                            <div
                              className={`h-full transition-all duration-300 ease-in-out ${
                                isAtLimit ? 'bg-red-500' : 
                                isNearLimit ? 'bg-yellow-500' : 
                                'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {usagePercentage.toFixed(1)}% used
                            </span>
                            {isAtLimit && (
                              <span className="text-xs text-red-600 font-medium">Limit reached</span>
                            )}
                            {isNearLimit && !isAtLimit && (
                              <span className="text-xs text-yellow-600 font-medium">Near limit</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Show message for unlimited plans */}
            {licenseInfo.limits.TASK_LIMIT === -1 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span className="text-sm">Unlimited tasks per board - no restrictions</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* License Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">License Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">License System</span>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  licenseInfo.enabled 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {licenseInfo.enabled ? 'Managed' : 'Self-Managed'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan Type</span>
                <span className="text-sm capitalize text-gray-900 dark:text-white">{licenseInfo.limits.SUPPORT_TYPE}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">App Version</span>
                <span className="text-sm text-gray-900 dark:text-white">{settings?.APP_VERSION || '0'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Updated</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSubscriptionContent = () => {
    if (!isOwner) {
      return (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-yellow-500 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                Access Restricted
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                Only the instance owner can access subscription management.
              </p>
            </div>
          </div>
        </div>
      );
    }

    const websiteUrl = settings?.WEBSITE_URL || '';
    const hasWebsiteUrl = websiteUrl.trim() !== '';

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Customer Portal</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Manage your subscription, view billing history, change plans, and cancel your subscription through our customer portal.
            </p>
            
            {hasWebsiteUrl ? (
              <button
                onClick={() => window.open(websiteUrl, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Open Customer Portal
                <ExternalLink className="ml-2 h-4 w-4" />
              </button>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
                  <p className="text-yellow-800 dark:text-yellow-200">
                    Website URL not configured. Please contact your system administrator to set the WEBSITE_URL in Site Settings.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Licensing</h2>
          {activeSubTab === 'overview' && (
            <button
              onClick={fetchLicenseInfo}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => handleSubTabChange('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'overview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => handleSubTabChange('subscription')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'subscription'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Manage Subscription
          </button>
        </nav>
      </div>

      {/* Conditional Content Based on Active Sub-tab */}
      {activeSubTab === 'overview' ? renderOverviewContent() : renderSubscriptionContent()}
    </div>
  );
};

export default AdminLicensingTab;
