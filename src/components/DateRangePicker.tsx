import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseLocalDate, formatToYYYYMMDD } from '../utils/dateUtils';

interface DateRangePickerProps {
  startDate: string;
  endDate: string | null | undefined;
  onDateChange: (startDate: string, endDate: string) => void;
  onClose: () => void;
  position: { left: number; top: number };
  sprint?: { id: string; name: string; start_date: string; end_date: string } | null; // Optional sprint data
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onDateChange,
  onClose,
  position,
  sprint
}) => {
  const { t } = useTranslation('common');
  const [tempStartDate, setTempStartDate] = useState<string>(startDate || '');
  const [tempEndDate, setTempEndDate] = useState<string>(endDate || '');
  const [selectedStart, setSelectedStart] = useState<Date | null>(
    startDate ? parseLocalDate(startDate) : null
  );
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(
    endDate ? parseLocalDate(endDate) : null
  );
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const date = startDate ? parseLocalDate(startDate) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectionMode, setSelectionMode] = useState<'start' | 'end'>('start');
  const pickerRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ left: number; top: number }>(position);

  // Adjust position to prevent going below viewport
  useEffect(() => {
    // Use requestAnimationFrame to ensure the element is rendered before measuring
    requestAnimationFrame(() => {
      if (!pickerRef.current) return;
      
      const viewportHeight = window.innerHeight;
      const pickerHeight = pickerRef.current.offsetHeight || 350; // Smaller estimated height
      const availableSpaceBelow = viewportHeight - position.top;
      
      let newTop = position.top;
      
      // If not enough space below, position above instead
      if (availableSpaceBelow < pickerHeight) {
        const availableSpaceAbove = position.top;
        // Position above if there's more space above, or if below wouldn't fit
        if (availableSpaceAbove > pickerHeight || availableSpaceAbove > availableSpaceBelow) {
          newTop = Math.max(10, position.top - pickerHeight); // At least 10px from top
        } else {
          // If we must go below, at least ensure it's not cut off
          newTop = Math.max(10, viewportHeight - pickerHeight - 10); // 10px margin from bottom
        }
      }
      
      // Adjust horizontal position if needed
      let newLeft = position.left;
      const pickerWidth = 280; // Actual width after making it smaller
      const viewportWidth = window.innerWidth;
      
      if (newLeft + pickerWidth > viewportWidth) {
        newLeft = viewportWidth - pickerWidth - 10; // 10px margin from right
      }
      if (newLeft < 10) {
        newLeft = 10; // 10px margin from left
      }
      
      setAdjustedPosition({ left: newLeft, top: newTop });
    });
  }, [position]);

  // Close on outside click and handle ESC key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Update temp dates when props change
  useEffect(() => {
    setTempStartDate(startDate || '');
    setTempEndDate(endDate || '');
    setSelectedStart(startDate ? parseLocalDate(startDate) : null);
    setSelectedEnd(endDate ? parseLocalDate(endDate) : null);
  }, [startDate, endDate]);

  // Get days in month
  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // Navigate months
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1);
      } else {
        newMonth.setMonth(prev.getMonth() + 1);
      }
      return newMonth;
    });
  };

  // Handle date selection from calendar
  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    
    if (selectionMode === 'start' || !selectedStart || clickedDate < selectedStart) {
      // Starting new selection or clicking before start date
      const dateStr = formatToYYYYMMDD(clickedDate.toISOString());
      setSelectedStart(clickedDate);
      setTempStartDate(dateStr);
      
      // Preserve existing end date if it's already set, otherwise clear it
      if (tempEndDate && selectedEnd) {
        // Keep existing end date - user can change it if they want
        setSelectionMode('end');
      } else {
        // No end date set, clear it and wait for user to select
        setSelectedEnd(null);
        setTempEndDate('');
        setSelectionMode('end');
      }
    } else {
      // Selecting end date
      const endStr = formatToYYYYMMDD(clickedDate.toISOString());
      const startStr = formatToYYYYMMDD(selectedStart.toISOString());
      
      // If same date selected, set both to same value
      if (clickedDate.getTime() === selectedStart.getTime()) {
        setSelectedEnd(clickedDate);
        setTempStartDate(startStr);
        setTempEndDate(startStr); // Same as start
        setSelectionMode('start');
        // Apply changes immediately
        onDateChange(startStr, startStr);
        onClose();
      } else {
        setSelectedEnd(clickedDate);
        setSelectionMode('start');
        setTempStartDate(startStr);
        setTempEndDate(endStr);
        // Apply changes
        onDateChange(startStr, endStr);
        onClose();
      }
    }
  };

  // Handle text input changes
  const handleStartDateInputChange = (value: string) => {
    setTempStartDate(value);
    if (value && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = parseLocalDate(value);
      setSelectedStart(date);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      // Preserve existing end date - don't clear it
      // Only switch to end mode if there's no end date, otherwise stay in current mode
      if (!tempEndDate || !selectedEnd) {
        setSelectionMode('end');
      }
    } else if (!value) {
      // If start date is cleared, also clear selected start
      setSelectedStart(null);
    }
  };

  const handleEndDateInputChange = (value: string) => {
    setTempEndDate(value);
    if (value && value.match(/^\d{4}-\d{2}-\d{2}$/) && selectedStart) {
      const date = parseLocalDate(value);
      setSelectedEnd(date);
    }
  };

  // Apply changes from text inputs
  const handleApply = () => {
    if (tempStartDate) {
      // If only start date is provided, set both to same value
      const endDate = tempEndDate || tempStartDate;
      onDateChange(tempStartDate, endDate);
      onClose();
    }
  };

  // Handle keyboard shortcuts (only when not focused on input fields)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle if typing in an input field (let inputs handle their own keys)
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') {
      return;
    }

    // Handle keyboard shortcuts when not in input
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleApply();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateMonth('prev');
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateMonth('next');
        break;
      default:
        break;
    }
  };

  // Clear dates
  const handleClear = () => {
    setTempStartDate('');
    setTempEndDate('');
    setSelectedStart(null);
    setSelectedEnd(null);
    setSelectionMode('start');
  };

  // Apply sprint dates
  const handleApplySprintDates = () => {
    if (!sprint || !sprint.start_date || !sprint.end_date) return;
    
    const sprintStartStr = formatToYYYYMMDD(sprint.start_date);
    const sprintEndStr = formatToYYYYMMDD(sprint.end_date);
    
    // Update temp dates (same as typing manually)
    setTempStartDate(sprintStartStr);
    setTempEndDate(sprintEndStr);
    
    // Update selected dates
    const sprintStart = parseLocalDate(sprint.start_date);
    const sprintEnd = parseLocalDate(sprint.end_date);
    setSelectedStart(sprintStart);
    setSelectedEnd(sprintEnd);
    
    // Update current month to show sprint start month
    setCurrentMonth(new Date(sprintStart.getFullYear(), sprintStart.getMonth(), 1));
    
    // Set selection mode to end (ready for further adjustments)
    setSelectionMode('end');
    
    // Apply changes immediately (same effect as typing manually)
    onDateChange(sprintStartStr, sprintEndStr);
    // Close the picker after applying sprint dates (same as Apply button)
    onClose();
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const days: (number | null)[] = [];
    const firstDay = firstDayOfMonth(currentMonth);
    const daysCount = daysInMonth(currentMonth);

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysCount; day++) {
      days.push(day);
    }

    return days;
  };

  // Check if date is in range
  const isDateInRange = (day: number): boolean => {
    if (!selectedStart || !selectedEnd) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return date >= selectedStart && date <= selectedEnd;
  };

  // Check if date is selected (only current selectedStart and selectedEnd, not previous ones)
  const isDateSelected = (day: number): boolean => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    // Normalize dates to compare only date part (ignore time)
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };
    
    const normalizedDate = normalizeDate(date);
    if (selectedStart && normalizeDate(selectedStart).getTime() === normalizedDate.getTime()) return true;
    if (selectedEnd && normalizeDate(selectedEnd).getTime() === normalizedDate.getTime()) return true;
    return false;
  };

  // Check if date is today
  const isToday = (day: number): boolean => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const calendarDays = generateCalendarDays();
  const monthNames = [
    t('dateRangePicker.months.january'),
    t('dateRangePicker.months.february'),
    t('dateRangePicker.months.march'),
    t('dateRangePicker.months.april'),
    t('dateRangePicker.months.may'),
    t('dateRangePicker.months.june'),
    t('dateRangePicker.months.july'),
    t('dateRangePicker.months.august'),
    t('dateRangePicker.months.september'),
    t('dateRangePicker.months.october'),
    t('dateRangePicker.months.november'),
    t('dateRangePicker.months.december')
  ];
  const dayNames = [
    t('dateRangePicker.days.sun'),
    t('dateRangePicker.days.mon'),
    t('dateRangePicker.days.tue'),
    t('dateRangePicker.days.wed'),
    t('dateRangePicker.days.thu'),
    t('dateRangePicker.days.fri'),
    t('dateRangePicker.days.sat')
  ];

  return createPortal(
    <div
      ref={pickerRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl z-[9999] p-2"
      style={{
        left: `${adjustedPosition.left}px`,
        top: `${adjustedPosition.top}px`,
        width: '280px'
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{t('dateRangePicker.title')}</h3>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
          <X size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Text Inputs */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div>
          <label className={`block text-[10px] mb-0.5 ${selectionMode === 'start' ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
            {t('dateRangePicker.startDate')}
          </label>
          <input
            type="text"
            value={tempStartDate}
            onChange={(e) => handleStartDateInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
              }
            }}
            className="w-full px-1.5 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
          />
        </div>
        <div>
          <label className={`block text-[10px] mb-0.5 ${selectionMode === 'end' ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
            {t('dateRangePicker.endDate')}
          </label>
          <input
            type="text"
            value={tempEndDate}
            onChange={(e) => handleEndDateInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
              }
            }}
            className="w-full px-1.5 py-1 text-[10px] border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
          />
        </div>
      </div>

      {/* Calendar */}
      <div className="mb-2">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft size={12} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="text-[11px] font-medium text-gray-900 dark:text-gray-100">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </div>
          <button
            onClick={() => navigateMonth('next')}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronRight size={12} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {dayNames.map(day => (
            <div
              key={day}
              className="text-[9px] font-medium text-gray-500 dark:text-gray-400 text-center py-0.5"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const inRange = isDateInRange(day);
            const selected = isDateSelected(day);
            const today = isToday(day);

            return (
              <button
                key={day}
                onClick={() => handleDateClick(day)}
                className={`
                  aspect-square text-[10px] font-medium rounded transition-colors
                  ${selected
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : inRange
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                  ${today && !selected ? 'ring-1 ring-gray-400 dark:ring-gray-500' : ''}
                  ${selectionMode === 'end' && selectedStart && date < selectedStart ? 'opacity-40' : ''}
                `}
                disabled={selectionMode === 'end' && selectedStart ? date < selectedStart : false}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleClear}
          className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          {t('dateRangePicker.clear')}
        </button>
        <div className="flex gap-1.5">
          {/* Sprint Button - Show if sprint is available */}
          {sprint && sprint.start_date && sprint.end_date && (
            <button
              onClick={handleApplySprintDates}
              className="px-2 py-1 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-700"
              title={`${t('dateRangePicker.applySprintDates')}: ${sprint.name}`}
            >
              {t('dateRangePicker.sprint')}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            {t('dateRangePicker.cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={!tempStartDate}
            className="px-2 py-1 text-[10px] font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('dateRangePicker.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DateRangePicker;
