import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Calendar, Info, RefreshCw, ChevronDown, Search, X, ZoomOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import DateRangeSelector from './DateRangeSelector';
import { getBoards } from '../../api';

interface BurndownDataPoint {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  total_effort: number;
  completed_effort: number;
  remaining_effort: number;
}

interface BoardBurndownData {
  boardId: string;
  boardName: string;
  data: BurndownDataPoint[];
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
  boards?: BoardBurndownData[]; // Per-board breakdown when viewing "All Boards"
}

interface BurndownReportProps {
  initialFilters?: {
    startDate?: string;
    endDate?: string;
    boardId?: string;
  };
  onFiltersChange?: (filters: { startDate: string; endDate: string; boardId: string }) => void;
}

interface Board {
  id: string;
  title: string;
}

const BurndownReport: React.FC<BurndownReportProps> = ({ initialFilters, onFiltersChange }) => {
  const [startDate, setStartDate] = useState(initialFilters?.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters?.endDate || '');
  const [boardId, setBoardId] = useState(initialFilters?.boardId || '');
  const [burndownData, setBurndownData] = useState<BurndownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Board selector state
  const [boards, setBoards] = useState<Board[]>([]);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [boardSearchTerm, setBoardSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const boardListRef = useRef<HTMLDivElement>(null);
  const boardOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  // Legend toggle state - track which boards are hidden
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(new Set());
  
  // Zoom state for click-and-drag zoom
  const [zoomState, setZoomState] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  
  // Ref to track scroll position
  const scrollPositionRef = useRef<number>(0);

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
          // No selection, do nothing
          return;
        } else if (highlightedIndex === 0) {
          // "All Boards" selected
          setBoardId('');
          setShowBoardDropdown(false);
          setBoardSearchTerm('');
          setHighlightedIndex(-1);
        } else {
          // Specific board selected
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

  const fetchBurndownData = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    // Save current scroll position
    scrollPositionRef.current = window.scrollY;

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

  // Restore scroll position after data loads
  useEffect(() => {
    if (!loading && scrollPositionRef.current > 0) {
      // Use setTimeout to ensure DOM has fully updated and any other scroll events have settled
      const timeoutId = setTimeout(() => {
        window.scrollTo({ 
          top: scrollPositionRef.current, 
          left: 0,
          behavior: 'auto' 
        });
        scrollPositionRef.current = 0; // Reset after restoring
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [loading, burndownData]);

  // Auto-generate colors for boards
  const BOARD_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  // Helper to parse date string as local date (not UTC)
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Helper function to check if a date is a weekend
  const isWeekend = (dateString: string): boolean => {
    const date = parseLocalDate(dateString);
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  };

  // Generate all dates between start and end (inclusive) using local time
  const getAllDatesInRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const currentDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  // Calculate weekend-aware ideal burndown
  const calculateIdealBurndown = (allDates: string[], dataMap: Map<string, BurndownDataPoint>, totalTasks: number): number[] => {
    if (!allDates || allDates.length === 0) return [];
    
    // Use the total tasks from baseline or first actual data point
    const startingRemaining = totalTasks || 0;
    const workingDays = allDates.filter(d => !isWeekend(d)).length;
    
    if (workingDays === 0 || startingRemaining === 0) return allDates.map(() => startingRemaining);
    
    const tasksPerWorkingDay = startingRemaining / workingDays;
    let remainingTasks = startingRemaining;
    
    return allDates.map(date => {
      if (isWeekend(date)) {
        // Keep same value on weekends (flat line)
        return Math.max(0, Math.round(remainingTasks));
      } else {
        // Decrease on working days
        remainingTasks -= tasksPerWorkingDay;
        return Math.max(0, Math.round(remainingTasks));
      }
    });
  };

  // Prepare chart data with all dates filled in
  const prepareChartData = () => {
    if (!burndownData || !burndownData.data || !startDate || !endDate) return [];

    // Get all dates in the selected range
    const allDates = getAllDatesInRange(startDate, endDate);
    
    // Create a map of existing data for quick lookup
    const dataMap = new Map(burndownData.data.map(d => [d.date, d]));
    
    // Get baseline total tasks from metrics or first data point
    const baselineTotalTasks = burndownData.metrics?.totalTasks || 
      (burndownData.data.length > 0 ? burndownData.data[0].total_tasks : 0);
    
    // Calculate ideal line for full date range
    const idealLine = calculateIdealBurndown(allDates, dataMap, baselineTotalTasks);
    
    // If viewing a specific board or no boards data
    if (boardId || !burndownData.boards || burndownData.boards.length === 0) {
      let lastRemaining = 0;
      return allDates.map((date, index) => {
        const dataPoint = dataMap.get(date);
        // If we have actual data, use it; otherwise carry forward the last value
        if (dataPoint) {
          lastRemaining = dataPoint.remaining_tasks;
        }
        return {
          date: parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: date,
          ideal: idealLine[index],
          remaining: lastRemaining,
          isWeekend: isWeekend(date)
        };
      });
    }

    // Viewing all boards - merge data with all dates
    // Track last known value for each board
    const lastBoardValues = new Map<string, number>();
    
    const mergedData = allDates.map((date, index) => {
      const chartPoint: any = {
        date: parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date,
        ideal: idealLine[index],
        isWeekend: isWeekend(date)
      };

      // Add each board's data
      burndownData.boards?.forEach(board => {
        const boardKey = `board_${board.boardId}`;
        const boardDataPoint = board.data.find(d => d.date === date);
        
        // If we have actual data, use it and update last known value
        if (boardDataPoint) {
          lastBoardValues.set(boardKey, boardDataPoint.remaining_tasks);
          chartPoint[boardKey] = boardDataPoint.remaining_tasks;
        } else {
          // Carry forward the last known value (or 0 if no data yet)
          chartPoint[boardKey] = lastBoardValues.get(boardKey) || 0;
        }
      });

      return chartPoint;
    });

    return mergedData;
  };

  const chartData = prepareChartData();

  // Get today's date formatted for the chart
  const getTodayFormatted = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Check if today is within the chart's date range
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayDate = getTodayDate();
  const isTodayInRange = startDate && endDate && todayDate >= startDate && todayDate <= endDate;
  const todayFormatted = getTodayFormatted();

  // Get weekend date ranges for ReferenceArea
  const getWeekendRanges = () => {
    if (!chartData || chartData.length === 0) return [];
    
    const weekends: { start: string; end: string }[] = [];
    let weekendStart: string | null = null;

    chartData.forEach((point, index) => {
      if (point.isWeekend && !weekendStart) {
        // Start of weekend
        weekendStart = point.date;
      } else if (!point.isWeekend && weekendStart) {
        // End of weekend
        const prevPoint = chartData[index - 1];
        weekends.push({ start: weekendStart, end: prevPoint.date });
        weekendStart = null;
      }
    });

    // Handle case where data ends on a weekend
    if (weekendStart && chartData.length > 0) {
      weekends.push({ start: weekendStart, end: chartData[chartData.length - 1].date });
    }

    return weekends;
  };

  const weekendRanges = getWeekendRanges();

  // Handle legend click to toggle board visibility
  const handleLegendClick = (dataKey: string) => {
    if (dataKey === 'ideal' || dataKey === 'remaining') return; // Don't hide these
    
    setHiddenBoards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataKey)) {
        newSet.delete(dataKey);
      } else {
        newSet.add(dataKey);
      }
      return newSet;
    });
  };

  // Zoom handlers for click-and-drag selection (AWS-style)
  const handleMouseDown = (e: any) => {
    if (e && e.activeLabel) {
      setRefAreaLeft(e.activeLabel);
      // Prevent text selection during drag
      if (e.nativeEvent) {
        e.nativeEvent.preventDefault();
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (refAreaLeft && e && e.activeLabel) {
      setRefAreaRight(e.activeLabel);
      // Prevent text selection during drag
      if (e.nativeEvent) {
        e.nativeEvent.preventDefault();
      }
    }
  };

  const handleMouseUp = () => {
    if (refAreaLeft && refAreaRight) {
      // Get the full chart data to find indices
      const fullData = chartData;
      const leftIndex = fullData.findIndex(d => d.date === refAreaLeft);
      const rightIndex = fullData.findIndex(d => d.date === refAreaRight);
      
      if (leftIndex !== -1 && rightIndex !== -1) {
        const startIndex = Math.min(leftIndex, rightIndex);
        const endIndex = Math.max(leftIndex, rightIndex);
        
        if (startIndex !== endIndex) {
          setZoomState({ startIndex, endIndex });
        }
      }
    }
    
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  const handleZoomOut = () => {
    setZoomState(null);
  };

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
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        !boardId ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      All Boards
                    </button>

                    {/* Individual Boards */}
                    {filteredBoards.map((board, index) => {
                      const optionIndex = index + 1; // +1 because "All Boards" is at index 0
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
                            boardId === board.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-900 dark:text-white'
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

          {/* Burndown Chart */}
          {chartData.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Burndown Chart - Tasks Remaining
                </h3>
                {zoomState && (
                  <button
                    onClick={handleZoomOut}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
                  >
                    <ZoomOut className="w-4 h-4" />
                    Reset Zoom
                  </button>
                )}
              </div>
              <div style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
                <ResponsiveContainer width="100%" height={450}>
                  <LineChart 
                    data={zoomState ? chartData.slice(zoomState.startIndex, zoomState.endIndex + 1) : chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  
                  {/* Weekend backgrounds */}
                  {weekendRanges.map((range, index) => (
                    <ReferenceArea
                      key={`weekend-${index}`}
                      x1={range.start}
                      x2={range.end}
                      fill="currentColor"
                      fillOpacity={0.1}
                      className="text-gray-400 dark:text-gray-600"
                    />
                  ))}
                  
                  {/* Today's date marker */}
                  {isTodayInRange && (
                    <ReferenceLine
                      x={todayFormatted}
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      className="text-red-500 dark:text-red-400"
                      label={{ 
                        value: 'Today', 
                        position: 'top',
                        fill: 'currentColor',
                        className: 'text-red-600 dark:text-red-400 text-xs font-semibold'
                      }}
                    />
                  )}
                  
                  <XAxis 
                    dataKey="date" 
                    stroke="currentColor" 
                    className="text-gray-600 dark:text-gray-400"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    stroke="currentColor" 
                    className="text-gray-600 dark:text-gray-400"
                    label={{ value: 'Tasks Remaining', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--tooltip-bg)', 
                      border: '1px solid var(--tooltip-border)',
                      borderRadius: '0.5rem'
                    }}
                    labelStyle={{ color: 'var(--tooltip-text)' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
                    onClick={(e: any) => {
                      if (e.dataKey) handleLegendClick(e.dataKey);
                    }}
                  />
                  
                  {/* Ideal burndown guideline (gray dashed, flattened on weekends) */}
                  <Line 
                    type="monotone" 
                    dataKey="ideal" 
                    stroke="#9CA3AF" 
                    strokeWidth={3}
                    strokeDasharray="5 5" 
                    name="Ideal (Working Days)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  
                  {/* Single board view or aggregated view */}
                  {(boardId || !burndownData.boards || burndownData.boards.length === 0) && (
                    <Line 
                      type="monotone" 
                      dataKey="remaining" 
                      stroke="#3B82F6" 
                      strokeWidth={3}
                      name="Actual Remaining"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  
                  {/* Multi-board view - one line per board */}
                  {!boardId && burndownData.boards && burndownData.boards.length > 0 && 
                    burndownData.boards.map((board, index) => {
                      const dataKey = `board_${board.boardId}`;
                      return (
                        <Line 
                          key={board.boardId}
                          type="monotone" 
                          dataKey={dataKey}
                          stroke={BOARD_COLORS[index % BOARD_COLORS.length]}
                          strokeWidth={3}
                          name={board.boardName}
                          dot={false}
                          isAnimationActive={false}
                          hide={hiddenBoards.has(dataKey)}
                          strokeOpacity={hiddenBoards.has(dataKey) ? 0.2 : 1}
                        />
                      );
                    })
                  }
                  
                  {/* Selection area for zoom (shown while dragging) */}
                  {refAreaLeft && refAreaRight && (
                    <ReferenceArea
                      x1={refAreaLeft}
                      x2={refAreaRight}
                      strokeOpacity={0.3}
                      fill="currentColor"
                      fillOpacity={0.3}
                      className="text-blue-500"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              </div>
              
              {/* Legend info */}
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-400"></div>
                    <span>Ideal burndown (working days only)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <span>Weekends</span>
                  </div>
                  {isTodayInRange && (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-0.5 border-t-2 border-dashed border-red-500 dark:border-red-400"></div>
                      <span className="text-red-600 dark:text-red-400 font-medium">Today</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                  {!boardId && burndownData.boards && burndownData.boards.length > 1 && (
                    <div className="italic">
                      💡 Click on legend items to show/hide board lines
                    </div>
                  )}
                  <div className="italic">
                    🔍 Click and drag on the chart to zoom into a specific date range
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No data available for the selected period
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

