import React, { useState, useEffect } from 'react';
import { BarChart3, Trophy, TrendingUp, Users, List } from 'lucide-react';
import UserStatsReport from './reports/UserStatsReport';
import LeaderboardReport from './reports/LeaderboardReport';
import BurndownReport from './reports/BurndownReport';
import TeamPerformanceReport from './reports/TeamPerformanceReport';
import TaskListReport from './reports/TaskListReport';

type ReportTab = 'stats' | 'leaderboard' | 'burndown' | 'team' | 'tasks';

interface ReportSettings {
  REPORTS_ENABLED: string;
  REPORTS_GAMIFICATION_ENABLED: string;
  REPORTS_LEADERBOARD_ENABLED: string;
  REPORTS_ACHIEVEMENTS_ENABLED: string;
  REPORTS_VISIBLE_TO: string;
}

interface ReportsProps {
  currentUser?: { roles?: string[] };
}

const Reports: React.FC<ReportsProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('stats');
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  // Listen for real-time settings updates via WebSocket
  useEffect(() => {
    const handleSettingsUpdate = (data: any) => {
      console.log('📊 [Reports] Settings updated via WebSocket:', data);
      
      // If any REPORTS_* setting was updated, refresh all settings
      if (data.key && data.key.startsWith('REPORTS_')) {
        console.log(`📊 [Reports] Refreshing settings due to ${data.key} update`);
        fetchSettings();
      }
    };

    // Import websocket client and listen for settings updates
    import('../services/websocketClient').then(({ default: websocketClient }) => {
      websocketClient.onSettingsUpdated(handleSettingsUpdate);
      
      return () => {
        websocketClient.offSettingsUpdated(handleSettingsUpdate);
      };
    });
  }, []); // Empty deps - this listener is stable

  const fetchSettings = async () => {
    try {
      // Use public reports settings endpoint (accessible to all authenticated users)
      const response = await fetch(`/api/reports/settings?_t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const newSettings = {
          REPORTS_ENABLED: data.REPORTS_ENABLED || 'true',
          REPORTS_GAMIFICATION_ENABLED: data.REPORTS_GAMIFICATION_ENABLED || 'true',
          REPORTS_LEADERBOARD_ENABLED: data.REPORTS_LEADERBOARD_ENABLED || 'true',
          REPORTS_ACHIEVEMENTS_ENABLED: data.REPORTS_ACHIEVEMENTS_ENABLED || 'true',
          REPORTS_VISIBLE_TO: data.REPORTS_VISIBLE_TO || 'all',
        };
        console.log('📊 Reports Settings Fetched:', {
          raw: data,
          processed: newSettings
        });
        setSettings(newSettings);
      }
    } catch (error) {
      console.error('Failed to fetch report settings:', error);
      // Default to all enabled on error
      setSettings({
        REPORTS_ENABLED: 'true',
        REPORTS_GAMIFICATION_ENABLED: 'true',
        REPORTS_LEADERBOARD_ENABLED: 'true',
        REPORTS_ACHIEVEMENTS_ENABLED: 'true',
        REPORTS_VISIBLE_TO: 'all',
      });
    } finally {
      setLoading(false);
    }
  };

  // EARLY RETURN: Check if reports are disabled BEFORE any tab logic
  if (!loading && settings?.REPORTS_ENABLED === 'false') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md px-6">
          <BarChart3 className="w-20 h-20 text-gray-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Reports module is currently disabled by an administrator.
          </p>
          <button
            onClick={() => window.location.hash = 'kanban'}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Go back home
          </button>
        </div>
      </div>
    );
  }

  // Check visibility permissions (admin-only vs all users)
  const isAdmin = currentUser?.roles?.includes('admin');
  if (!loading && settings?.REPORTS_VISIBLE_TO === 'admin' && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md px-6">
          <BarChart3 className="w-20 h-20 text-gray-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Reports are currently restricted to administrators only.
          </p>
          <button
            onClick={() => window.location.hash = 'kanban'}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Go back home
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Settings not loaded yet
  if (!settings) {
    return null;
  }

  // Only compute tabs if reports are enabled (we've already checked for disabled above)
  const gamificationEnabled = settings.REPORTS_GAMIFICATION_ENABLED === 'true';
  const allTabs = [
    // My Stats: Shows points - only visible if gamification enabled
    { id: 'stats' as ReportTab, label: 'My Stats', icon: BarChart3, enabled: gamificationEnabled },
    // Leaderboard: Shows rankings - only visible if gamification AND leaderboard enabled
    { id: 'leaderboard' as ReportTab, label: 'Leaderboard', icon: Trophy, enabled: gamificationEnabled && settings.REPORTS_LEADERBOARD_ENABLED === 'true' },
    // Non-gamification reports (always visible)
    { id: 'burndown' as ReportTab, label: 'Burndown', icon: TrendingUp, enabled: true },
    { id: 'team' as ReportTab, label: 'Team Performance', icon: Users, enabled: true },
    { id: 'tasks' as ReportTab, label: 'Task List', icon: List, enabled: true },
  ];

  const tabs = allTabs.filter(tab => tab.enabled);

  // If current tab is not available, use first available tab (prefer burndown if stats not available)
  const currentTab = tabs.some(tab => tab.id === activeTab) ? activeTab : (tabs[0]?.id || 'burndown');

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-7 h-7" />
          Reports & Analytics
        </h1>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 font-medium text-sm
                  border-b-2 transition-colors
                  ${
                    currentTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          {currentTab === 'stats' && <UserStatsReport gamificationEnabled={settings?.REPORTS_GAMIFICATION_ENABLED === 'true'} achievementsEnabled={settings?.REPORTS_ACHIEVEMENTS_ENABLED === 'true'} />}
          {currentTab === 'leaderboard' && <LeaderboardReport />}
          {currentTab === 'burndown' && <BurndownReport />}
          {currentTab === 'team' && <TeamPerformanceReport />}
          {currentTab === 'tasks' && <TaskListReport />}
        </div>
      </div>
    </div>
  );
};

export default Reports;


