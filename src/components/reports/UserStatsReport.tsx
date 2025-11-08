import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, TrendingUp, CheckCircle2, MessageSquare, Users as UsersIcon, Star } from 'lucide-react';

interface UserPoints {
  user_id: string;
  user_name: string;
  total_points: number;
  tasks_created: number;
  tasks_completed: number;
  total_effort_completed: number;
  comments_added: number;
  collaborations: number;
}

interface Achievement {
  id: string;
  badge_name: string;
  badge_icon: string;
  badge_color: string;
  points_earned: number;
  earned_at: string;
}

interface MonthlyPoint {
  period_year: number;
  period_month: number;
  total_points: number;
  tasks_completed: number;
}

interface UserStatsData {
  user: UserPoints;
  rank: number | null;
  totalUsers: number;
  monthlyBreakdown: MonthlyPoint[];
  achievements: Achievement[];
}

interface UserStatsReportProps {
  gamificationEnabled: boolean;
  achievementsEnabled: boolean;
}

const UserStatsReport: React.FC<UserStatsReportProps> = ({ gamificationEnabled, achievementsEnabled }) => {
  const { t } = useTranslation('common');
  const [data, setData] = useState<UserStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserStats();
  }, []);

  // Listen for real-time snapshot updates via WebSocket
  useEffect(() => {
    const handleSnapshotUpdate = (data: any) => {
      console.log('📊 [UserStats] Task snapshots updated:', data);
      // Refresh data when snapshots are updated
      fetchUserStats();
    };

    // Import websocket client and listen for snapshot updates
    import('../../services/websocketClient').then(({ default: websocketClient }) => {
      websocketClient.onTaskSnapshotsUpdated(handleSnapshotUpdate);
      
      return () => {
        websocketClient.offTaskSnapshotsUpdated(handleSnapshotUpdate);
      };
    });
  }, []); // Empty deps - always refresh with latest data

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reports/user-points', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error(t('reports.userStats.failedToFetch'));
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.taskList.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-200">{error || t('reports.userStats.failedToLoad')}</p>
      </div>
    );
  }

  const { user, rank, totalUsers, monthlyBreakdown, achievements } = data;

  const stats = [
    { label: t('reports.userStats.totalPoints'), value: user.total_points, icon: Star, color: 'text-yellow-500' },
    { label: t('reports.userStats.tasksCompleted'), value: user.tasks_completed, icon: CheckCircle2, color: 'text-green-500' },
    { label: t('reports.userStats.effortCompleted'), value: user.total_effort_completed, icon: TrendingUp, color: 'text-blue-500' },
    { label: t('reports.userStats.commentsAdded'), value: user.comments_added, icon: MessageSquare, color: 'text-purple-500' },
    { label: t('reports.userStats.collaborations'), value: user.collaborations, icon: UsersIcon, color: 'text-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{user.user_name}</h2>
            <p className="text-blue-100 mt-1">{t('reports.userStats.performanceDashboard')}</p>
          </div>
          {rank && (
            <div className="text-center">
              <div className="text-5xl font-bold">#{rank}</div>
              <div className="text-sm text-blue-100">{t('reports.userStats.ofMembers', { total: totalUsers })}</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${stat.color}`} />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Achievements Section */}
      {achievementsEnabled && achievements.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            {t('reports.userStats.achievements', { count: achievements.length })}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex flex-col items-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 hover:border-opacity-100 transition-all"
                style={{ borderColor: achievement.badge_color + '40' }}
              >
                <div className="text-4xl mb-2">{achievement.badge_icon}</div>
                <div className="text-sm font-medium text-center text-gray-900 dark:text-white">
                  {achievement.badge_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(achievement.earned_at).toISOString().split('T')[0]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Breakdown */}
      {monthlyBreakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('reports.userStats.monthlyPerformance')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('reports.userStats.month')}
                  </th>
                  <th className="text-right py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('reports.leaderboard.points')}
                  </th>
                  <th className="text-right py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('reports.userStats.tasksCompleted')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map((month) => (
                  <tr
                    key={`${month.period_year}-${month.period_month}`}
                    className="border-b border-gray-100 dark:border-gray-700/50"
                  >
                    <td className="py-2 px-4 text-sm text-gray-900 dark:text-white">
                      {new Date(month.period_year, month.period_month - 1).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long'
                      })}
                    </td>
                    <td className="py-2 px-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {month.total_points}
                    </td>
                    <td className="py-2 px-4 text-sm text-right text-gray-600 dark:text-gray-400">
                      {month.tasks_completed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserStatsReport;

