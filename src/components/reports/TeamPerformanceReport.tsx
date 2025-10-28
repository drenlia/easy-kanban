import React, { useState, useEffect } from 'react';
import { Users, Calendar, RefreshCw, Trophy, CheckCircle2, MessageSquare, UserPlus } from 'lucide-react';
import DateRangeSelector from './DateRangeSelector';

interface UserPerformance {
  user_id: string;
  user_name: string;
  tasks_created: number;
  tasks_completed: number;
  tasks_updated: number;
  comments_added: number;
  collaborations: number;
  total_effort_completed: number;
  total_points: number;
}

interface TeamPerformanceData {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalUsers: number;
    totalTasksCompleted: number;
    totalEffortCompleted: number;
    totalComments: number;
    totalCollaborations: number;
  };
  users: UserPerformance[];
}

interface TeamPerformanceReportProps {
  initialFilters?: {
    startDate?: string;
    endDate?: string;
  };
  onFiltersChange?: (filters: { startDate: string; endDate: string }) => void;
}

const TeamPerformanceReport: React.FC<TeamPerformanceReportProps> = ({ initialFilters, onFiltersChange }) => {
  const [startDate, setStartDate] = useState(initialFilters?.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters?.endDate || '');
  const [performanceData, setPerformanceData] = useState<TeamPerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notify parent of filter changes
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({ startDate, endDate });
    }
  }, [startDate, endDate, onFiltersChange]);

  const fetchPerformanceData = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);

      const response = await fetch(`/api/reports/team-performance?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch team performance data');
      }

      const data = await response.json();
      setPerformanceData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when dates change
  useEffect(() => {
    if (startDate && endDate) {
      fetchPerformanceData();
    }
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-7 h-7 text-indigo-500" />
          Team Performance
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          View team activity and productivity metrics
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Select Period</h3>
          </div>
          {startDate && endDate && (
            <button
              onClick={fetchPerformanceData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
        
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      )}

      {/* Performance Data */}
      {!loading && performanceData && (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-gray-600 dark:text-gray-400">Team Members</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {performanceData.summary.totalUsers}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div className="text-sm text-gray-600 dark:text-gray-400">Tasks Completed</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {performanceData.summary.totalTasksCompleted}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Effort</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {performanceData.summary.totalEffortCompleted}
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <div className="text-sm text-gray-600 dark:text-gray-400">Comments</div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {performanceData.summary.totalComments}
              </div>
            </div>
          </div>

          {/* Team Members Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              {performanceData.users.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Team Member
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Created
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Completed
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Effort
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Comments
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Collaborations
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {performanceData.users.map((user) => (
                      <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {user.user_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 text-right">
                          {user.tasks_created}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400 text-right font-medium">
                          {user.tasks_completed}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600 dark:text-purple-400 text-right font-medium">
                          {user.total_effort_completed}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 dark:text-orange-400 text-right">
                          {user.comments_added}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 text-right">
                          {user.collaborations}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white text-right font-bold">
                          {user.total_points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No activity data found for the selected period
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TeamPerformanceReport;
