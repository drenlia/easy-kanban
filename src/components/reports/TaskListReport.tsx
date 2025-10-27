import React, { useState, useEffect } from 'react';
import { List, Calendar, RefreshCw, FileText, Tag as TagIcon, User, AlertCircle } from 'lucide-react';
import DateRangeSelector from './DateRangeSelector';

interface Task {
  task_id: string;
  task_title: string;
  task_ticket: string | null;
  board_name: string;
  column_name: string;
  assignee_name: string | null;
  requester_name: string | null;
  priority_name: string | null;
  effort: number | null;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  tags: string[];
  comment_count: number;
  created_at: string;
  completed_at: string | null;
}

interface TaskListData {
  success: boolean;
  filters: {
    startDate: string | null;
    endDate: string | null;
    boardId: string | null;
    status: string | null;
    assigneeId: string | null;
    priorityName: string | null;
  };
  metrics: {
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    totalEffort: number;
    completedEffort: number;
    totalComments: number;
    avgCommentsPerTask: string;
  };
  tasks: Task[];
}

const TaskListReport: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [taskData, setTaskData] = useState<TaskListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTaskList = async () => {
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
      if (status) params.append('status', status);

      const response = await fetch(`/api/reports/task-list?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch task list');
      }

      const data = await response.json();
      setTaskData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when filters change
  useEffect(() => {
    if (startDate && endDate) {
      fetchTaskList();
    }
  }, [startDate, endDate, status]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <List className="w-7 h-7 text-green-500" />
          Task List Report
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Comprehensive list of tasks with detailed information
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
          </div>
          {startDate && endDate && (
            <button
              onClick={fetchTaskList}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg font-medium transition-colors disabled:opacity-50"
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
            Status Filter
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Tasks</option>
            <option value="completed">Completed Only</option>
            <option value="active">Active Only</option>
          </select>
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
        </div>
      )}

      {/* Task Data */}
      {!loading && taskData && (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Tasks</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {taskData.metrics.totalTasks}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Completed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {taskData.metrics.completedTasks}
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {taskData.metrics.activeTasks}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Effort</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {taskData.metrics.totalEffort}
              </div>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              {taskData.tasks.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Task
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Board
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Assignee
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Effort
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Tags
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {taskData.tasks.map((task) => (
                      <tr key={task.task_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {task.task_ticket ? `${task.task_ticket}: ` : ''}{task.task_title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Created: {new Date(task.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {task.board_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            task.is_completed
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {task.column_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {task.assignee_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                          {task.effort || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {task.tags && task.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {task.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No tasks found for the selected period and filters
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TaskListReport;
