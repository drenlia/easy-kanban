import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { 
  CurrentUser, 
  TeamMember, 
  Board, 
  Task, 
  Columns, 
  PriorityOption,
  Tag,
  ColumnVisibilityWarning
} from '../../types';
import { TaskViewMode, ViewMode, loadUserPreferences, loadUserPreferencesAsync, updateAppSettingsPreference } from '../../utils/userPreferences';
import { hasConfiguredSearchFilters, clearTaskSoftDelete } from '../../utils/taskUtils';
import TeamMembers from '../TeamMembers';
import Tools from '../Tools';
import BoardMetrics from '../BoardMetrics';
import SearchInterface from '../SearchInterface';
import KanbanColumn from '../Column';
import TaskCard from '../TaskCard';
import BoardTabs from '../BoardTabs';
import BoardTrashView from '../BoardTrashView';
import LoadingSpinner from '../LoadingSpinner';
import ListView from '../ListView';
import ColumnResizeHandle from '../ColumnResizeHandle';
import {
  getBoardTrash,
  getBoardTrashCount,
  getTaskById,
  restoreTask,
  purgeTask,
} from '../../api';
import { toast } from '../../utils/toast';
import websocketClient from '../../services/websocketClient';

import { lazyWithRetry } from '../../utils/lazyWithRetry';

const TRASH_OPEN_STORAGE_KEY = 'easyKanban.trashOpenByBoard';

function readTrashOpenPreference(boardId: string | null): boolean {
  if (!boardId || typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(TRASH_OPEN_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return !!parsed?.[boardId];
  } catch {
    return false;
  }
}

function writeTrashOpenPreference(boardId: string | null, open: boolean) {
  if (!boardId || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(TRASH_OPEN_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, boolean>;
    if (open) {
      parsed[boardId] = true;
    } else {
      delete parsed[boardId];
    }
    if (Object.keys(parsed).length === 0) {
      sessionStorage.removeItem(TRASH_OPEN_STORAGE_KEY);
    } else {
      sessionStorage.setItem(TRASH_OPEN_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // ignore quota / private mode
  }
}

// Lazy load GanttViewV2 to reduce initial bundle size (only loads when Gantt view is selected) with retry logic
const GanttViewV2 = lazyWithRetry(() => import('../GanttViewV2'));


interface KanbanPageProps {
  currentUser: CurrentUser | null;
  selectedTask: Task | null;
  loading: {
    general: boolean;
    tasks: boolean;
    boards: boolean;
    columns: boolean;
  };
  members: TeamMember[];
  boards: Board[];
  selectedBoard: string | null;
  columns: Columns;
  selectedMembers: string[];
  draggedTask: Task | null;
  draggedColumn: any;
  dragPreview: any;
  availablePriorities: PriorityOption[];
  availableTags: Tag[];
  availableSprints?: any[]; // Optional for backward compatibility
  taskViewMode: TaskViewMode;
  viewMode: ViewMode;
  isSearchActive: boolean;
  searchFilters: any;
  filteredColumns: Columns;
  activeFilters: boolean;
  gridStyle: React.CSSProperties;
  sensors: any;
  collisionDetection: any;
  siteSettings: { [key: string]: string };
  
  // Column filtering props
  boardColumnVisibility: {[boardId: string]: string[]};
  onBoardColumnVisibilityChange: (boardId: string, visibleColumns: string[]) => void;

  
  // Event handlers
  onSelectMember: (memberId: string) => void;
  onClearMemberSelections: () => void;
  onSelectAllMembers: () => void;
  isAllModeActive: boolean;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  includeSystem: boolean;
  onToggleAssignees: (include: boolean) => void;
  onToggleWatchers: (include: boolean) => void;
  onToggleCollaborators: (include: boolean) => void;
  onToggleRequesters: (include: boolean) => void;
  onToggleSystem: (include: boolean) => void;
  showAgentTasks?: boolean;
  onToggleShowAgentTasks?: (show: boolean) => void;
  onTaskViewModeChange: (mode: TaskViewMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSearch: () => void;
  onSearchFiltersChange: (filters: any) => void;
  currentFilterView?: any; // SavedFilterView | null
  sharedFilterViews?: any[]; // SavedFilterView[]
  onFilterViewChange?: (view: any) => void; // (view: SavedFilterView | null) => void
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => Promise<void>;
  onEditBoard: (boardId: string, title: string) => Promise<void>;
  onRemoveBoard: (boardId: string) => Promise<void>;
  onReorderBoards: (boardId: string, newPosition: number) => Promise<void>;
  getTaskCountForBoard: (board: Board) => number;
  onDragStart: (event: any) => void;
  onDragOver: (event: any) => void;
  onDragEnd: (event: any) => void;
  onAddTask: (columnId: string) => Promise<void>;
  columnWarnings: Record<string, ColumnVisibilityWarning>;
  onDismissColumnWarning: (columnId: string) => void;
  onClearFiltersForHiddenTask?: () => void;
  onAssignCreatedTaskToSprint?: (columnId: string, taskId: string, sprintId: string) => Promise<void>;
  onRemoveTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => Promise<void>;
  onCopyTask: (task: Task) => Promise<void>;
  onTagAdd: (taskId: string) => (tagId: string) => Promise<void>;
  onTagRemove: (taskId: string) => (tagId: string) => Promise<void>;
  onMoveTaskToColumn: (taskId: string, targetColumnId: string) => Promise<void>;
  animateCopiedTaskId?: string | null;
  onEditColumn: (
    columnId: string,
    title: string,
    is_finished?: boolean,
    is_archived?: boolean,
    wip_limit?: number | null,
    policy_text?: string | null
  ) => Promise<void>;
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: (afterColumnId: string) => Promise<void>;
  showColumnDeleteConfirm?: string | null;
  onConfirmColumnDelete?: (columnId: string) => Promise<void>;
  onCancelColumnDelete?: () => void;
  getColumnTaskCount?: (columnId: string) => number;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onClearDragState: () => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onRefreshBoardData: () => Promise<void>;
  onSetDragCooldown: (active: boolean, duration?: number) => void;
  onTaskDrop: () => Promise<void>;
  onSelectTask: (task: Task | null, options?: { scrollToComments?: boolean }) => void;
  onTaskDropOnBoard?: (taskId: string, targetBoardId: string) => Promise<void>;
  
  // Task linking props
  isLinkingMode?: boolean;
  linkingSourceTask?: Task | null;
  linkingLine?: {startX: number, startY: number, endX: number, endY: number} | null;
  onStartLinking?: (task: Task, startPosition: {x: number, y: number}) => void;
  onUpdateLinkingLine?: (endPosition: {x: number, y: number}) => void;
  onFinishLinking?: (targetTask: Task | null, relationshipType?: 'parent' | 'child' | 'related') => Promise<void>;
  onCancelLinking?: () => void;
  
  // Hover highlighting props
  hoveredLinkTask?: Task | null;
  onLinkToolHover?: (task: Task) => void;
  onLinkToolHoverEnd?: () => void;
  getTaskRelationshipType?: (taskId: string) => 'parent' | 'child' | 'related' | null;
  
  // Auto-synced relationships
  boardRelationships?: any[];
  
  // Network status
  isOnline?: boolean;
  
  // Sprint filtering
  selectedSprintId?: string | null;
  
  // Column resizing
  kanbanColumnWidth?: number;
  onColumnWidthResize?: (deltaX: number) => void;

  /** Called after a successful restore with the restored task payload for optimistic insert. */
  onTaskRestoredLocally?: (task: Task) => void;
}

const KanbanPage: React.FC<KanbanPageProps> = ({
  currentUser,
  selectedTask,
  loading,
  members,
  boards,
  selectedBoard,
  columns,
  selectedMembers,
  draggedTask,
  draggedColumn,
  dragPreview,
  availablePriorities,
  availableTags,
  taskViewMode,
  isSearchActive,
  searchFilters,
  filteredColumns,
  activeFilters,
  gridStyle,
  sensors,
  collisionDetection,
  onSelectMember,
  onClearMemberSelections,
  onSelectAllMembers,
  isAllModeActive,
  kanbanColumnWidth,
  onColumnWidthResize,
  includeAssignees,
  includeWatchers,
  includeCollaborators,
  includeRequesters,
  includeSystem,
  onToggleAssignees,
  onToggleWatchers,
  onToggleCollaborators,
  onToggleRequesters,
  onToggleSystem,
  showAgentTasks = true,
  onToggleShowAgentTasks,
  onTaskViewModeChange,
  viewMode,
  onViewModeChange,
  onToggleSearch,
  onSearchFiltersChange,
  currentFilterView,
  sharedFilterViews,
  onFilterViewChange,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard,
  onReorderBoards,
  getTaskCountForBoard,
  onDragStart,
  onDragOver,
  onDragEnd,
  onAddTask,
  columnWarnings,
  onDismissColumnWarning,
  onClearFiltersForHiddenTask,
  onAssignCreatedTaskToSprint,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onTagAdd,
  onTagRemove,
  onMoveTaskToColumn,
  animateCopiedTaskId,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  showColumnDeleteConfirm,
  onConfirmColumnDelete,
  onCancelColumnDelete,
  getColumnTaskCount,
  onTaskDragStart,
  onTaskDragEnd,
  onClearDragState,
  onTaskDragOver,
  onRefreshBoardData,
  onSetDragCooldown,
  onTaskDrop,
  onSelectTask,
  onTaskDropOnBoard,
  siteSettings,
  boardColumnVisibility,
  onBoardColumnVisibilityChange,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  linkingLine,
  onStartLinking,
  onUpdateLinkingLine,
  onFinishLinking,
  onCancelLinking,
  
  // Hover highlighting props
  hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd,
  getTaskRelationshipType,
  
  // Auto-synced relationships
  boardRelationships = [],
  
  // Network status
  isOnline = true, // Default to true if not provided
  
  // Sprint filtering
  selectedSprintId = null,
  availableSprints = [],
  onTaskRestoredLocally,
}: KanbanPageProps) => {
  const { t } = useTranslation(['tasks', 'common']);
  const [showBoardToolbar, setShowBoardToolbar] = useState(() => {
    const prefs = loadUserPreferences(currentUser?.id ?? null);
    return prefs.appSettings.showBoardToolbar !== false;
  });
  const [trashOpen, setTrashOpen] = useState(() =>
    readTrashOpenPreference(selectedBoard)
  );
  const [trashCount, setTrashCount] = useState(0);
  const [trashTasks, setTrashTasks] = useState<Task[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const isAdmin = !!currentUser?.roles?.includes('admin');

  const setTrashOpenPersisted = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setTrashOpen((prev) => {
        const next = typeof open === 'function' ? open(prev) : open;
        writeTrashOpenPreference(selectedBoard, next);
        return next;
      });
    },
    [selectedBoard]
  );

  const refreshTrashCount = useCallback(async (boardId: string | null) => {
    if (!boardId) {
      setTrashCount(0);
      return;
    }
    try {
      const count = await getBoardTrashCount(boardId);
      setTrashCount(count);
      if (count === 0) {
        setTrashOpen(false);
        writeTrashOpenPreference(boardId, false);
        setTrashTasks([]);
      }
    } catch {
      // ignore — trash badge is best-effort
    }
  }, []);

  const loadTrashTasks = useCallback(async (boardId: string | null) => {
    if (!boardId) {
      setTrashTasks([]);
      return;
    }
    setTrashLoading(true);
    try {
      const tasks = await getBoardTrash(boardId);
      setTrashTasks(tasks);
      setTrashCount(tasks.length);
      if (tasks.length === 0) {
        setTrashOpen(false);
        writeTrashOpenPreference(boardId, false);
      }
    } catch (error) {
      console.error('Failed to load trash:', error);
      toast.error(t('trash.loadFailed'));
    } finally {
      setTrashLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setTrashTasks([]);
    const shouldOpen = readTrashOpenPreference(selectedBoard);
    setTrashOpen(shouldOpen);
    void refreshTrashCount(selectedBoard);
  }, [selectedBoard, refreshTrashCount]);

  useEffect(() => {
    if (trashOpen && selectedBoard) {
      void loadTrashTasks(selectedBoard);
    }
  }, [trashOpen, selectedBoard, loadTrashTasks]);

  // Keep trash count/list in sync with soft-delete / restore / purge events
  useEffect(() => {
    const onDeleted = (data: any) => {
      if (!data?.boardId || data.boardId !== selectedBoard) return;
      if (trashOpen) {
        void loadTrashTasks(selectedBoard);
      } else {
        void refreshTrashCount(selectedBoard);
      }
    };
    const onRestoredOrPurged = (data: any) => {
      if (!data?.boardId || data.boardId !== selectedBoard) return;
      if (trashOpen) {
        void loadTrashTasks(selectedBoard);
      } else {
        void refreshTrashCount(selectedBoard);
      }
    };
    websocketClient.onTaskDeleted(onDeleted);
    websocketClient.onTaskRestored(onRestoredOrPurged);
    websocketClient.onTaskPurged(onRestoredOrPurged);
    return () => {
      websocketClient.offTaskDeleted(onDeleted);
      websocketClient.offTaskRestored(onRestoredOrPurged);
      websocketClient.offTaskPurged(onRestoredOrPurged);
    };
  }, [selectedBoard, trashOpen, loadTrashTasks, refreshTrashCount]);

  const handleToggleTrash = useCallback(() => {
    setTrashOpenPersisted((prev) => {
      const next = !prev;
      if (next && viewMode !== 'kanban') {
        onViewModeChange('kanban');
      }
      return next;
    });
  }, [viewMode, onViewModeChange, setTrashOpenPersisted]);

  const handleSelectBoardWithTrashExit = useCallback(
    (boardId: string) => {
      // Each board restores its own trash-open preference in the selectedBoard effect
      onSelectBoard(boardId);
    },
    [onSelectBoard]
  );

  const handleRestoreTrashTask = useCallback(
    async (taskId: string) => {
      try {
        const restored = await restoreTask(taskId);
        const normalized = clearTaskSoftDelete({
          ...restored,
          columnId: restored.columnId || (restored as any).columnid,
          boardId: restored.boardId || (restored as any).boardid,
          memberId: restored.memberId || (restored as any).memberid,
          requesterId: restored.requesterId || (restored as any).requesterid,
        } as Task);
        onTaskRestoredLocally?.(normalized);
        if (selectedTask?.id === taskId) {
          onSelectTask(normalized);
        }
        toast.success(t('trash.restored'));
        setTrashTasks((prev) => {
          const next = prev.filter((task) => task.id !== taskId);
          if (next.length === 0) {
            setTrashOpen(false);
            writeTrashOpenPreference(selectedBoard, false);
            setTrashCount(0);
          } else {
            setTrashCount(next.length);
          }
          return next;
        });
      } catch (error: any) {
        const code = error?.response?.data?.code;
        if (code === 'board_soft_deleted') {
          toast.error(t('trash.restoreBoardFirst'));
        } else {
          toast.error(error?.response?.data?.error || t('trash.restoreFailed'));
        }
        throw error;
      }
    },
    [onTaskRestoredLocally, onSelectTask, selectedTask?.id, t, selectedBoard]
  );

  const handlePurgeTrashTask = useCallback(
    async (taskId: string) => {
      try {
        await purgeTask(taskId);
        toast.success(t('trash.purged'));
        setTrashTasks((prev) => {
          const next = prev.filter((task) => task.id !== taskId);
          if (next.length === 0) {
            setTrashOpen(false);
            writeTrashOpenPreference(selectedBoard, false);
            setTrashCount(0);
          } else {
            setTrashCount(next.length);
          }
          return next;
        });
        if (selectedTask?.id === taskId) {
          onSelectTask(null);
        }
      } catch (error: any) {
        toast.error(error?.response?.data?.error || t('trash.purgeFailed'));
        throw error;
      }
    },
    [selectedTask?.id, onSelectTask, t, selectedBoard]
  );

  const handleSelectTrashedTask = useCallback(
    async (task: Task) => {
      try {
        const full = await getTaskById(task.id);
        const normalized: Task = {
          ...full,
          deletedAt: full.deletedAt || (full as any).deleted_at || task.deletedAt || null,
          deletedBy: full.deletedBy || (full as any).deleted_by || task.deletedBy || null,
          columnId: full.columnId || (full as any).columnid,
          boardId: full.boardId || (full as any).boardid,
          memberId: full.memberId || (full as any).memberid,
          requesterId: full.requesterId || (full as any).requesterid,
        };
        onSelectTask(normalized);
      } catch {
        onSelectTask({
          ...task,
          deletedAt: task.deletedAt || null,
        });
      }
    },
    [onSelectTask]
  );
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentUser?.id) return;
      try {
        const prefs = await loadUserPreferencesAsync(currentUser.id);
        if (!cancelled) {
          setShowBoardToolbar(prefs.appSettings.showBoardToolbar !== false);
        }
      } catch {
        // Keep cookie / default
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const handleToggleBoardToolbar = async () => {
    const next = !showBoardToolbar;
    setShowBoardToolbar(next);
    try {
      await updateAppSettingsPreference('showBoardToolbar', next, currentUser?.id ?? null);
    } catch (error) {
      console.error('Failed to save board toolbar preference:', error);
    }
  };

  // Column filtering logic - memoized to prevent unnecessary re-renders
  const visibleColumnsForCurrentBoard = useMemo(() => {
    if (!selectedBoard) return [];
    // If there's saved visibility preference, use it
    if (boardColumnVisibility[selectedBoard]) {
      return boardColumnVisibility[selectedBoard];
    }
    // Otherwise, default to all columns EXCEPT archived ones
    return Object.keys(columns).filter(columnId => {
      const column = columns[columnId];
      // Hide archived columns by default (is_archived can be boolean true or number 1)
      return !(column.is_archived === true || column.is_archived === 1);
    });
  }, [selectedBoard, columns, boardColumnVisibility]);

  const activeFilterTooltip = useMemo(() => {
    const hasSearchCriteria = hasConfiguredSearchFilters(searchFilters);

    const hasRoleFilters =
      !includeAssignees ||
      includeWatchers ||
      includeCollaborators ||
      includeRequesters;

    let hasHiddenColumns = false;
    const allColumns = Object.values(columns);
    if (allColumns.length > 0 && visibleColumnsForCurrentBoard.length > 0) {
      const isArchived = (col: { is_archived?: boolean | number }) =>
        col.is_archived === true || col.is_archived === 1;
      const nonArchived = allColumns.filter((col) => !isArchived(col));
      const visibleNonArchived = visibleColumnsForCurrentBoard.filter((colId) => {
        const col = columns[colId];
        return col && !isArchived(col);
      });
      hasHiddenColumns =
        visibleNonArchived.length > 0 &&
        visibleNonArchived.length < nonArchived.length;
    }

    const agentHidden =
      siteSettings?.AI_ENABLED === 'true' && !showAgentTasks;

    const badgeActive =
      hasSearchCriteria ||
      selectedMembers.length > 0 ||
      hasRoleFilters ||
      hasHiddenColumns ||
      agentHidden;

    if (!badgeActive) return '';

    const reasons: string[] = [];
    if (hasSearchCriteria) {
      reasons.push(t('tools.filterReasonSearch', { ns: 'common' }));
    }
    if (selectedMembers.length > 0) {
      reasons.push(t('tools.filterReasonMembers', { ns: 'common' }));
    }
    if (hasRoleFilters) {
      reasons.push(t('tools.filterReasonRoles', { ns: 'common' }));
    }
    if (hasHiddenColumns) {
      reasons.push(t('tools.filterReasonColumns', { ns: 'common' }));
    }
    if (agentHidden) {
      reasons.push(t('tools.filterReasonAgentHidden', { ns: 'common' }));
    }

    if (reasons.length === 0) {
      return t('tools.filtersActiveHeading', { ns: 'common' });
    }
    return `${t('tools.filtersActiveHeading', { ns: 'common' })}\n• ${reasons.join('\n• ')}`;
  }, [
    searchFilters,
    selectedMembers,
    includeAssignees,
    includeWatchers,
    includeCollaborators,
    includeRequesters,
    columns,
    visibleColumnsForCurrentBoard,
    siteSettings?.AI_ENABLED,
    showAgentTasks,
    t,
  ]);

  const showSearchFilterBadge = !!activeFilterTooltip;

  const getVisibleColumns = (boardId: string | null) => {
    if (boardId === selectedBoard) {
      return visibleColumnsForCurrentBoard;
    }
    // For other boards (shouldn't happen in normal flow)
    if (!boardId) return [];
    if (boardColumnVisibility[boardId]) {
      return boardColumnVisibility[boardId];
    }
    return Object.keys(columns).filter(columnId => {
      const column = columns[columnId];
      return !(column.is_archived === true || column.is_archived === 1);
    });
  };

  const handleColumnVisibilityChange = (boardId: string, visibleColumns: string[]) => {
    onBoardColumnVisibilityChange(boardId, visibleColumns);
  };

  // Get filtered columns based on visibility (respecting user's column filter choices)
  const getFilteredColumnsForDisplay = useMemo(() => {
    const filtered: Columns = {};
    
    visibleColumnsForCurrentBoard.forEach(columnId => {
      if (columns[columnId]) {
        filtered[columnId] = columns[columnId];
      }
    });
    
    return filtered;
  }, [visibleColumnsForCurrentBoard, columns]);

  // Get fully filtered columns (search filters + column visibility)
  const getFullyFilteredColumns = useMemo(() => {
    const visibleColumnIds = getVisibleColumns(selectedBoard);
    const fullyFiltered: Columns = {};
    
    
    visibleColumnIds.forEach(columnId => {
      if (filteredColumns[columnId]) {
        fullyFiltered[columnId] = filteredColumns[columnId];
      }
    });
    
    
    return fullyFiltered;
  }, [filteredColumns, selectedBoard, boardColumnVisibility]);

  // Count tasks assigned to system user across ALL boards
  const getSystemTaskCount = useMemo(() => {
    const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';
    let count = 0;
    
    // Count system tasks across all boards (not just the selected one)
    boards.forEach(board => {
      if (board.columns) {
        Object.values(board.columns).forEach((column: any) => {
          if (column.tasks) {
            count += column.tasks.filter((task: any) => task.memberId === SYSTEM_MEMBER_ID).length;
          }
        });
      }
    });
    
    return count;
  }, [boards]);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // ListView scroll controls
  const [listViewScrollControls, setListViewScrollControls] = useState<{
    canScrollLeft: boolean;
    canScrollRight: boolean;
    scrollLeft: () => void;
    scrollRight: () => void;
  } | null>(null);
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);

  // Check scroll state for columns
  const checkColumnsScrollState = () => {
    if (!columnsContainerRef.current) return;
    
    const container = columnsContainerRef.current;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
  };

  // Column scroll functions
  const scrollColumnsLeft = () => {
    if (!columnsContainerRef.current) return;
    const container = columnsContainerRef.current;
    
    // Calculate actual column width including gap (300px min + 1.5rem gap)
    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    
    container.scrollBy({ left: -columnFullWidth, behavior: 'smooth' });
  };

  const scrollColumnsRight = () => {
    if (!columnsContainerRef.current) return;
    const container = columnsContainerRef.current;
    
    // Calculate actual column width including gap (300px min + 1.5rem gap)
    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    
    container.scrollBy({ left: columnFullWidth, behavior: 'smooth' });
  };

  // Continuous scroll functions
  const startContinuousScroll = (direction: 'left' | 'right') => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    const container = columnsContainerRef.current;
    if (!container) return;

    const gap = 24; // 1.5rem = 24px
    const columnMinWidth = 300;
    const columnFullWidth = columnMinWidth + gap;
    const scrollAmount = direction === 'left' ? -columnFullWidth : columnFullWidth;

    // Initial scroll
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });

    // Continuous scroll with interval
    scrollIntervalRef.current = setInterval(() => {
      if (!columnsContainerRef.current) {
        stopContinuousScroll();
        return;
      }

      const currentContainer = columnsContainerRef.current;
      const canContinue = direction === 'left' 
        ? currentContainer.scrollLeft > 0
        : currentContainer.scrollLeft < currentContainer.scrollWidth - currentContainer.clientWidth;

      if (!canContinue) {
        stopContinuousScroll();
        return;
      }

      currentContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }, 300); // Scroll every 300ms for smooth continuous movement
  };

  const stopContinuousScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    isScrollingRef.current = false;
  };

  // Update scroll state when columns change
  useEffect(() => {
    // Check scroll state after a short delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      checkColumnsScrollState();
    }, 100);
    
    const container = columnsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkColumnsScrollState);
      const resizeObserver = new ResizeObserver(() => {
        // Also delay the resize check
        setTimeout(checkColumnsScrollState, 50);
      });
      resizeObserver.observe(container);
      
      return () => {
        clearTimeout(timeoutId);
        container.removeEventListener('scroll', checkColumnsScrollState);
        resizeObserver.disconnect();
      };
    }
    
    return () => clearTimeout(timeoutId);
  }, [columns, viewMode]);

  // Ensure scroll state is checked when switching to Kanban view
  useEffect(() => {
    if (viewMode === 'kanban') {
      // Small delay to ensure the Kanban columns are rendered
      const timeoutId = setTimeout(() => {
        checkColumnsScrollState();
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [viewMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is editing text - includes input, textarea, and contenteditable elements
      const target = event.target as HTMLElement;
      const isTextEditing = target instanceof HTMLInputElement || 
                           target instanceof HTMLTextAreaElement ||
                           target.isContentEditable ||
                           target.closest('[contenteditable="true"]') ||
                           target.closest('.ProseMirror') ||
                           target.closest('.tiptap');
      
      if (isTextEditing) {
        return; // Don't interfere with text editing
      }
      
      // Don't handle arrow keys in Gantt view - let GanttViewV2 handle them
      if (viewMode === 'gantt') {
        return;
      }
      
      // Only handle arrow keys without modifiers for board navigation
      // Let cmd/ctrl + arrow keys work normally for text editing
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && 
          (event.metaKey || event.ctrlKey)) {
        return; // Let text editing handle cmd/ctrl + arrow keys
      }
      
      if (event.key === 'ArrowLeft' && canScrollLeft) {
        event.preventDefault();
        scrollColumnsLeft();
      } else if (event.key === 'ArrowRight' && canScrollRight) {
        event.preventDefault();
        scrollColumnsRight();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canScrollLeft, canScrollRight, viewMode]);

  // Cleanup scroll intervals on unmount and handle global mouse events
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      stopContinuousScroll();
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      stopContinuousScroll();
    };
  }, []);

  if (loading.general) {
    return <LoadingSpinner size="large" className="mt-20" />;
  }

  return (
    <>
      {showBoardToolbar ? (
        <div className="flex gap-4 mb-4 items-start">
          <Tools 
            taskViewMode={taskViewMode}
            onTaskViewModeChange={onTaskViewModeChange}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            isSearchActive={isSearchActive}
            onToggleSearch={onToggleSearch}
            hasActiveFilters={showSearchFilterBadge}
            activeFilterTooltip={activeFilterTooltip}
            onHideToolbar={() => void handleToggleBoardToolbar()}
          />
          <div className="flex-1 min-w-0">
            <TeamMembers
              members={members}
              selectedMembers={selectedMembers}
              onSelectMember={onSelectMember}
              onClearSelections={onClearMemberSelections}
              onSelectAll={onSelectAllMembers}
              isAllModeActive={isAllModeActive}
              includeAssignees={includeAssignees}
              includeWatchers={includeWatchers}
              includeCollaborators={includeCollaborators}
              includeRequesters={includeRequesters}
              includeSystem={includeSystem}
              onToggleAssignees={onToggleAssignees}
              onToggleWatchers={onToggleWatchers}
              onToggleCollaborators={onToggleCollaborators}
              onToggleRequesters={onToggleRequesters}
              onToggleSystem={onToggleSystem}
              showAgentTasks={showAgentTasks}
              currentUserId={currentUser?.id}
              currentUser={currentUser}
              systemTaskCount={getSystemTaskCount}
            />
          </div>
          <BoardMetrics
            columns={columns}
            filteredColumns={getFullyFilteredColumns}
            siteSettings={siteSettings}
          />
        </div>
      ) : (
        <div className="flex items-center mb-4">
          <button
            type="button"
            onClick={() => void handleToggleBoardToolbar()}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border border-dashed border-gray-300 dark:border-gray-600 transition-colors"
            title={t('tools.showBoardToolbar', { ns: 'common' })}
            aria-label={t('tools.showBoardToolbar', { ns: 'common' })}
            aria-expanded={false}
          >
            <ChevronDown size={14} />
            {t('tools.showBoardToolbar', { ns: 'common' })}
          </button>
        </div>
      )}

      {/* Search Interface */}
      {isSearchActive && (
        <SearchInterface
          filters={searchFilters}
          availablePriorities={availablePriorities}
          onFiltersChange={onSearchFiltersChange}
          siteSettings={siteSettings}
          currentFilterView={currentFilterView}
          sharedFilterViews={sharedFilterViews}
          onFilterViewChange={onFilterViewChange}
          columns={columns}
          visibleColumns={visibleColumnsForCurrentBoard}
          onColumnsChange={(visibleColumns) => selectedBoard && handleColumnVisibilityChange(selectedBoard, visibleColumns)}
          selectedBoard={selectedBoard}
          showAgentTasks={showAgentTasks}
          onToggleShowAgentTasks={onToggleShowAgentTasks}
        />
      )}

      {/* Board Tabs */}
      <BoardTabs
        boards={boards}
        selectedBoard={selectedBoard}
        onSelectBoard={handleSelectBoardWithTrashExit}
        onAddBoard={onAddBoard}
        onEditBoard={onEditBoard}
        onRemoveBoard={onRemoveBoard}
        onReorderBoards={onReorderBoards}
        isAdmin={isAdmin}
        getFilteredTaskCount={getTaskCountForBoard}
        hasActiveFilters={activeFilters}
        draggedTask={draggedTask}
        onTaskDropOnBoard={onTaskDropOnBoard}
        siteSettings={siteSettings}
        trashCount={trashCount}
        trashOpen={trashOpen}
        onToggleTrash={handleToggleTrash}
      />

      {selectedBoard && trashOpen && (
        <BoardTrashView
          tasks={trashTasks}
          displayColumns={Object.values(getFilteredColumnsForDisplay)
            .filter((column) => column && column.id)
            .sort((a, b) => (a.position || 0) - (b.position || 0))}
          columns={columns}
          members={members}
          isAdmin={isAdmin}
          gridStyle={gridStyle}
          loading={trashLoading}
          onSelectTask={(task) => void handleSelectTrashedTask(task)}
          onRestore={handleRestoreTrashTask}
          onPurge={handlePurgeTrashTask}
        />
      )}

      {selectedBoard && (
        <div className="relative">
          {(loading.tasks || loading.boards || loading.columns) && (
            <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-10 flex items-center justify-center">
              <LoadingSpinner size="medium" />
            </div>
          )}
          
          {/* Conditional View Rendering */}
          {viewMode === 'list' ? (
            <div className="relative">
              {/* ListView Navigation Chevrons */}
              {listViewScrollControls?.canScrollLeft && (
                <button
                  onClick={listViewScrollControls.scrollLeft}
                  className="absolute -left-12 top-4 z-20 p-2 bg-white/60 dark:bg-gray-800/70 hover:bg-white/95 dark:hover:bg-gray-800/95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                  title={t('boardTabs.scrollListLeft', { ns: 'common' })}
                >
                  <ChevronLeft size={18} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100" />
                </button>
              )}
              
              {listViewScrollControls?.canScrollRight && (
                <button
                  onClick={listViewScrollControls.scrollRight}
                  className="absolute -right-12 top-4 z-20 p-2 bg-white/60 dark:bg-gray-800/70 hover:bg-white/95 dark:hover:bg-gray-800/95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                  title={t('boardTabs.scrollListRight', { ns: 'common' })}
                >
                  <ChevronRight size={18} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100" />
                </button>
              )}
              
              <ListView
                filteredColumns={getFullyFilteredColumns}
                selectedBoard={selectedBoard}
                members={members}
                availablePriorities={availablePriorities}
                availableTags={availableTags}
                availableSprints={availableSprints}
                taskViewMode={taskViewMode}
                onSelectTask={onSelectTask}
                selectedTask={selectedTask}
                onRemoveTask={onRemoveTask}
                onEditTask={onEditTask}
                onCopyTask={onCopyTask}
                onMoveTaskToColumn={onMoveTaskToColumn}
                animateCopiedTaskId={animateCopiedTaskId}
                onScrollControlsChange={setListViewScrollControls}
                boards={boards}
                siteSettings={siteSettings}
                currentUser={currentUser}
                boardRelationships={boardRelationships}
                selectedSprintId={selectedSprintId}
              />
            </div>
          ) : viewMode === 'gantt' ? (
            <Suspense fallback={<div className="flex items-center justify-center h-64"><LoadingSpinner /></div>}>
              <GanttViewV2
                columns={getFullyFilteredColumns}
                onSelectTask={onSelectTask}
                selectedTask={selectedTask}
                taskViewMode={taskViewMode}
                onUpdateTask={onEditTask}
                onTaskDragStart={onTaskDragStart}
                onTaskDragEnd={onTaskDragEnd}
                onClearDragState={onClearDragState}
                boardId={selectedBoard}
                onAddTask={onAddTask}
                currentUser={currentUser}
                members={members}
                onRefreshData={onRefreshBoardData}
                relationships={boardRelationships}
                onCopyTask={onCopyTask}
                onRemoveTask={onRemoveTask}
                siteSettings={siteSettings}
              />
            </Suspense>
          ) : (
            <>
              {Object.values(getFilteredColumnsForDisplay).length > 0 &&
                Object.values(getFilteredColumnsForDisplay).every(
                  (col) => !(col.tasks && col.tasks.length > 0)
                ) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">
                  {t('column.emptyBoardHint')}
                </p>
              )}
              {/* Columns Navigation Container */}
          <div className="relative kanban-columns-container">
            {/* Left scroll button - positioned outside board */}
            {canScrollLeft && (
              <button
                onClick={scrollColumnsLeft}
                onMouseDown={() => startContinuousScroll('left')}
                onMouseUp={stopContinuousScroll}
                onMouseLeave={stopContinuousScroll}
                className="absolute -left-12 top-4 z-20 p-2 bg-white/60 dark:bg-gray-800/70 hover:bg-white/95 dark:hover:bg-gray-800/95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                title={t('boardTabs.scrollColumnsLeft', { ns: 'common' })}
              >
                <ChevronLeft size={18} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100" />
              </button>
            )}
            
            {/* Right scroll button - positioned outside board */}
            {canScrollRight && (
              <button
                onClick={scrollColumnsRight}
                onMouseDown={() => startContinuousScroll('right')}
                onMouseUp={stopContinuousScroll}
                onMouseLeave={stopContinuousScroll}
                className="absolute -right-12 top-4 z-20 p-2 bg-white/60 dark:bg-gray-800/70 hover:bg-white/95 dark:hover:bg-gray-800/95 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 opacity-70 hover:opacity-100 hover:scale-110"
                title={t('boardTabs.scrollColumnsRight', { ns: 'common' })}
              >
                <ChevronRight size={18} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100" />
              </button>
            )}
            
            {/* Scrollable columns container */}
            <div
              ref={columnsContainerRef}
              className="overflow-x-auto w-full kanban-scrollable-container"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--scrollbar-thumb) var(--scrollbar-track)'
                // Background handled by CSS class to prevent flash
              }}
              data-tour-id="kanban-columns"
            >
                             {/* DndContext handled at App level for global cross-board functionality */}
            {/* Admin view with column drag and drop */}
            {currentUser?.roles?.includes('admin') ? (
              // Re-enabled SortableContext for column reordering
              <SortableContext
                items={Object.values(getFilteredColumnsForDisplay)
                  .filter(column => column && column.id) // Filter out null/undefined columns
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(column => column.id)
                }
                strategy={rectSortingStrategy}
              >
                <BoardDropArea selectedBoard={selectedBoard} style={gridStyle}>
                  {Object.values(getFilteredColumnsForDisplay)
                    .filter(column => column && column.id) // Filter out null/undefined columns
                    .sort((a, b) => (a.position || 0) - (b.position || 0))
                    .map((column, index, array) => (
                      <React.Fragment key={column.id}>
                        <div className="relative">
                          <KanbanColumn
                            column={column}
                            filteredTasks={filteredColumns[column.id]?.tasks || []}
                            members={members}
                            currentUser={currentUser}
                            selectedMembers={selectedMembers}
                            selectedTask={selectedTask}
                            draggedTask={draggedTask}
                            draggedColumn={draggedColumn}
                            dragPreview={dragPreview}
                            onAddTask={onAddTask}
                            columnWarnings={columnWarnings}
                            onDismissColumnWarning={onDismissColumnWarning}
                            onClearFiltersForHiddenTask={onClearFiltersForHiddenTask}
                            onAssignCreatedTaskToSprint={onAssignCreatedTaskToSprint}
                            onRemoveTask={onRemoveTask}
                            onEditTask={onEditTask}
                            onCopyTask={onCopyTask}
                            onEditColumn={onEditColumn}
                            siteSettings={siteSettings}
                            onRemoveColumn={onRemoveColumn}
                            onAddColumn={onAddColumn}
                            showColumnDeleteConfirm={showColumnDeleteConfirm}
                            onConfirmColumnDelete={onConfirmColumnDelete}
                            onCancelColumnDelete={onCancelColumnDelete}
                            getColumnTaskCount={getColumnTaskCount}
                            onTaskDragStart={onTaskDragStart}
                            onTaskDragEnd={() => {}}
                            onTaskDragOver={onTaskDragOver}
                            onTaskDrop={onTaskDrop}
                            onSelectTask={onSelectTask}
                            isAdmin={true}
                            taskViewMode={taskViewMode}
                            availablePriorities={availablePriorities}
                            availableTags={availableTags}
                            onTagAdd={onTagAdd}
                            onTagRemove={onTagRemove}
                            boards={boards}
                            columns={columns}
                            
                            // Task linking props
                            isLinkingMode={isLinkingMode}
                            linkingSourceTask={linkingSourceTask}
                            onStartLinking={onStartLinking}
                            onFinishLinking={onFinishLinking}
                            
                            // Hover highlighting props
                            hoveredLinkTask={hoveredLinkTask}
                            onLinkToolHover={onLinkToolHover}
                            onLinkToolHoverEnd={onLinkToolHoverEnd}
                            getTaskRelationshipType={getTaskRelationshipType}
                            
                            // Network status
                            isOnline={isOnline}
                            
                            // Sprint filtering
                            selectedSprintId={selectedSprintId}
                            availableSprints={availableSprints}
                            hasActiveFilters={activeFilters}
                          />
                          {/* Resize handle between columns (not after the last one) */}
                          {index < array.length - 1 && onColumnWidthResize && (
                            <ColumnResizeHandle onResize={onColumnWidthResize} isColumnBeingDragged={!!draggedColumn} />
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                </BoardDropArea>
              </SortableContext>
            ) : (
              /* Regular user view */
              <BoardDropArea selectedBoard={selectedBoard} style={gridStyle}>
                {Object.values(getFilteredColumnsForDisplay)
                  .filter(column => column && column.id) // Filter out null/undefined columns
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map((column, index, array) => (
                    <React.Fragment key={column.id}>
                      <div className="relative">
                        <KanbanColumn
                          column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      currentUser={currentUser}
                      selectedMembers={selectedMembers}
                      selectedTask={selectedTask}
                      draggedTask={draggedTask}
                      draggedColumn={draggedColumn}
                      dragPreview={dragPreview}
                      onAddTask={onAddTask}
                      columnWarnings={columnWarnings}
                      onDismissColumnWarning={onDismissColumnWarning}
                      onClearFiltersForHiddenTask={onClearFiltersForHiddenTask}
                      onAssignCreatedTaskToSprint={onAssignCreatedTaskToSprint}
                      onRemoveTask={onRemoveTask}
                      onEditTask={onEditTask}
                      onCopyTask={onCopyTask}
                      onEditColumn={onEditColumn}
                      siteSettings={siteSettings}
                      onRemoveColumn={onRemoveColumn}
                      onAddColumn={onAddColumn}
                      showColumnDeleteConfirm={showColumnDeleteConfirm}
                      onConfirmColumnDelete={onConfirmColumnDelete}
                      onCancelColumnDelete={onCancelColumnDelete}
                      getColumnTaskCount={getColumnTaskCount}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={false}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                      availableTags={availableTags}
                      onTagAdd={onTagAdd}
                      onTagRemove={onTagRemove}
                      boards={boards}
                      columns={columns}
                      
                      // Task linking props
                      isLinkingMode={isLinkingMode}
                      linkingSourceTask={linkingSourceTask}
                      onStartLinking={onStartLinking}
                      onFinishLinking={onFinishLinking}
                      
                      // Hover highlighting props
                      hoveredLinkTask={hoveredLinkTask}
                      onLinkToolHover={onLinkToolHover}
                      onLinkToolHoverEnd={onLinkToolHoverEnd}
                      getTaskRelationshipType={getTaskRelationshipType}
                      
                      // Network status
                      isOnline={isOnline}
                      
                      // Sprint filtering
                      selectedSprintId={selectedSprintId}
                      availableSprints={availableSprints}
                      hasActiveFilters={activeFilters}
                        />
                        {/* Resize handle between columns (not after the last one) */}
                        {index < array.length - 1 && onColumnWidthResize && (
                          <ColumnResizeHandle onResize={onColumnWidthResize} />
                        )}
                      </div>
                    </React.Fragment>
                  ))}
              </BoardDropArea>
            )}
            </div>
          </div>
            </>
          )}
        </div>
      )}


    </>
  );
};

// Board-level droppable area to detect when entering board area from tabs
const BoardDropArea: React.FC<{ selectedBoard: string | null; style: React.CSSProperties; children: React.ReactNode }> = ({ selectedBoard, style, children }) => {
  const { setNodeRef } = useDroppable({
    id: `board-area-${selectedBoard}`,
    data: {
      type: 'board-area',
      boardId: selectedBoard
    }
  });

  return (
    <div 
      ref={setNodeRef} 
      className="board-drop-area"
      style={{
        ...style
        // Background handled by CSS class to prevent flash
      }}
    >
      {children}
    </div>
  );
};

export default KanbanPage;
