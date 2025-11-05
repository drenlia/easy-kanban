import React, { useState, useEffect, useRef } from 'react';
import { Users, Calendar, RefreshCw, Trophy, CheckCircle2, MessageSquare, UserPlus, Printer, ChevronDown, Search, X } from 'lucide-react';
import DateRangeSelector from './DateRangeSelector';
import { getBoards } from '../../api';

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

interface Board {
  id: string;
  title: string;
}

interface TeamPerformanceReportProps {
  initialFilters?: {
    startDate?: string;
    endDate?: string;
    boardId?: string;
  };
  onFiltersChange?: (filters: { startDate: string; endDate: string; boardId: string }) => void;
}

const TeamPerformanceReport: React.FC<TeamPerformanceReportProps> = ({ initialFilters, onFiltersChange }) => {
  const [startDate, setStartDate] = useState(initialFilters?.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters?.endDate || '');
  const [boardId, setBoardId] = useState(initialFilters?.boardId || '');
  const [performanceData, setPerformanceData] = useState<TeamPerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Board selector state
  const [boards, setBoards] = useState<Board[]>([]);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [boardSearchTerm, setBoardSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const boardListRef = useRef<HTMLDivElement>(null);
  const boardOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch boards on mount
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const boardsData = await getBoards();
        setBoards(boardsData || []);
      } catch (error) {
        console.error('Failed to fetch boards:', error);
      }
    };
    fetchBoards();
  }, []);

  // Reset highlighted index when search term changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [boardSearchTerm]);

  // Auto-scroll to highlighted option
  useEffect(() => {
    if (highlightedIndex >= 0 && boardOptionRefs.current[highlightedIndex]) {
      boardOptionRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [highlightedIndex]);

  // Get filtered boards for dropdown
  const filteredBoards = boards.filter(board => 
    board.title.toLowerCase().includes(boardSearchTerm.toLowerCase())
  );

  // Total options = "All Boards" + filtered boards
  const totalOptions = 1 + filteredBoards.length;

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showBoardDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < totalOptions - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : -1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex === -1) {
          return;
        } else if (highlightedIndex === 0) {
          setBoardId('');
          setShowBoardDropdown(false);
          setBoardSearchTerm('');
          setHighlightedIndex(-1);
        } else {
          const selectedBoard = filteredBoards[highlightedIndex - 1];
          if (selectedBoard) {
            setBoardId(selectedBoard.id);
            setShowBoardDropdown(false);
            setBoardSearchTerm('');
            setHighlightedIndex(-1);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowBoardDropdown(false);
        setBoardSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  };

  // Notify parent of filter changes
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({ startDate, endDate, boardId });
    }
  }, [startDate, endDate, boardId, onFiltersChange]);

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
      if (boardId) params.append('boardId', boardId);

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

  // Auto-fetch when dates or board change
  useEffect(() => {
    if (startDate && endDate) {
      fetchPerformanceData();
    }
  }, [startDate, endDate, boardId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          /* Hide navigation and UI chrome */
          header,
          nav,
          .no-print,
          .reports-tabs,
          .reports-header,
          [class*="ActivityFeed"],
          [class*="activity-feed"],
          div[style*="position: fixed"],
          div[style*="position:fixed"],
          div[class*="fixed"],
          [style*="z-index: 9999"],
          [style*="z-index:9999"],
          [class*="NetworkStatus"],
          [class*="ToastContainer"],
          [class*="Toast"],
          [class*="ModalManager"],
          [class*="TaskLinkingOverlay"],
          [class*="VersionUpdateBanner"],
          [class*="ResetCountdown"],
          [class*="DebugPanel"],
          [class*="sticky"] {
            display: none !important;
            visibility: hidden !important;
            position: absolute !important;
            left: -9999px !important;
          }
          
          /* Hide print button itself */
          button[title="Print report"] {
            display: none !important;
          }
          
          /* Remove padding and constraints from layout wrappers */
          body > *:not(script),
          html {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Make report content full width and remove layout constraints */
          .flex-1,
          .w-4\\/5,
          .mx-auto,
          [class*="p-6"] {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Ensure report content is visible and properly formatted */
          .space-y-6 {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          .space-y-6 > * {
            page-break-inside: avoid;
            margin-top: 1rem !important;
          }
          
          .space-y-6 > *:first-child {
            margin-top: 0 !important;
          }
          
          /* Force grid layouts to maintain columns in print */
          .grid {
            display: grid !important;
          }
          
          /* Team Performance: 4 columns (horizontal stack) */
          .grid.grid-cols-1,
          .grid[class*="grid-cols-1"],
          .grid[class*="grid-cols-4"],
          .grid[class*="md:grid-cols-4"] {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
          
          /* Print styles - Landscape for better table fit */
          @page {
            size: landscape;
            margin: 0.5cm;
          }
          
          /* Ensure all table columns fit within page width */
          table {
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 8px !important;
          }
          
          /* Make table container use full width */
          .overflow-x-auto {
            overflow: visible !important;
            width: 100% !important;
          }
          
          thead {
            display: table-header-group !important;
          }
          
          tbody {
            display: table-row-group !important;
          }
          
          th, td {
            padding: 2px 3px !important;
            font-size: 8px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            word-wrap: break-word !important;
          }
          
          /* Allow rows to break across pages */
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          /* Ensure table headers repeat on each page (automatic with table-header-group) */
          
          /* Reduce summary metrics size for print */
          .grid .text-2xl {
            font-size: 1.25rem !important;
          }
          
          .grid .text-sm {
            font-size: 0.75rem !important;
          }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-500" />
            Team Performance
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View team activity and productivity metrics
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
          title="Print report"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Filters */}
      <div className="no-print bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
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

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Board Filter (Optional)
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBoardDropdown(!showBoardDropdown)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-left flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <span className={boardId ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
                {boardId ? boards.find(b => b.id === boardId)?.title || 'All Boards' : 'All Boards'}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showBoardDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showBoardDropdown && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-10"
                  onClick={() => setShowBoardDropdown(false)}
                />
                
                {/* Dropdown Menu */}
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 flex flex-col">
                  {/* Search Input */}
                  <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={boardSearchTerm}
                        onChange={(e) => setBoardSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search boards..."
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {boardSearchTerm && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBoardSearchTerm('');
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Board List */}
                  <div ref={boardListRef} className="overflow-y-auto max-h-64">
                    {/* All Boards Option */}
                    <button
                      ref={(el) => boardOptionRefs.current[0] = el}
                      onClick={() => {
                        setBoardId('');
                        setShowBoardDropdown(false);
                        setBoardSearchTerm('');
                        setHighlightedIndex(-1);
                      }}
                      onMouseEnter={() => setHighlightedIndex(0)}
                      className={`w-full text-left px-4 py-2 transition-colors ${
                        highlightedIndex === 0 
                          ? 'bg-gray-100 dark:bg-gray-700' 
                          : ''
                      } ${
                        !boardId ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      All Boards
                    </button>

                    {/* Individual Boards */}
                    {filteredBoards.map((board, index) => {
                      const optionIndex = index + 1;
                      return (
                        <button
                          key={board.id}
                          ref={(el) => boardOptionRefs.current[optionIndex] = el}
                          onClick={() => {
                            setBoardId(board.id);
                            setShowBoardDropdown(false);
                            setBoardSearchTerm('');
                            setHighlightedIndex(-1);
                          }}
                          onMouseEnter={() => setHighlightedIndex(optionIndex)}
                          className={`w-full text-left px-4 py-2 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                            highlightedIndex === optionIndex 
                              ? 'bg-gray-100 dark:bg-gray-700' 
                              : ''
                          } ${
                            boardId === board.id ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {board.title}
                        </button>
                      );
                    })}

                    {/* No Results */}
                    {boardSearchTerm && filteredBoards.length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                        No boards found
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
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
