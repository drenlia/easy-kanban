import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Award } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string;
  total_points: number;
  tasks_completed: number;
  total_effort_completed: number;
  comments_added: number;
  collaborations: number;
}

interface LeaderboardData {
  period: {
    year: string | number;
    month: number | null;
  };
  totalMembers: number;
  leaderboard: LeaderboardEntry[];
}

const LeaderboardReport: React.FC = () => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [selectedYear, selectedMonth]);

  // Listen for real-time snapshot updates via WebSocket
  useEffect(() => {
    const handleSnapshotUpdate = (data: any) => {
      console.log('📊 [Leaderboard] Task snapshots updated:', data);
      // Refresh data when snapshots are updated
      fetchLeaderboard();
    };

    // Import websocket client and listen for snapshot updates
    import('../../services/websocketClient').then(({ default: websocketClient }) => {
      websocketClient.onTaskSnapshotsUpdated(handleSnapshotUpdate);
      
      return () => {
        websocketClient.offTaskSnapshotsUpdated(handleSnapshotUpdate);
      };
    });
  }, [selectedYear, selectedMonth]); // Refresh with current filters

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear.toString());
      if (selectedMonth) params.append('month', selectedMonth.toString());

      const response = await fetch(`/api/reports/leaderboard?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-gray-600 dark:text-gray-400">#{rank}</span>;
    }
  };

  const getRankBgColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 2:
        return 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600';
      case 3:
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const months = [
    { value: null, label: 'All Months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

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
        <p className="text-red-800 dark:text-red-200">{error || 'Failed to load leaderboard'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-7 h-7 text-yellow-500" />
            Team Leaderboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {data.period.month 
              ? `${months.find(m => m.value === data.period.month)?.label} ${data.period.year}`
              : data.period.year === 'all-time' ? 'All Time' : `Year ${data.period.year}`
            }
          </p>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedYear || ''}
            onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : new Date().getFullYear())}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All Time</option>
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <select
            value={selectedMonth || ''}
            onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            disabled={!selectedYear}
          >
            {months.map(month => (
              <option key={month.value || 'all'} value={month.value || ''}>{month.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      {data.leaderboard.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-800 dark:text-blue-200">
              Showing <strong>{data.leaderboard.length}</strong> of <strong>{data.totalMembers}</strong> team members
            </span>
            {data.totalMembers > data.leaderboard.length && (
              <span className="text-blue-600 dark:text-blue-400 text-xs">
                {data.totalMembers - data.leaderboard.length} members have no activity yet
              </span>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="space-y-3">
        {data.leaderboard.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
            <Trophy className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No data available for this period</p>
          </div>
        ) : (
          data.leaderboard.map((entry) => (
            <div
              key={entry.user_id}
              className={`
                flex items-center gap-4 p-4 rounded-lg border-2 transition-all
                ${getRankBgColor(entry.rank)}
                ${entry.rank <= 3 ? 'shadow-md' : ''}
              `}
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-12 flex items-center justify-center">
                {getRankIcon(entry.rank)}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white truncate">
                  {entry.user_name}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span>{entry.tasks_completed} tasks completed</span>
                  <span>•</span>
                  <span>{entry.total_effort_completed} effort</span>
                  <span>•</span>
                  <span>{entry.comments_added} comments</span>
                </div>
              </div>

              {/* Points */}
              <div className="flex-shrink-0 text-right">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {entry.total_points.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">points</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LeaderboardReport;

