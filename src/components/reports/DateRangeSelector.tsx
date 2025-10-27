import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface PlanningPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange
}) => {
  const [sprints, setSprints] = useState<PlanningPeriod[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(true);
  const [showSprintDropdown, setShowSprintDropdown] = useState(false);

  useEffect(() => {
    fetchSprints();
  }, []);

  const fetchSprints = async () => {
    try {
      const response = await fetch('/api/admin/sprints', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSprints(data);
      }
    } catch (error) {
      console.error('Failed to fetch sprints:', error);
    } finally {
      setLoadingSprints(false);
    }
  };

  const setPresetRange = (preset: string) => {
    const today = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'month-to-date':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;

      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
        break;

      case 'year-to-date':
        start = new Date(today.getFullYear(), 0, 1);
        end = today;
        break;

      case 'last-year':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;

      case 'this-sprint':
        // Find the active sprint
        const activeSprint = sprints.find(s => s.is_active);
        if (activeSprint) {
          onStartDateChange(activeSprint.start_date);
          onEndDateChange(activeSprint.end_date);
        }
        return;

      case 'last-sprint':
        // Find the most recent sprint that ended before today
        const today_str = today.toISOString().split('T')[0];
        const pastSprints = sprints
          .filter(s => s.end_date < today_str)
          .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());
        
        if (pastSprints.length > 0) {
          onStartDateChange(pastSprints[0].start_date);
          onEndDateChange(pastSprints[0].end_date);
        }
        return;

      default:
        return;
    }

    onStartDateChange(start.toISOString().split('T')[0]);
    onEndDateChange(end.toISOString().split('T')[0]);
  };

  const selectSprint = (sprint: PlanningPeriod) => {
    onStartDateChange(sprint.start_date);
    onEndDateChange(sprint.end_date);
    setShowSprintDropdown(false);
  };

  const hasActiveSprint = sprints.some(s => s.is_active);
  const hasPastSprints = sprints.some(s => s.end_date < new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-4">
      {/* Preset Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Quick Select
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPresetRange('month-to-date')}
            className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
          >
            Month to Date
          </button>
          <button
            onClick={() => setPresetRange('last-month')}
            className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
          >
            Last Month
          </button>
          <button
            onClick={() => setPresetRange('year-to-date')}
            className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
          >
            Year to Date
          </button>
          <button
            onClick={() => setPresetRange('last-year')}
            className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
          >
            Last Year
          </button>
          
          {/* Sprint-based buttons */}
          {!loadingSprints && sprints.length > 0 && (
            <>
              {hasActiveSprint && (
                <button
                  onClick={() => setPresetRange('this-sprint')}
                  className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg font-medium transition-colors"
                >
                  This Sprint
                </button>
              )}
              {hasPastSprints && (
                <button
                  onClick={() => setPresetRange('last-sprint')}
                  className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg font-medium transition-colors"
                >
                  Last Sprint
                </button>
              )}
              
              {/* Choose Sprint Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSprintDropdown(!showSprintDropdown)}
                  className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  Choose Sprint
                  <ChevronDown className={`w-4 h-4 transition-transform ${showSprintDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showSprintDropdown && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSprintDropdown(false)}
                    />
                    
                    {/* Dropdown Menu */}
                    <div className="absolute z-20 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {sprints.map((sprint) => (
                        <button
                          key={sprint.id}
                          onClick={() => selectSprint(sprint)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {sprint.name}
                            </span>
                            {sprint.is_active && (
                              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manual Date Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Start Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            End Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;

