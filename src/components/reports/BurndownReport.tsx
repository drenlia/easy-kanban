import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Info, RefreshCw } from 'lucide-react';
import DateRangeSelector from './DateRangeSelector';

interface BurndownDataPoint {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  total_effort: number;
  completed_effort: number;
  remaining_effort: number;
}

interface BurndownData {
  period: {
    startDate: string;
    endDate: string;
    boardId: string | null;
  };
  metrics: {
    totalTasks: number;
    totalEffort: number;
    totalDays: number;
  };
  data: BurndownDataPoint[];
}

const BurndownReport: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [boardId, setBoardId] = useState('');
  const [burndownData, setBurndownData] = useState<BurndownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBurndownData = async () => {
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
      if (boardId) params.append('boardId', boardId);

      const response = await fetch(`/api/reports/burndown?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch burndown data');
      }

      const data = await response.json();
      setBurndownData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when dates change
  useEffect(() => {
    if (startDate && endDate) {
      fetchBurndownData();
    }
  }, [startDate, endDate, boardId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-blue-500" />
          Burndown Chart
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Track planned vs actual task completion over time
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
              onClick={fetchBurndownData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors disabled:opacity-50"
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

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Board Filter (Optional)
          </label>
          <input
            type="text"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            placeholder="Leave empty for all boards"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Burndown Data */}
      {!loading && burndownData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Tasks</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {burndownData.metrics.totalTasks}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Effort</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {burndownData.metrics.totalEffort}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Period Days</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {burndownData.metrics.totalDays}
              </div>
            </div>
          </div>

          {/* Chart Placeholder / Table */}
          {burndownData.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Total Tasks
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Completed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Remaining
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Effort Remaining
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {burndownData.data.map((point, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {new Date(point.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                        {point.total_tasks}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">
                        {point.completed_tasks}
                      </td>
                      <td className="px-4 py-3 text-sm text-orange-600 dark:text-orange-400 text-right font-medium">
                        {point.remaining_tasks}
                      </td>
                      <td className="px-4 py-3 text-sm text-purple-600 dark:text-purple-400 text-right font-medium">
                        {point.remaining_effort}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No snapshot data available for the selected period
            </div>
          )}
        </div>
      )}

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              About Burndown Charts
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              Burndown charts show the planned vs actual progress for a sprint or time period.
              Daily snapshots are created at midnight to track task completion.
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Snapshots are created daily at midnight UTC. Select a date range to view historical burndown data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BurndownReport;

