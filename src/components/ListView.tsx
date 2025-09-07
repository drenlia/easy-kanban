import React, { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Eye, EyeOff, Menu, X, Check, Trash2, Copy, FileText, ChevronLeft, ChevronRight, MessageCircle, UserPlus } from 'lucide-react';
import { Task, TeamMember, Priority, Tag, Columns } from '../types';
import { TaskViewMode, loadUserPreferences, updateUserPreference, ColumnVisibility } from '../utils/userPreferences';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { formatMembersTooltip } from '../utils/taskUtils';
import { getBoardColumns, addTagToTask, removeTagFromTask } from '../api';

interface ListViewScrollControls {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollLeft: () => void;
  scrollRight: () => void;
}

interface ListViewProps {
  filteredColumns: Columns;
  selectedBoard: string | null; // Board ID to fetch columns for
  members: TeamMember[];
  availablePriorities: Priority[];
  availableTags: Tag[];
  taskViewMode: TaskViewMode;
  onSelectTask: (task: Task) => void;
  selectedTask: Task | null;
  onRemoveTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onCopyTask: (task: Task) => void;
  onMoveTaskToColumn: (taskId: string, targetColumnId: string) => Promise<void>;
  animateCopiedTaskId?: string | null; // Task ID to animate (set by parent after copy)
  onScrollControlsChange?: (controls: ListViewScrollControls) => void; // Expose scroll controls to parent
}

type SortField = 'title' | 'priority' | 'assignee' | 'startDate' | 'dueDate' | 'createdAt' | 'column' | 'tags' | 'comments';
type SortDirection = 'asc' | 'desc';

interface ColumnConfig {
  key: SortField;
  label: string;
  visible: boolean;
  width: number;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'title', label: 'Task', visible: true, width: 300 },
  { key: 'assignee', label: 'Assignee', visible: true, width: 120 },
  { key: 'priority', label: 'Priority', visible: true, width: 120 },
  { key: 'column', label: 'Status', visible: true, width: 150 },
  { key: 'startDate', label: 'Start Date', visible: true, width: 140 },
  { key: 'dueDate', label: 'Due Date', visible: true, width: 140 },
  { key: 'tags', label: 'Tags', visible: true, width: 200 },
  { key: 'comments', label: 'Comments', visible: false, width: 100 },
  { key: 'createdAt', label: 'Created', visible: true, width: 120 }
];

export default function ListView({
  filteredColumns,
  selectedBoard,
  members,
  availablePriorities,
  availableTags,
  taskViewMode,
  onSelectTask,
  selectedTask,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onMoveTaskToColumn,
  animateCopiedTaskId,
  onScrollControlsChange
}: ListViewProps) {
  const [sortField, setSortField] = useState<SortField>('column');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Initialize columns from user preferences
  const userPrefs = loadUserPreferences();
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    return DEFAULT_COLUMNS.map(col => ({
      ...col,
      visible: userPrefs.listViewColumnVisibility[col.key] ?? col.visible
    }));
  });
  const [showColumnMenu, setShowColumnMenu] = useState<string | null>(null);
  const [columnMenuPosition, setColumnMenuPosition] = useState<{top: number, left: number} | null>(null);
  const columnMenuButtonRef = useRef<HTMLButtonElement>(null);
  
  // State for board columns fetched from API
  const [boardColumns, setBoardColumns] = useState<{id: string, title: string}[]>([]);
  
  // Animation state for task moves and copies
  const [animatingTask, setAnimatingTask] = useState<string | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'highlight' | 'slide' | 'fade' | null>(null);
  
  // Track copied tasks for animation (triggered manually after copy action)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);

  // Comment tooltip state
  const [showCommentTooltip, setShowCommentTooltip] = useState<string | null>(null); // taskId of tooltip being shown
  const [tooltipPosition, setTooltipPosition] = useState<{vertical: 'above' | 'below', left: number, top: number}>({vertical: 'above', left: 0, top: 0});
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentTooltipShowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentContainerRefs = useRef<{[taskId: string]: HTMLDivElement | null}>({});

  // Horizontal scroll navigation state
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to trigger animation for a copied task
  const animateCopiedTask = useCallback((taskId: string) => {
    setCopiedTaskId(taskId);
    setAnimatingTask(taskId);
    setAnimationPhase('highlight');
    
    // Scroll to the copied task
    setTimeout(() => {
      const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
      if (taskElement) {
        const rect = taskElement.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        
        if (!isVisible) {
          taskElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }
    }, 100);
    
    // Fade out after 2 seconds
    setTimeout(() => {
      setAnimationPhase('fade');
      setTimeout(() => {
        setAnimatingTask(null);
        setAnimationPhase(null);
        setCopiedTaskId(null);
      }, 1000);
    }, 2000);
  }, []);

  // Check scroll state for table
  const checkTableScrollState = () => {
    if (!tableContainerRef.current) return;
    
    const container = tableContainerRef.current;
    const newCanScrollLeft = container.scrollLeft > 0;
    const newCanScrollRight = container.scrollLeft < container.scrollWidth - container.clientWidth;
    
    setCanScrollLeft(newCanScrollLeft);
    setCanScrollRight(newCanScrollRight);
    
    // Notify parent of scroll control changes
    if (onScrollControlsChange) {
      onScrollControlsChange({
        canScrollLeft: newCanScrollLeft,
        canScrollRight: newCanScrollRight,
        scrollLeft: scrollTableLeft,
        scrollRight: scrollTableRight
      });
    }
  };

  // Table scroll functions
  const scrollTableLeft = () => {
    if (!tableContainerRef.current) return;
    tableContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
  };

  const scrollTableRight = () => {
    if (!tableContainerRef.current) return;
    tableContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
  };

  // Continuous scroll for holding down
  const startContinuousScroll = (direction: 'left' | 'right') => {
    const scrollFn = direction === 'left' ? scrollTableLeft : scrollTableRight;
    scrollFn(); // Initial scroll
    scrollIntervalRef.current = setInterval(scrollFn, 150);
  };

  const stopContinuousScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };


  // Cleanup scroll intervals
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  // Trigger animation when parent sets animateCopiedTaskId
  useEffect(() => {
    if (animateCopiedTaskId && !animatingTask) {
      animateCopiedTask(animateCopiedTaskId);
    }
  }, [animateCopiedTaskId, animatingTask, animateCopiedTask]);
  
  // Reset animation state when changing boards
  useEffect(() => {
    setAnimatingTask(null);
    setAnimationPhase(null);
    setCopiedTaskId(null);
  }, [selectedBoard]);

  // Fetch board columns when selectedBoard changes
  useEffect(() => {
    const fetchBoardColumns = async () => {
      if (selectedBoard) {
        try {
          const columns = await getBoardColumns(selectedBoard);
          setBoardColumns(columns);
        } catch (error) {
          console.error('Failed to fetch board columns:', error);
          setBoardColumns([]);
        }
      } else {
        setBoardColumns([]);
      }
    };
    
    fetchBoardColumns();
  }, [selectedBoard]);
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<{taskId: string, field: string} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<{taskId: string, field: string} | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('below');
  const [assigneeDropdownCoords, setAssigneeDropdownCoords] = useState<{left: number; top: number} | null>(null);
  const [priorityDropdownCoords, setPriorityDropdownCoords] = useState<{left: number; top: number} | null>(null);
  const [statusDropdownCoords, setStatusDropdownCoords] = useState<{left: number; top: number} | null>(null);
  const [tagsDropdownCoords, setTagsDropdownCoords] = useState<{left: number; top: number} | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Flatten all tasks from all columns
  const allTasks = useMemo(() => {
    const tasks: (Task & { columnTitle: string })[] = [];
    const columnCounts: {[key: string]: number} = {};
    if (filteredColumns && typeof filteredColumns === 'object') {
      Object.values(filteredColumns).forEach(column => {
        if (column && column.tasks && Array.isArray(column.tasks)) {
          columnCounts[column.title] = column.tasks.length;
          column.tasks.forEach(task => {
            tasks.push({ ...task, columnTitle: column.title });
          });
        }
      });
    }
    return tasks;
  }, [filteredColumns]);

  // Sort tasks with multi-level sorting
  const sortedTasks = useMemo(() => {
    return [...allTasks].sort((a, b) => {
      // Multi-level sort when using default column sort, or single-field sort when user clicks a column
      if (sortField === 'column' && sortDirection === 'asc') {
        // Default multi-level sort: status → start date desc → due date desc → title asc
        
        // 1. By status (column title)
        const statusCompare = a.columnTitle.localeCompare(b.columnTitle);
        if (statusCompare !== 0) return statusCompare;
        
        // 2. By start date descending (newest first)
        const aStartDate = new Date(a.startDate);
        const bStartDate = new Date(b.startDate);
        const aStartTime = !isNaN(aStartDate.getTime()) ? aStartDate.getTime() : 0;
        const bStartTime = !isNaN(bStartDate.getTime()) ? bStartDate.getTime() : 0;
        if (aStartTime !== bStartTime) return bStartTime - aStartTime; // desc
        
        // 3. By due date descending (latest due dates first)
        const aDueDate = a.dueDate ? new Date(a.dueDate) : null;
        const bDueDate = b.dueDate ? new Date(b.dueDate) : null;
        const aDueTime = aDueDate && !isNaN(aDueDate.getTime()) ? aDueDate.getTime() : 0;
        const bDueTime = bDueDate && !isNaN(bDueDate.getTime()) ? bDueDate.getTime() : 0;
        if (aDueTime !== bDueTime) return bDueTime - aDueTime; // desc
        
        // 4. By task title ascending
        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      } else {
        // Single-field sorting when user clicks on a column header
        let aValue: any, bValue: any;

        switch (sortField) {
          case 'title':
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          case 'priority':
            const aPriority = availablePriorities?.find(p => p.id === a.priorityId);
            const bPriority = availablePriorities?.find(p => p.id === b.priorityId);
            aValue = aPriority?.order || 999;
            bValue = bPriority?.order || 999;
            break;
          case 'assignee':
            const aMember = members?.find(m => m.id === a.memberId);
            const bMember = members?.find(m => m.id === b.memberId);
            aValue = aMember ? `${aMember.firstName} ${aMember.lastName}`.toLowerCase() : '';
            bValue = bMember ? `${bMember.firstName} ${bMember.lastName}`.toLowerCase() : '';
            break;
          case 'dueDate':
            const aDate = a.dueDate ? new Date(a.dueDate) : null;
            const bDate = b.dueDate ? new Date(b.dueDate) : null;
            aValue = aDate && !isNaN(aDate.getTime()) ? aDate.getTime() : 0;
            bValue = bDate && !isNaN(bDate.getTime()) ? bDate.getTime() : 0;
            break;
          case 'startDate':
            const aStart = new Date(a.startDate);
            const bStart = new Date(b.startDate);
            aValue = !isNaN(aStart.getTime()) ? aStart.getTime() : 0;
            bValue = !isNaN(bStart.getTime()) ? bStart.getTime() : 0;
            break;
          case 'createdAt':
            const aCreated = new Date(a.createdAt);
            const bCreated = new Date(b.createdAt);
            aValue = !isNaN(aCreated.getTime()) ? aCreated.getTime() : 0;
            bValue = !isNaN(bCreated.getTime()) ? bCreated.getTime() : 0;
            break;
          case 'column':
            aValue = a.columnTitle.toLowerCase();
            bValue = b.columnTitle.toLowerCase();
            break;
          case 'tags':
            aValue = a.tags?.length || 0;
            bValue = b.tags?.length || 0;
            break;
          case 'comments':
            aValue = a.comments?.length || 0;
            bValue = b.comments?.length || 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [allTasks, sortField, sortDirection, availablePriorities, members]);

  // Update scroll state when table content changes
  useEffect(() => {
    // Check scroll state after a short delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      checkTableScrollState();
    }, 100);
    
    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkTableScrollState);
      const resizeObserver = new ResizeObserver(() => {
        // Also delay the resize check
        setTimeout(checkTableScrollState, 50);
      });
      resizeObserver.observe(container);
      
      return () => {
        clearTimeout(timeoutId);
        container.removeEventListener('scroll', checkTableScrollState);
        resizeObserver.disconnect();
      };
    }
    
    return () => clearTimeout(timeoutId);
  }, [sortedTasks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleColumnVisibility = (key: SortField) => {
    const newColumns = columns.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    );
    
    // Prevent hiding all columns - ensure at least one is always visible
    const visibleCount = newColumns.filter(col => col.visible).length;
    if (visibleCount === 0) {
      return; // Don't allow hiding all columns
    }
    
    setColumns(newColumns);
    
    // Save column visibility to user preferences
    const columnVisibility: ColumnVisibility = {};
    newColumns.forEach(col => {
      columnVisibility[col.key] = col.visible;
    });
    updateUserPreference('listViewColumnVisibility', columnVisibility);
  };

  const handleColumnMenuToggle = () => {
    if (showColumnMenu === 'rowNumber') {
      // Close menu
      setShowColumnMenu(null);
      setColumnMenuPosition(null);
    } else {
      // Open menu and calculate position
      const button = columnMenuButtonRef.current;
      if (button) {
        const rect = button.getBoundingClientRect();
        setColumnMenuPosition({
          top: rect.bottom + window.scrollY + 4, // 4px spacing
          left: rect.left + window.scrollX
        });
        setShowColumnMenu('rowNumber');
      }
    }
  };

  const getPriorityDisplay = (priorityString: string) => {
    const priority = availablePriorities?.find(p => p.priority === priorityString);
    if (!priority) return null;
    
    return (
      <span 
        className="px-1.5 py-0.5 rounded text-xs font-medium"
        style={{ 
          backgroundColor: priority.color + '20',
          color: priority.color,
          border: `1px solid ${priority.color}40`
        }}
      >
        {priority.priority}
      </span>
    );
  };

  const getTagsDisplay = (tags: Tag[]) => {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return (
        <div className="px-2 py-1 border border-dashed border-gray-300 rounded text-xs text-gray-400 cursor-pointer hover:border-gray-400 hover:text-gray-500">
          Click to add tags
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1">
        {tags.slice(0, 2).map(tag => (
          <span
            key={tag.id}
            className="px-1.5 py-0.5 rounded text-xs font-medium"
            style={(() => {
              if (!tag.color) {
                return { backgroundColor: '#6b7280', color: 'white' };
              }
              
              // Calculate luminance to determine text color
              const hex = tag.color.replace('#', '');
              if (hex.length === 6) {
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                
                // Calculate relative luminance
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                
                // Use dark text for light backgrounds, white text for dark backgrounds
                const textColor = luminance > 0.6 ? '#374151' : '#ffffff';
                const borderStyle = textColor === '#374151' ? { border: '1px solid #d1d5db' } : {};
                
                return { backgroundColor: tag.color, color: textColor, ...borderStyle };
              }
              
              // Fallback for invalid hex colors
              return { backgroundColor: tag.color, color: 'white' };
            })()}
          >
            {tag.tag}
          </span>
        ))}
        {tags.length > 2 && (
          <span className="text-xs text-gray-500">+{tags.length - 2}</span>
        )}
      </div>
    );
  };

  const getMemberDisplay = (memberId: string, task?: Task) => {
    const member = members?.find(m => m.id === memberId);
    if (!member) return null;

    const watchersCount = task?.watchers?.length || 0;
    const collaboratorsCount = task?.collaborators?.length || 0;

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <img
            src={member.avatarUrl || member.googleAvatarUrl || '/default-avatar.png'}
            alt={`${member.firstName} ${member.lastName}`}
            className="w-5 h-5 rounded-full object-cover border border-gray-200"
          />
          <span className="text-xs text-gray-900 truncate">{member.firstName} {member.lastName}</span>
        </div>
        
        {/* Watchers & Collaborators Icons */}
        <div className="flex gap-1">
          {task?.watchers && task.watchers.length > 0 && (
            <div className="flex items-center" title={formatMembersTooltip(task.watchers, 'watcher')}>
              <Eye size={10} className="text-blue-500" />
              <span className="text-[9px] text-blue-600 ml-0.5 font-medium">{task.watchers.length}</span>
            </div>
          )}
          {task?.collaborators && task.collaborators.length > 0 && (
            <div className="flex items-center" title={formatMembersTooltip(task.collaborators, 'collaborator')}>
              <UserPlus size={10} className="text-blue-500" />
              <span className="text-[9px] text-blue-600 ml-0.5 font-medium">{task.collaborators.length}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return formatToYYYYMMDD(dateString);
    } catch (error) {
      console.warn('Date formatting error:', error, 'for date:', dateString);
      return dateString; // Fallback to original string
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return formatToYYYYMMDDHHmmss(dateString);
    } catch (error) {
      console.warn('DateTime formatting error:', error, 'for date:', dateString);
      return dateString; // Fallback to original string
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(null);
        setAssigneeDropdownCoords(null);
        setPriorityDropdownCoords(null);
        setStatusDropdownCoords(null);
        setTagsDropdownCoords(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColumnMenu && columnMenuButtonRef.current && !columnMenuButtonRef.current.contains(event.target as Node)) {
        // Check if the click is on the portal menu itself
        const target = event.target as HTMLElement;
        const isPortalClick = target.closest('[data-column-menu-portal]');
        if (!isPortalClick) {
          setShowColumnMenu(null);
          setColumnMenuPosition(null);
        }
      }
    };

    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showColumnMenu]);

  // Inline editing functions
  const startEditing = (taskId: string, field: string, currentValue: string) => {
    setEditingCell({ taskId, field });
    setEditValue(currentValue);
    setShowDropdown(null);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    const task = allTasks.find(t => t.id === editingCell.taskId);
    if (!task) return;

    const updatedTask = {
      ...task,
      [editingCell.field]: editValue
    };

    try {
      await onEditTask(updatedTask);
      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Failed to save edit:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const calculateDropdownPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // If there's more space above and below is tight, show above
    return spaceBelow < 200 && spaceAbove > spaceBelow ? 'above' : 'below';
  };

  const calculateDropdownCoords = (element: HTMLElement, dropdownType: 'assignee' | 'priority' | 'status' | 'tags') => {
    const rect = element.getBoundingClientRect();
    
    // Set dimensions based on dropdown type
    let dropdownWidth = 180;
    let dropdownHeight = 150;
    
    switch (dropdownType) {
      case 'assignee':
        dropdownWidth = 180;
        dropdownHeight = 150;
        break;
      case 'priority':
        dropdownWidth = 120;
        dropdownHeight = 120;
        break;
      case 'status':
        dropdownWidth = 150;
        dropdownHeight = 200;
        break;
      case 'tags':
        dropdownWidth = 200;
        dropdownHeight = 180;
        break;
    }
    
    // Calculate horizontal position
    let left = rect.left;
    const spaceRight = window.innerWidth - (left + dropdownWidth);
    
    // If dropdown would go beyond right edge, position it to the left of the trigger
    if (spaceRight < 10) {
      left = rect.right - dropdownWidth;
    }
    
    // If still beyond left edge, align to viewport edge
    if (left < 10) {
      left = 10;
    }
    
    // Calculate vertical position
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    let top;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      // Show above
      top = rect.top - dropdownHeight - 4;
    } else {
      // Show below
      top = rect.bottom + 4;
    }
    
    // Ensure dropdown stays within viewport
    top = Math.max(10, Math.min(top, window.innerHeight - dropdownHeight - 10));
    
    return { left, top };
  };

  const toggleDropdown = (taskId: string, field: string, event?: React.MouseEvent) => {
    if (showDropdown?.taskId === taskId && showDropdown?.field === field) {
      setShowDropdown(null);
      setAssigneeDropdownCoords(null);
      setPriorityDropdownCoords(null);
      setStatusDropdownCoords(null);
      setTagsDropdownCoords(null);
    } else {
      if (event?.currentTarget) {
        const element = event.currentTarget as HTMLElement;
        const position = calculateDropdownPosition(element);
        setDropdownPosition(position);
        
        // Calculate Portal coordinates for each dropdown type
        setAssigneeDropdownCoords(null);
        setPriorityDropdownCoords(null);
        setStatusDropdownCoords(null);
        setTagsDropdownCoords(null);
        
        if (field === 'assignee') {
          const coords = calculateDropdownCoords(element, 'assignee');
          setAssigneeDropdownCoords(coords);
        } else if (field === 'priority') {
          const coords = calculateDropdownCoords(element, 'priority');
          setPriorityDropdownCoords(coords);
        } else if (field === 'column') {
          const coords = calculateDropdownCoords(element, 'status');
          setStatusDropdownCoords(coords);
        } else if (field === 'tags') {
          const coords = calculateDropdownCoords(element, 'tags');
          setTagsDropdownCoords(coords);
        }
      }
      setShowDropdown({ taskId, field });
      setEditingCell(null);
    }
  };

  const handleDropdownSelect = async (taskId: string, field: string, value: string | Tag[]) => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTask = {
      ...task,
      [field]: value
    };

    try {
      await onEditTask(updatedTask);
      setShowDropdown(null);
      setAssigneeDropdownCoords(null);
      setPriorityDropdownCoords(null);
      setStatusDropdownCoords(null);
      setTagsDropdownCoords(null);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  // Comment tooltip handlers
  const handleCommentTooltipShow = (taskId: string) => {
    // Clear any pending hide timeout
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
    
    // Clear any existing show timeout
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
    }
    
    // Wait 1 second before showing tooltip
    commentTooltipShowTimeoutRef.current = setTimeout(() => {
      // Calculate best position for tooltip
      const position = calculateTooltipPosition(taskId);
      setTooltipPosition(position);
      setShowCommentTooltip(taskId);
      commentTooltipShowTimeoutRef.current = null;
    }, 1000);
  };

  const handleCommentTooltipHide = () => {
    // Cancel any pending show timeout when leaving
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
      commentTooltipShowTimeoutRef.current = null;
    }
    
    // Only hide after a delay to allow mouse movement into tooltip
    commentTooltipTimeoutRef.current = setTimeout(() => {
      setShowCommentTooltip(null);
    }, 500); // Generous delay
  };

  const handleCommentTooltipClose = () => {
    // Immediately close tooltip without delay
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
      commentTooltipShowTimeoutRef.current = null;
    }
    setShowCommentTooltip(null);
  };

  const calculateTooltipPosition = (taskId: string) => {
    const containerRef = commentContainerRefs.current[taskId];
    if (containerRef) {
      const commentRect = containerRef.getBoundingClientRect();
      const tooltipWidth = 320; // w-80 = 320px
      const tooltipHeight = 256; // max-h-64 = 256px
      
      // Find the table row element that contains this comment
      let rowElement = containerRef.closest('tr');
      if (!rowElement) {
        // Fallback to comment container if row not found
        rowElement = containerRef;
      }
      
      const rowRect = rowElement.getBoundingClientRect();
      
      // Calculate vertical position based on the row
      const spaceAbove = rowRect.top;
      const spaceBelow = window.innerHeight - rowRect.bottom;
      const vertical: 'above' | 'below' = spaceAbove >= tooltipHeight ? 'above' : spaceBelow >= tooltipHeight ? 'below' : 'above';
      
      // Calculate horizontal position - center tooltip on the comment icon
      let left = commentRect.left + (commentRect.width / 2) - (tooltipWidth / 2);
      const spaceRight = window.innerWidth - (left + tooltipWidth);
      
      // If tooltip would go beyond right edge, align to right edge of viewport
      if (spaceRight < 20) {
        left = window.innerWidth - tooltipWidth - 20; // 20px padding from edge
      }
      
      // If tooltip would go beyond left edge, align to left edge
      if (left < 20) {
        left = 20;
      }
      
      // Position tooltip close to the comment icon
      let top;
      if (vertical === 'above') {
        top = commentRect.top - 20; // Just 20px above the comment icon
      } else {
        top = commentRect.bottom + 20; // Just 20px below the comment icon
      }
      
      return {
        vertical,
        left,
        top
      };
    }
    return { vertical: 'above', left: 0, top: 0 };
  };

  const visibleColumns = columns.filter(col => col.visible);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Scrollable table container */}
        <div
          ref={tableContainerRef}
          className="overflow-x-auto w-full"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: '#CBD5E1 #F1F5F9'
          }}
        >
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* Row number column with column management dropdown */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative group w-16">
                <div className="flex items-center justify-between">
                  <span>#</span>
                  <button
                    ref={columnMenuButtonRef}
                    onClick={handleColumnMenuToggle}
                    className="opacity-60 hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                    title="Show/Hide Columns"
                  >
                    <Menu size={14} />
                  </button>
                </div>

              </th>
              {visibleColumns.map(column => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 relative group"
                  style={{ 
                    width: column.width,
                    maxWidth: column.key === 'title' ? 300 : column.width,
                    minWidth: column.key === 'title' ? 200 : 'auto'
                  }}
                  onClick={() => handleSort(column.key)}
                >
                  <div className="flex items-center justify-between">
                    <span>{column.label}</span>
                    {sortField === column.key && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-gray-500">
                  No tasks found matching your filters
                </td>
              </tr>
            ) : (
              sortedTasks.map((task, index) => {
                // Animation classes based on phase
                const getAnimationClasses = () => {
                  if (animatingTask !== task.id) return '';
                  
                  switch (animationPhase) {
                    case 'highlight':
                      return 'bg-yellow-200 border-l-4 border-yellow-500 transform scale-105 transition-all duration-500';
                    case 'slide':
                      return 'bg-blue-200 border-l-4 border-blue-500 transform translate-y-4 transition-all duration-800';
                    case 'fade':
                      return 'bg-green-100 border-l-4 border-green-500 transition-all duration-1000';
                    default:
                      return '';
                  }
                };
                
                return (
                <React.Fragment key={task.id}>
                  {/* Main task row */}
                  <tr
                    data-task-id={task.id}
                    className={`group hover:bg-gray-50 transition-all duration-300 ${
                      selectedTask?.id === task.id ? 'bg-blue-50' : ''
                    } ${getAnimationClasses()}`}
                  >
                  {/* Row number and actions cell */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 w-24">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 mr-1">{index + 1}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTask(task);
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded text-gray-600 hover:text-blue-600"
                          title="View Details"
                        >
                          <FileText size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyTask(task);
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded text-gray-600 hover:text-green-600"
                          title="Copy Task"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveTask(task.id, e);
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded text-gray-600 hover:text-red-600"
                          title="Delete Task"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </td>
                  {visibleColumns.map(column => (
                    <td 
                      key={column.key} 
                      className={`px-3 py-2 ${column.key !== 'title' ? 'whitespace-nowrap' : ''}`}
                      style={{ 
                        maxWidth: column.key === 'title' ? 300 : column.width,
                        minWidth: column.key === 'title' ? 200 : 'auto'
                      }}
                    >
                      {column.key === 'title' && (
                        <div className="max-w-full">
                          {editingCell?.taskId === task.id && editingCell?.field === 'title' ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={handleKeyDown}
                              className="text-sm font-medium text-gray-900 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div 
                              className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5" 
                              title={task.title}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startEditing(task.id, 'title', task.title);
                              }}
                            >
                              {task.title}
                            </div>
                          )}
                          {task.description && taskViewMode !== 'compact' && (
                            editingCell?.taskId === task.id && editingCell?.field === 'description' ? (
                              <textarea
                                ref={editInputRef as any}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={handleKeyDown}
                                className="text-sm text-gray-500 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full resize-none"
                                rows={2}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div 
                                className={`text-sm text-gray-500 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 ${
                                  taskViewMode === 'shrink' ? 'truncate' : 'break-words'
                                }`} 
                                title={task.description}
                                style={{
                                  maxHeight: taskViewMode === 'shrink' ? '1.5em' : 'none',
                                  overflow: taskViewMode === 'shrink' ? 'hidden' : 'visible'
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(task.id, 'description', task.description);
                                }}
                              >
                                {taskViewMode === 'shrink' && task.description.length > 100 
                                  ? `${task.description.substring(0, 100)}...` 
                                  : task.description
                                }
                              </div>
                            )
                          )}
                        </div>
                      )}
                      {column.key === 'assignee' && (
                        <div className="relative">
                          <div 
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDropdown(task.id, 'assignee', e);
                            }}
                          >
                            {getMemberDisplay(task.memberId, task)}
                          </div>
                        </div>
                      )}
                      {column.key === 'priority' && (
                        <div className="relative">
                          <div 
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDropdown(task.id, 'priority', e);
                            }}
                          >
                            {getPriorityDisplay(task.priority)}
                          </div>
                        </div>
                      )}
                      {column.key === 'column' && (
                        <div className="relative">
                          <span 
                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs cursor-pointer hover:bg-gray-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDropdown(task.id, 'column', e);
                            }}
                          >
                            {task.columnTitle}
                          </span>
                        </div>
                      )}
                      {column.key === 'startDate' && (
                        editingCell?.taskId === task.id && editingCell?.field === 'startDate' ? (
                          <input
                            ref={editInputRef}
                            type="date"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={handleKeyDown}
                            className="text-xs text-gray-700 font-mono bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span 
                            className="text-xs text-gray-700 font-mono cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(task.id, 'startDate', task.startDate);
                            }}
                          >
                            {formatDate(task.startDate)}
                          </span>
                        )
                      )}
                      {column.key === 'dueDate' && (
                        editingCell?.taskId === task.id && editingCell?.field === 'dueDate' ? (
                          <input
                            ref={editInputRef}
                            type="date"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={handleKeyDown}
                            className="text-xs font-mono bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : task.dueDate ? (
                          <span 
                            className={`text-xs font-mono cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 ${
                              (() => {
                                const dueDate = new Date(task.dueDate);
                                return !isNaN(dueDate.getTime()) && dueDate < new Date() ? 'text-red-600' : 'text-gray-700';
                              })()
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(task.id, 'dueDate', task.dueDate || '');
                            }}
                          >
                            {formatDate(task.dueDate)}
                          </span>
                        ) : (
                          <span 
                            className="text-gray-400 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 border border-dashed border-gray-300 hover:border-gray-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(task.id, 'dueDate', '');
                            }}
                          >
                            Click to set date
                          </span>
                        )
                      )}
                      {column.key === 'tags' && (
                        <div className="relative">
                          <div 
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDropdown(task.id, 'tags', e);
                            }}
                          >
                            {getTagsDisplay(task.tags || [])}
                          </div>
                        </div>
                      )}
                      {column.key === 'comments' && (
                        task.comments && task.comments.length > 0 ? (
                          <div 
                            ref={(el) => commentContainerRefs.current[task.id] = el}
                            className="relative"
                            onMouseEnter={() => handleCommentTooltipShow(task.id)}
                            onMouseLeave={handleCommentTooltipHide}
                          >
                            <div
                              className="flex items-center gap-0.5 rounded px-1 py-1 cursor-pointer"
                              title="Hover to view comments"
                            >
                              <MessageCircle 
                                size={12} 
                                className="text-blue-600" 
                              />
                              <span className="text-blue-600 font-medium text-xs">
                                {task.comments.length}
                              </span>
                            </div>
                          
                          </div>
                        ) : (
                          // Hide comment counter when there are no comments
                          <span className="text-xs text-transparent">
                            {/* Empty space to maintain column alignment */}
                          </span>
                        )
                      )}
                      {column.key === 'createdAt' && (
                        <span className="text-xs text-gray-500 font-mono">
                          {formatToYYYYMMDDHHmmss(task.createdAt)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        </div>

      {/* Click outside to close column menu */}
      {showColumnMenu && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowColumnMenu(null)}
        />
      )}

      {/* Portal-rendered comment tooltip */}
      {showCommentTooltip && createPortal(
        <div 
          className="comment-tooltip fixed w-80 bg-gray-800 text-white text-xs rounded-md shadow-lg z-[9999] max-h-64 flex flex-col"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`
          }}
          onMouseEnter={() => handleCommentTooltipShow(showCommentTooltip)}
          onMouseLeave={handleCommentTooltipHide}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const task = allTasks.find(t => t.id === showCommentTooltip);
            if (!task || !task.comments) return null;

            return (
              <>
                {/* Scrollable comments area */}
                <div className="p-3 overflow-y-auto flex-1">
                  {task.comments
                    .filter(comment => 
                      comment && 
                      comment.id && 
                      comment.text && 
                      comment.authorId && 
                      comment.createdAt
                    )
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((comment, index) => {
                      const author = members.find(m => m.id === comment.authorId);
                      
                      // Function to render HTML content with safe link handling
                      const renderCommentHTML = (htmlText: string) => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlText;
                        
                        const links = tempDiv.querySelectorAll('a');
                        links.forEach(link => {
                          link.setAttribute('target', '_blank');
                          link.setAttribute('rel', 'noopener noreferrer');
                          link.style.color = '#60a5fa';
                          link.style.textDecoration = 'underline';
                          link.style.wordBreak = 'break-all';
                          link.style.cursor = 'pointer';
                          
                          link.addEventListener('click', (e) => {
                            e.stopPropagation();
                            window.open(link.href, '_blank', 'noopener,noreferrer');
                          });
                        });
                        
                        return { __html: tempDiv.innerHTML };
                      };
                      
                      return (
                        <div key={comment.id} className={`${index > 0 ? 'mt-3 pt-3 border-t border-gray-600' : ''}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <div 
                              className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                              style={{ backgroundColor: author?.color || '#6B7280' }} 
                            />
                            <span className="font-medium text-gray-200">{author?.name || 'Unknown'}</span>
                            <span className="text-gray-400 text-xs">
                              {formatToYYYYMMDDHHmmss(comment.createdAt)}
                            </span>
                          </div>
                          <div className="text-gray-300 text-xs leading-relaxed select-text">
                            <div dangerouslySetInnerHTML={renderCommentHTML(comment.text)} />
                          </div>
                        </div>
                      );
                    })}
                </div>
                
                {/* Sticky footer */}
                <div className="border-t border-gray-600 p-3 bg-gray-800 rounded-b-md flex items-center justify-between">
                  <span className="text-gray-300 font-medium">
                    Comments ({task.comments.length})
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCommentTooltipClose(); // Close tooltip immediately
                      onSelectTask(task);
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    Open
                  </button>
                </div>
              </>
            );
          })()}
        </div>,
        document.body
      )}

      {/* Portal-rendered Assignee Dropdown */}
      {showDropdown?.field === 'assignee' && assigneeDropdownCoords && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[9999] min-w-[180px]"
          style={{
            left: `${assigneeDropdownCoords.left}px`,
            top: `${assigneeDropdownCoords.top}px`,
          }}
        >
          <div className="py-1">
            {members?.map(member => (
              <button
                key={member.id}
                onClick={() => handleDropdownSelect(showDropdown.taskId, 'memberId', member.id)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <img
                  src={member.avatarUrl || member.googleAvatarUrl || '/default-avatar.png'}
                  alt={member.name}
                  className="w-4 h-4 rounded-full object-cover border border-gray-200"
                />
                <span className="text-sm text-gray-900 font-medium">
                  {member.name}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Portal-rendered Priority Dropdown */}
      {showDropdown?.field === 'priority' && priorityDropdownCoords && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[9999] min-w-[120px]"
          style={{
            left: `${priorityDropdownCoords.left}px`,
            top: `${priorityDropdownCoords.top}px`,
          }}
        >
          <div className="py-1">
            {availablePriorities?.map(priority => (
              <button
                key={priority.id}
                onClick={() => handleDropdownSelect(showDropdown.taskId, 'priority', priority.priority)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center"
              >
                <span 
                  className="px-1.5 py-0.5 rounded text-xs font-medium mr-2"
                  style={{ 
                    backgroundColor: priority.color + '20',
                    color: priority.color,
                    border: `1px solid ${priority.color}40`
                  }}
                >
                  {priority.priority}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Portal-rendered Status Dropdown */}
      {showDropdown?.field === 'column' && statusDropdownCoords && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[9999] min-w-[150px]"
          style={{
            left: `${statusDropdownCoords.left}px`,
            top: `${statusDropdownCoords.top}px`,
          }}
        >
          <div className="py-1 flex flex-col">
            {boardColumns && boardColumns.length > 0 ? (
              boardColumns.map((col) => {
                const task = allTasks.find(t => t.id === showDropdown.taskId);
                return (
                  <button
                    key={col.id}
                    onClick={async () => {
                      try {
                        if (!task) return;
                        
                        // Find current column title
                        const currentColumn = boardColumns.find(c => c.title === task.columnTitle);
                        const targetColumn = col;
                        
                        // Only animate if actually moving to a different column
                        if (currentColumn && currentColumn.id !== targetColumn.id) {
                          // Start animation sequence
                          setAnimatingTask(task.id);
                          setAnimationPhase('highlight');
                          
                          // Phase 1: Highlight (500ms)
                          setTimeout(() => {
                            setAnimationPhase('slide');
                          }, 500);
                          
                          // Phase 2: Slide and move task (800ms)
                          setTimeout(async () => {
                            await onMoveTaskToColumn(task.id, col.id);
                            setAnimationPhase('fade');
                            
                            // After task moves, check if we need to scroll to follow it
                            setTimeout(() => {
                              const newTaskRowElement = document.querySelector(`tr[data-task-id="${task.id}"]`);
                              if (newTaskRowElement) {
                                const rect = newTaskRowElement.getBoundingClientRect();
                                const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
                                
                                if (!isVisible) {
                                  newTaskRowElement.scrollIntoView({ 
                                    behavior: 'smooth', 
                                    block: 'center' 
                                  });
                                }
                              }
                            }, 100);
                          }, 800);
                          
                          // Phase 3: Fade back to normal (1200ms)
                          setTimeout(() => {
                            setAnimatingTask(null);
                            setAnimationPhase(null);
                          }, 2000);
                        } else {
                          // No animation needed, just move
                          await onMoveTaskToColumn(task.id, col.id);
                        }
                        
                        setShowDropdown(null);
                        setStatusDropdownCoords(null);
                      } catch (error) {
                        console.error('Failed to move task to column:', error);
                        setAnimatingTask(null);
                        setAnimationPhase(null);
                      }
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 block ${
                      task?.columnTitle === col.title ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    {col.title}
                    {task?.columnTitle === col.title && (
                      <span className="ml-auto text-blue-600">✓</span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-gray-500">No columns available</div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Portal-rendered Tags Dropdown */}
      {showDropdown?.field === 'tags' && tagsDropdownCoords && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[9999] min-w-[180px]"
          style={{
            left: `${tagsDropdownCoords.left}px`,
            top: `${tagsDropdownCoords.top}px`,
          }}
        >
          <div className="py-1 max-h-48 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-medium text-gray-700 border-b border-gray-100">
              Click to toggle tags
            </div>
            {availableTags?.map(tag => {
              const task = allTasks.find(t => t.id === showDropdown.taskId);
              const isSelected = task?.tags?.some(t => t.id === tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={async () => {
                    try {
                      if (!task) return;
                      
                      if (isSelected) {
                        // Remove tag using proper API
                        await removeTagFromTask(task.id, tag.id);
                      } else {
                        // Add tag using proper API
                        await addTagToTask(task.id, tag.id);
                      }
                      
                      // Close dropdown
                      setShowDropdown(null);
                      setTagsDropdownCoords(null);
                      
                      // Create updated task for parent to refresh
                      const updatedTask = { ...task };
                      // Trigger parent refresh by calling onEditTask with current task
                      await onEditTask(updatedTask);
                    } catch (error) {
                      console.error('Failed to toggle tag:', error);
                    }
                  }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2 ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <span 
                    className="px-1.5 py-0.5 rounded text-xs font-medium"
                    style={(() => {
                      if (!tag.color) {
                        return { backgroundColor: '#6b7280', color: 'white' };
                      }
                      
                      // Calculate luminance to determine text color
                      const hex = tag.color.replace('#', '');
                      if (hex.length === 6) {
                        const r = parseInt(hex.substring(0, 2), 16);
                        const g = parseInt(hex.substring(2, 4), 16);
                        const b = parseInt(hex.substring(4, 6), 16);
                        
                        // Calculate relative luminance
                        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        
                        // Use dark text for light backgrounds, white text for dark backgrounds
                        const textColor = luminance > 0.6 ? '#374151' : '#ffffff';
                        const borderStyle = textColor === '#374151' ? { border: '1px solid #d1d5db' } : {};
                        
                        return { backgroundColor: tag.color, color: textColor, ...borderStyle };
                      }
                      
                      // Fallback for invalid hex colors
                      return { backgroundColor: tag.color, color: 'white' };
                    })()}
                  >
                    {tag.tag}
                  </span>
                  {isSelected && <span className="ml-auto text-blue-600">✓</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* Column Management Menu Portal */}
      {showColumnMenu === 'rowNumber' && columnMenuPosition && createPortal(
        <div 
          data-column-menu-portal
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg min-w-[160px] z-50"
          style={{
            top: columnMenuPosition.top,
            left: columnMenuPosition.left,
          }}
        >
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-700 border-b border-gray-100">
              Show/Hide Columns
            </div>
            {columns.map(col => (
              <button
                key={col.key}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleColumnVisibility(col.key);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                disabled={col.visible && visibleColumns.length === 1} // Prevent hiding last column
              >
                {col.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                <span className={col.visible && visibleColumns.length === 1 ? 'text-gray-400' : ''}>
                  {col.label}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
