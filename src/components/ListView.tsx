import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, MoreHorizontal, X, Check, Trash2, Copy, FileText } from 'lucide-react';
import { Task, TeamMember, Priority, Tag, Columns, TaskViewMode } from '../types';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { getBoardColumns } from '../api';

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
  onMoveTaskToColumn
}: ListViewProps) {
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [showColumnMenu, setShowColumnMenu] = useState<string | null>(null);
  
  // State for board columns fetched from API
  const [boardColumns, setBoardColumns] = useState<{id: string, title: string}[]>([]);
  
  // Animation state for task moves
  const [animatingTask, setAnimatingTask] = useState<string | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'highlight' | 'slide' | 'fade' | null>(null);
  
  // Fetch board columns when selectedBoard changes
  useEffect(() => {
    console.log('🔥 NEW LISTVIEW CODE IS RUNNING! selectedBoard:', selectedBoard);
    const fetchBoardColumns = async () => {
      if (selectedBoard) {
        try {
          console.log('🔥 FETCHING COLUMNS FOR BOARD:', selectedBoard);
          const columns = await getBoardColumns(selectedBoard);
          setBoardColumns(columns);
          console.log('📋 FETCHED BOARD COLUMNS:', columns);
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
    console.log(`📋 LISTVIEW COUNT:`, {
      totalTasks: tasks.length,
      columnCounts,
      columnsUsed: Object.keys(filteredColumns || {}).length
    });
    return tasks;
  }, [filteredColumns]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...allTasks].sort((a, b) => {
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
    });
  }, [allTasks, sortField, sortDirection, availablePriorities, members]);

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
            className="px-1.5 py-0.5 rounded text-xs"
            style={{
              backgroundColor: tag.color + '20',
              color: tag.color,
              border: `1px solid ${tag.color}40`
            }}
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

  const getMemberDisplay = (memberId: string) => {
    const member = members?.find(m => m.id === memberId);
    if (!member) return null;

    return (
      <div className="flex items-center gap-2">
        <img
          src={member.avatarUrl || member.googleAvatarUrl || '/default-avatar.png'}
          alt={`${member.firstName} ${member.lastName}`}
          className="w-5 h-5 rounded-full object-cover border border-gray-200"
        />
        <span className="text-xs text-gray-900 truncate">{member.firstName} {member.lastName}</span>
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
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const toggleDropdown = (taskId: string, field: string, event?: React.MouseEvent) => {
    if (showDropdown?.taskId === taskId && showDropdown?.field === field) {
      setShowDropdown(null);
    } else {
      if (event?.currentTarget) {
        const position = calculateDropdownPosition(event.currentTarget as HTMLElement);
        setDropdownPosition(position);
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
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const visibleColumns = columns.filter(col => col.visible);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Tasks List ({sortedTasks.length} {sortedTasks.length === 1 ? 'task' : 'tasks'})
        </h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* Row number column with column management dropdown */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative group w-16">
                <div className="flex items-center justify-between">
                  <span>#</span>
                  <button
                    onClick={() => setShowColumnMenu(showColumnMenu === 'rowNumber' ? null : 'rowNumber')}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded"
                    title="Show/Hide Columns"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </div>

                {/* Column Management Menu */}
                {showColumnMenu === 'rowNumber' && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[160px]">
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
                  </div>
                )}
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
                            onRemoveTask(task.id);
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
                            {getMemberDisplay(task.memberId)}
                          </div>
                          {showDropdown?.taskId === task.id && showDropdown?.field === 'assignee' && (
                            <div 
                              ref={dropdownRef}
                              className={`absolute ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[180px]`}
                            >
                              <div className="py-1">
                                {members?.map(member => (
                                  <button
                                    key={member.id}
                                    onClick={() => handleDropdownSelect(task.id, 'memberId', member.id)}
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
                            </div>
                          )}
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
                          {showDropdown?.taskId === task.id && showDropdown?.field === 'priority' && (
                            <div 
                              ref={dropdownRef}
                              className={`absolute ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[120px]`}
                            >
                              <div className="py-1">
                                {availablePriorities?.map(priority => (
                                  <button
                                    key={priority.id}
                                    onClick={() => handleDropdownSelect(task.id, 'priority', priority.priority)}
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
                            </div>
                          )}
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
                          {showDropdown?.taskId === task.id && showDropdown?.field === 'column' && (
                            <div 
                              ref={dropdownRef}
                              className={`absolute ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[150px]`}
                            >
                              <div className="py-1 flex flex-col">
                                {/* Debug: log boardColumns */}
                                {console.log('📋 STATUS DROPDOWN - boardColumns:', boardColumns)}
                                {console.log('📋 STATUS DROPDOWN - About to render buttons. boardColumns.length:', boardColumns?.length)}
                                {boardColumns && boardColumns.length > 0 ? (
                                  boardColumns.map((col, index) => {
                                    console.log(`📋 RENDERING BUTTON ${index}:`, col);
                                    return (
                                  <button
                                    key={col.id}
                                    onClick={async () => {
                                      try {
                                        // Find current column title
                                        const currentColumn = boardColumns.find(c => c.title === task.columnTitle);
                                        const targetColumn = col;
                                        
                                        // Only animate if actually moving to a different column
                                        if (currentColumn && currentColumn.id !== targetColumn.id) {
                                          // Get current task position
                                          const currentTaskIndex = sortedTasks.findIndex(t => t.id === task.id);
                                          
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
                                          
                                          // Phase 3: Fade back to normal (1200ms) - extended for viewport scrolling
                                          setTimeout(() => {
                                            setAnimatingTask(null);
                                            setAnimationPhase(null);
                                          }, 2000);
                                        } else {
                                          // No animation needed, just move
                                          await onMoveTaskToColumn(task.id, col.id);
                                        }
                                        
                                        setShowDropdown(null);
                                      } catch (error) {
                                        console.error('Failed to move task to column:', error);
                                        setAnimatingTask(null);
                                        setAnimationPhase(null);
                                      }
                                    }}
                                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 block ${
                                      task.columnTitle === col.title ? 'bg-blue-50 text-blue-700' : ''
                                    }`}
                                  >
                                    {col.title}
                                    {task.columnTitle === col.title && (
                                      <span className="ml-auto text-blue-600">✓</span>
                                    )}
                                  </button>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-xs text-gray-500">No columns available</div>
                                )}
                              </div>
                            </div>
                          )}
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
                          {showDropdown?.taskId === task.id && showDropdown?.field === 'tags' && (
                            <div 
                              ref={dropdownRef}
                              className={`absolute ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-[180px]`}
                            >
                              <div className="py-1 max-h-48 overflow-y-auto">
                                <div className="px-3 py-2 text-xs font-medium text-gray-700 border-b border-gray-100">
                                  Click to toggle tags
                                </div>
                                {availableTags?.map(tag => {
                                  const isSelected = task.tags?.some(t => t.id === tag.id);
                                  return (
                                    <button
                                      key={tag.id}
                                      onClick={() => {
                                        // Toggle tag selection
                                        const currentTags = task.tags || [];
                                        let updatedTags;
                                        
                                        if (isSelected) {
                                          // Remove tag
                                          updatedTags = currentTags.filter(t => t.id !== tag.id);
                                        } else {
                                          // Add tag
                                          updatedTags = [...currentTags, tag];
                                        }
                                        
                                        // Update the task
                                        const updatedTask = {
                                          ...task,
                                          tags: updatedTags
                                        };
                                        
                                        handleDropdownSelect(task.id, 'tags', updatedTags);
                                      }}
                                      className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2 ${
                                        isSelected ? 'bg-blue-50' : ''
                                      }`}
                                    >
                                      <span 
                                        className="px-1.5 py-0.5 rounded text-xs font-medium"
                                        style={{ 
                                          backgroundColor: tag.color + '20',
                                          color: tag.color,
                                          border: `1px solid ${tag.color}40`
                                        }}
                                      >
                                        {tag.tag}
                                      </span>
                                      {isSelected && <span className="ml-auto text-blue-600">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {column.key === 'comments' && (
                        <span className="text-xs text-gray-600">
                          {task.comments?.length || 0}
                        </span>
                      )}
                      {column.key === 'createdAt' && (
                        <span className="text-xs text-gray-500 font-mono">
                          {formatDateTime(task.createdAt)}
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
    </div>
  );
}
