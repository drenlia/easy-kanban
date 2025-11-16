import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Clock, MessageCircle, Calendar, Paperclip, Pencil } from 'lucide-react';
import { Task, TeamMember, Priority, PriorityOption, CurrentUser, Tag } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import QuickEditModal from './QuickEditModal';
import TaskCardToolbar from './TaskCardToolbar';
import AddCommentModal from './AddCommentModal';
import DateRangePicker from './DateRangePicker';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss, parseLocalDate } from '../utils/dateUtils';
import { createComment, fetchTaskAttachments } from '../api';
import { generateTaskUrl } from '../utils/routingUtils';
import { generateUUID } from '../utils/uuid';
import { mergeTaskTagsWithLiveData, getTagDisplayStyle } from '../utils/tagUtils';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { getAuthenticatedAttachmentUrl } from '../utils/authImageUrl';
import { CSS } from '@dnd-kit/utilities';
import { setDndGloballyDisabled, isDndGloballyDisabled } from '../utils/globalDndState';
import DOMPurify from 'dompurify';
import TextEditor from './TextEditor';

// System user member ID constant
const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

// Helper function to get priority colors from hex
const getPriorityColors = (hexColor: string) => {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Create light background and use original color for text
  const bgColor = `rgb(${r}, ${g}, ${b}, 0.1)`; // 10% opacity background
  const textColor = hexColor; // Original color for text
  
  return {
    backgroundColor: bgColor,
    color: textColor
  };
};

interface TaskCardProps {
  task: Task;
  member: TeamMember;
  members: TeamMember[];
  currentUser?: CurrentUser | null;
  onRemove: (taskId: string, event?: React.MouseEvent) => void;
  onEdit: (task: Task) => void;
  onCopy: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onSelect: (task: Task | null, options?: { scrollToComments?: boolean }) => void;
  isDragDisabled?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
  selectedTask?: Task | null;
  availableTags?: Tag[];
  siteSettings?: { [key: string]: string };
  columnIsFinished?: boolean;
  columnIsArchived?: boolean;
  onTagAdd?: (tagId: string) => void;
  onTagRemove?: (tagId: string) => void;
  boards?: any[]; // To get project identifier from board
  columns?: { [key: string]: { id: string; title: string; is_archived?: boolean; is_finished?: boolean } };
  
  // Task linking props
  isLinkingMode?: boolean;
  linkingSourceTask?: Task | null;
  onStartLinking?: (task: Task, startPosition: {x: number, y: number}) => void;
  onFinishLinking?: (targetTask: Task | null, relationshipType?: 'parent' | 'child' | 'related') => Promise<void>;
  
  // Hover highlighting props
  hoveredLinkTask?: Task | null;
  onLinkToolHover?: (task: Task) => void;
  onLinkToolHoverEnd?: () => void;
  getTaskRelationshipType?: (taskId: string) => 'parent' | 'child' | 'related' | null;
  
  // Sprint filtering props
  selectedSprintId?: string | null;
  availableSprints?: any[]; // Optional: sprints passed from parent (avoids duplicate API calls)
}



const TaskCard = React.memo(function TaskCard({
  task,
  member,
  members,
  currentUser,
  onRemove,
  onEdit,
  onCopy,
  onDragStart,
  onDragEnd,
  onSelect,
  isDragDisabled = false,
  taskViewMode = 'expand',
  availablePriorities = [],
  selectedTask = null,
  availableTags = [],
  onTagAdd,
  onTagRemove,
  siteSettings,
  columnIsFinished = false,
  columnIsArchived = false,
  boards,
  columns,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  onStartLinking,
  onFinishLinking,
  
  // Hover highlighting props
  hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd,
  getTaskRelationshipType,
  
  // Sprint filtering props
  selectedSprintId = null,
  availableSprints: propSprints
}: TaskCardProps) {
  const { t } = useTranslation('tasks');
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  const [showTagRemovalMenu, setShowTagRemovalMenu] = useState(false);
  const [selectedTagForRemoval, setSelectedTagForRemoval] = useState<Tag | null>(null);
  const [tagRemovalPosition, setTagRemovalPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  const [isHoveringTitle, setIsHoveringTitle] = useState(false);
  const [isHoveringDescription, setIsHoveringDescription] = useState(false);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  
  // Get project identifier from the board this task belongs to
  const getProjectIdentifier = () => {
    if (!boards || !task.boardId) return null;
    const board = boards.find(b => b.id === task.boardId);
    return board?.project || null;
  };

  // State for task attachments
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);

  // Fetch task attachments when component mounts or task changes
  useEffect(() => {
    const fetchAttachments = async () => {
      // Skip fetching if attachmentCount is falsy (0, null, undefined) - avoids unnecessary API calls
      if (!task.attachmentCount || task.attachmentCount === 0) {
        setTaskAttachments([]);
        setAttachmentsLoaded(true);
        return;
      }
      
      try {
        const attachments = await fetchTaskAttachments(task.id);
        setTaskAttachments(attachments || []);
        setAttachmentsLoaded(true);
      } catch (error) {
        console.error('❌ TaskCard: Failed to fetch task attachments:', error);
        setTaskAttachments([]);
        setAttachmentsLoaded(true);
      }
    };

    setAttachmentsLoaded(false);
    fetchAttachments();
  }, [task.id, task.attachmentCount]);

  // Fix blob URLs in task description - using EXACT same logic as comments
  const fixImageUrls = (htmlContent: string, attachments: any[]) => {
    if (!htmlContent) return htmlContent;
    
    let fixedContent = htmlContent;
    
    // First, try to replace blob URLs with their corresponding attachments
    attachments.forEach(attachment => {
      if (attachment.name && attachment.name.startsWith('img-')) {
        // Replace blob URLs with authenticated server URLs
        const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const authenticatedUrl = getAuthenticatedAttachmentUrl(attachment.url);
        fixedContent = fixedContent.replace(blobPattern, authenticatedUrl || attachment.url);
      }
    });
    
    // Fallback: Remove ANY remaining blob URLs that couldn't be matched to attachments
    // This prevents ERR_FILE_NOT_FOUND errors for stale blob URLs
    if (fixedContent.includes('blob:')) {
      console.warn('⚠️ TaskCard: Found unmatched blob URLs in description, removing them', {
        taskId: task.id,
        hasBlobUrl: fixedContent.includes('blob:')
      });
      // Replace remaining blob URLs in img tags
      fixedContent = fixedContent.replace(/<img[^>]*src="blob:[^"]*"[^>]*>/gi, '<!-- Image removed: blob URL expired -->');
      // Also replace any blob URLs in other contexts (like background-image in style attributes)
      fixedContent = fixedContent.replace(/blob:[^\s"')]+/gi, '');
    }
    
    return fixedContent;
  };

  const getFixedDescription = () => {
    if (!task.description) return task.description;
    
    // ALWAYS fix blob URLs, even while attachments are loading
    // If attachments are still loading and we have images, remove blob URLs immediately
    if (!attachmentsLoaded && task.description.includes('blob:')) {
      console.warn('⚠️ TaskCard: Attachments still loading but blob URLs found, removing them');
      return task.description.replace(/<img[^>]*src="blob:[^"]*"[^>]*>/g, '<!-- Loading image... -->');
    }
    
    // Use the exact same function as comments
    const fixedContent = fixImageUrls(task.description, taskAttachments);
    
    
    return fixedContent;
  };
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [isEditingEffort, setIsEditingEffort] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showPrioritySelect, setShowPrioritySelect] = useState(false);
  const [editedEffort, setEditedEffort] = useState(task.effort);
  const [editedDescription, setEditedDescription] = useState(task.description);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [dateRangePickerPosition, setDateRangePickerPosition] = useState<{ left: number; top: number } | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  
  // Sprint selector states
  const [showSprintSelector, setShowSprintSelector] = useState(false);
  const [sprints, setSprints] = useState<any[]>([]);
  const [sprintSearchTerm, setSprintSearchTerm] = useState('');
  const [highlightedSprintIndex, setHighlightedSprintIndex] = useState<number>(-1);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [sprintSelectorCoords, setSprintSelectorCoords] = useState<{left: number, top: number} | null>(null);
  const sprintSelectorRef = useRef<HTMLDivElement>(null);
  const sprintOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const calendarIconRef = useRef<HTMLDivElement>(null);
  
  // Date validation tooltip states
  const [showStartDateTooltip, setShowStartDateTooltip] = useState(false);
  const [showDueDateTooltip, setShowDueDateTooltip] = useState(false);
  const [dateTooltipPosition, setDateTooltipPosition] = useState<{left: number, top: number} | null>(null);
  const dateTooltipRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('below');
  const [showAddCommentModal, setShowAddCommentModal] = useState(false);
  const [showAttachmentsDropdown, setShowAttachmentsDropdown] = useState(false);
  const [attachmentsDropdownPosition, setAttachmentsDropdownPosition] = useState<{top: number, left: number, direction: 'above' | 'below'}>({top: 0, left: 0, direction: 'below'});
  const [priorityDropdownPosition, setPriorityDropdownPosition] = useState<{top: number, left: number, direction: 'above' | 'below'}>({top: 0, left: 0, direction: 'below'});
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentTooltipShowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentContainerRef = useRef<HTMLDivElement>(null);
  const commentTooltipRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);
  const tagRemovalMenuRef = useRef<HTMLDivElement>(null);
  const attachmentsButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentsDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null);

  // Check if any editing is active to disable drag
  const isAnyEditingActive = isEditingTitle || isEditingEffort || isEditingDescription || showQuickEdit || showMemberSelect || showPrioritySelect || showCommentTooltip || showTagRemovalMenu || showAttachmentsDropdown || showSprintSelector || showDateRangePicker;

  // Prevent component updates while editing description to maintain focus
  useEffect(() => {
    if (isEditingDescription) {
      return () => {
        // Cleanup if needed
      };
    }
  }, [isEditingDescription, task.description]);

  // @dnd-kit sortable hook for vertical reordering
  const {
    attributes,
    listeners: originalListeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    disabled: isDragDisabled || isAnyEditingActive || isDndGloballyDisabled(),
    data: {
      type: 'task',
      task: task,
      columnId: task.columnId,
      position: task.position
    }
  });

  // Wrap listeners to prevent drag from starting on elements with data-no-dnd attribute
  const listeners = React.useMemo(() => {
    if (!originalListeners) return originalListeners;
    
    return {
      ...originalListeners,
      onPointerDown: (e: React.PointerEvent) => {
        // Check if the target or any parent has data-no-dnd attribute
        const target = e.target as HTMLElement;
        if (target.closest('[data-no-dnd="true"]')) {
          // Don't start drag for elements marked with data-no-dnd
          return;
        }
        // Call original listener
        originalListeners.onPointerDown?.(e);
      }
    };
  }, [originalListeners]);

  // @dnd-kit droppable hook for cross-column insertion
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `${task.id}-drop`,
    data: {
      type: 'task',
      task: task,
      columnId: task.columnId,
      position: task.position
    }
  });

  // Combine both refs
  const setNodeRef = (node: HTMLElement | null) => {
    setSortableRef(node);
    setDroppableRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    zIndex: isDragging ? 1000 : 'auto',
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return formatToYYYYMMDD(dateStr);
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    return formatToYYYYMMDDHHmmss(dateStr);
  };

  // Get sprint name for display
  const getSprintName = (): string => {
    if (!task.sprintId || sprints.length === 0) return '';
    const sprint = sprints.find(s => s.id === task.sprintId);
    return sprint?.name || '';
  };

  // Determine if sprint badge should be shown
  const shouldShowSprintBadge = (): boolean => {
    // Only show badge if:
    // 1. Task has a sprint assigned
    // 2. No sprint filter is active (selectedSprintId is null)
    // 3. Sprint name is available
    return task.sprintId !== null && task.sprintId !== undefined && 
           selectedSprintId === null && 
           getSprintName() !== '';
  };

  // Validate task dates against sprint dates
  const getDateValidation = () => {
    if (!task.sprintId || sprints.length === 0) {
      return { startDateValid: true, dueDateValid: true, sprint: null };
    }

    const sprint = sprints.find(s => s.id === task.sprintId);
    if (!sprint || !sprint.start_date || !sprint.end_date) {
      return { startDateValid: true, dueDateValid: true, sprint: null };
    }

    const sprintStart = parseLocalDate(sprint.start_date);
    const sprintEnd = parseLocalDate(sprint.end_date);
    sprintStart.setHours(0, 0, 0, 0);
    sprintEnd.setHours(0, 0, 0, 0);

    let startDateValid = true;
    let dueDateValid = true;
    let startDateError = '';
    let dueDateError = '';

    if (task.startDate) {
      const taskStart = parseLocalDate(task.startDate);
      taskStart.setHours(0, 0, 0, 0);
      
      if (taskStart < sprintStart) {
        startDateValid = false;
        startDateError = `Start date is before sprint start (${formatDate(sprint.start_date)})`;
      } else if (taskStart > sprintEnd) {
        startDateValid = false;
        startDateError = `Start date is after sprint end (${formatDate(sprint.end_date)})`;
      }
    }

    if (task.dueDate) {
      const taskDue = parseLocalDate(task.dueDate);
      taskDue.setHours(0, 0, 0, 0);
      
      if (taskDue < sprintStart) {
        dueDateValid = false;
        dueDateError = `Due date is before sprint start (${formatDate(sprint.start_date)})`;
      } else if (taskDue > sprintEnd) {
        dueDateValid = false;
        dueDateError = `Due date is after sprint end (${formatDate(sprint.end_date)})`;
      }
    }

    return {
      startDateValid,
      dueDateValid,
      sprint,
      startDateError,
      dueDateError
    };
  };

  const dateValidation = getDateValidation();

  // Check if task is overdue (due date is before today)
  // Tasks in finished columns are never considered overdue
  const isOverdue = () => {
    if (columnIsFinished) return false; // Never overdue if in finished column
    if (!task.dueDate) return false;
    const today = new Date();
    const dueDate = parseLocalDate(task.dueDate);
    // Set time to beginning of day for fair comparison
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  // Check if this task is currently selected (TaskDetails panel is open for this task)
  const isSelected = selectedTask?.id === task.id;

  // Track drag state for parent notifications
  useEffect(() => {
    if (isDragging && !wasDraggingRef.current) {
      onDragStart(task);
      wasDraggingRef.current = true;
    } else if (!isDragging && wasDraggingRef.current) {
      onDragEnd();
      wasDraggingRef.current = false;
    }
  }, [isDragging, task, onDragStart, onDragEnd]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (commentTooltipTimeoutRef.current) {
        clearTimeout(commentTooltipTimeoutRef.current);
      }
      if (commentTooltipShowTimeoutRef.current) {
        clearTimeout(commentTooltipShowTimeoutRef.current);
      }
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);



  const handleMemberChange = (memberId: string) => {
    onEdit({ ...task, memberId });
    setShowMemberSelect(false);
  };

  const handleAddComment = () => {
    setShowAddCommentModal(true);
  };

  const handleCommentSubmit = async (commentText: string) => {
    if (!currentUser) {
      console.error('No current user available for comment');
      throw new Error('You must be logged in to add comments');
    }

    // Find the current user's member record to get the authorId
    const currentMember = members.find(m => m.user_id === currentUser.id);
    if (!currentMember) {
      console.error('Current user member record not found');
      throw new Error('Unable to identify user for comment');
    }

    try {
      // Create the comment via API
      const newComment = {
        id: generateUUID(), // Generate a proper UUID
        text: commentText,
        authorId: currentMember.id, // Use member ID as authorId
        createdAt: new Date().toISOString(),
        taskId: task.id,
        attachments: []
      };

      // Call the API to create the comment
      await createComment(newComment);

      // Update the local task state with the new comment
      const updatedTask = {
        ...task,
        comments: [...(task.comments || []), newComment]
      };
      
      // Update the task in the UI
      onEdit(updatedTask);
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  };

  const [clickPosition, setClickPosition] = useState<number | null>(null);
  const [_clickPositionDescription, setClickPositionDescription] = useState<{x: number, y: number} | null>(null);
  const _descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTitleClick = (e: React.MouseEvent<HTMLElement>) => {
    // Calculate cursor position based on click location
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    
    // Store the click position for later use
    setClickPosition(clickX);
    setIsEditingTitle(true);
    setEditedTitle(task.title);
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (clickPosition !== null) {
      const input = e.target;
      
      // Create a temporary span to measure text width
      const tempSpan = document.createElement('span');
      tempSpan.style.font = window.getComputedStyle(input).font;
      tempSpan.style.visibility = 'hidden';
      tempSpan.style.position = 'absolute';
      tempSpan.style.whiteSpace = 'pre';
      document.body.appendChild(tempSpan);
      
      // Find the character position closest to the click
      let cursorPosition = 0;
      for (let i = 0; i <= task.title.length; i++) {
        tempSpan.textContent = task.title.substring(0, i);
        const textWidth = tempSpan.offsetWidth;
        if (textWidth > clickPosition - 4) { // 4px padding offset
          cursorPosition = Math.max(0, i - 1);
          break;
        }
        cursorPosition = i;
      }
      
      document.body.removeChild(tempSpan);
      
      // Set cursor position after a brief delay to ensure it works
      setTimeout(() => {
        input.setSelectionRange(cursorPosition, cursorPosition);
      }, 0);
      
      // Clear the click position
      setClickPosition(null);
    }
  };

  const handleDescriptionClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Save title first if it's being edited
    if (isEditingTitle) {
      handleTitleSave();
    }
    
    // Calculate cursor position based on click location
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Store both X and Y positions for later use
    setClickPositionDescription({ x: clickX, y: clickY });
    setIsEditingDescription(true);
    // Use fixed description with proper image URLs for editing
    setEditedDescription(getFixedDescription() || '');
  };

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      onEdit({ ...task, title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(task.title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  // Auto-save title when clicking away from title field
  const handleTitleBlur = () => {
    if (isEditingTitle) {
      handleTitleSave();
    }
  };

  const handleDateRangeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setDateRangePickerPosition({
      left: rect.left,
      top: rect.bottom + 4
    });
    setShowDateRangePicker(true);
  };

  const handleDateRangeChange = (startDate: string, endDate: string) => {
    onEdit({ 
      ...task, 
      startDate,
      dueDate: endDate || undefined
    });
  };

  const handleDateRangePickerClose = () => {
    setShowDateRangePicker(false);
    setDateRangePickerPosition(null);
  };

  // Sprint selector handlers
  const handleSprintSelectorOpen = () => {
    if (!calendarIconRef.current) return;
    
    const rect = calendarIconRef.current.getBoundingClientRect();
    const dropdownWidth = 256; // w-64
    const dropdownHeight = 300; // Approximate max height
    
    // Calculate horizontal position
    let left = rect.left;
    const spaceRight = window.innerWidth - (left + dropdownWidth);
    
    if (spaceRight < 10) {
      left = rect.right - dropdownWidth;
    }
    
    if (left < 10) {
      left = 10;
    }
    
    // Calculate vertical position
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    let top;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      // Show above
      top = rect.top - Math.min(dropdownHeight, spaceAbove - 10);
    } else {
      // Show below
      top = rect.bottom + 4;
    }
    
    setSprintSelectorCoords({ left, top });
    setShowSprintSelector(true);
  };

  const handleSprintSelect = (sprint: any | null) => {
    if (sprint === null) {
      // "None (Backlog)" selected - clear sprint association
      onEdit({ 
        ...task, 
        sprintId: null
      });
    } else {
      // Sprint selected - only set sprint_id, don't modify dates
      onEdit({ 
        ...task, 
        sprintId: sprint.id
      });
    }
    setShowSprintSelector(false);
    setSprintSelectorCoords(null);
    setSprintSearchTerm('');
    setHighlightedSprintIndex(-1);
  };

  const handleSprintKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredSprints = sprints.filter(sprint =>
      sprint.name.toLowerCase().includes(sprintSearchTerm.toLowerCase())
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedSprintIndex(prev =>
        prev < filteredSprints.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedSprintIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedSprintIndex >= 0) {
      e.preventDefault();
      handleSprintSelect(filteredSprints[highlightedSprintIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSprintSelector(false);
      setSprintSearchTerm('');
      setHighlightedSprintIndex(-1);
    }
  };

  // Use prop sprints if provided, otherwise fetch when needed (fallback for backward compatibility)
  useEffect(() => {
    if (propSprints && propSprints.length > 0) {
      setSprints(propSprints);
      return;
    }
    
    // Only fetch if not provided via props and needed
    const fetchSprints = async () => {
      // Fetch if selector is opened OR if task has sprintId and we don't have sprints yet
      const shouldFetch = showSprintSelector || (task.sprintId && sprints.length === 0);
      if (!shouldFetch) return;
      
      try {
        setSprintsLoading(true);
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/sprints', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setSprints(data.sprints || []);
        }
      } catch (error) {
        console.error('Failed to fetch sprints:', error);
      } finally {
        setSprintsLoading(false);
      }
    };

    fetchSprints();
  }, [propSprints, showSprintSelector, task.sprintId, sprints.length]);

  // Close sprint selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sprintSelectorRef.current && !sprintSelectorRef.current.contains(event.target as Node)) {
        setShowSprintSelector(false);
        setSprintSelectorCoords(null);
        setSprintSearchTerm('');
        setHighlightedSprintIndex(-1);
      }
    };

    if (showSprintSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSprintSelector]);

  // Reset highlighted index when search term changes
  useEffect(() => {
    setHighlightedSprintIndex(-1);
  }, [sprintSearchTerm]);

  // Auto-scroll to highlighted sprint option
  useEffect(() => {
    if (highlightedSprintIndex >= 0 && sprintOptionRefs.current[highlightedSprintIndex]) {
      sprintOptionRefs.current[highlightedSprintIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [highlightedSprintIndex]);

  const handleEffortSave = () => {
    if (editedEffort !== task.effort) {
      onEdit({ ...task, effort: editedEffort });
    }
    setIsEditingEffort(false);
  };

  const handleEffortCancel = () => {
    setEditedEffort(task.effort);
    setIsEditingEffort(false);
  };

  const handleEffortKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEffortSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEffortCancel();
    }
  };

  const _handleDescriptionSave = () => {
    if (editedDescription !== task.description) {
      onEdit({ ...task, description: editedDescription });
    }
    setIsEditingDescription(false);
  };

  const _handleDescriptionCancel = () => {
    setEditedDescription(task.description);
    setIsEditingDescription(false);
  };

  const handlePriorityChange = (priorityId: number) => {
    const priorityOption = availablePriorities.find(p => p.id === priorityId);
    onEdit({ 
      ...task, 
      priorityId: priorityId,
      priority: priorityOption?.priority || null 
    });
    setShowPrioritySelect(false);
  };

  const handleCommentTooltipShow = () => {
    // Clear any pending hide timeout
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
    
    // Clear any existing show timeout
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
    }
    
    // Wait 0.5 seconds before showing tooltip
    commentTooltipShowTimeoutRef.current = setTimeout(() => {
      // Position will be calculated by useLayoutEffect
      setShowCommentTooltip(true);
      commentTooltipShowTimeoutRef.current = null;
    }, 500);
  };

  const handleCommentTooltipHide = () => {
    // Cancel any pending show timeout when leaving
    if (commentTooltipShowTimeoutRef.current) {
      clearTimeout(commentTooltipShowTimeoutRef.current);
      commentTooltipShowTimeoutRef.current = null;
    }
    
    // Only hide after a delay to allow mouse movement into tooltip
    commentTooltipTimeoutRef.current = setTimeout(() => {
      setShowCommentTooltip(false);
    }, 500); // Generous delay
  };

  const calculateDropdownPosition = () => {
    if (priorityButtonRef.current) {
      const rect = priorityButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 150; // Approximate height for priority dropdown
      
      let top, left;
      if (spaceBelow < dropdownHeight) {
        // Show above
        top = rect.top - dropdownHeight - 8;
      } else {
        // Show below
        top = rect.bottom + 8;
      }
      
      left = rect.left;
      
      return { top, left, direction: spaceBelow < dropdownHeight ? 'above' : 'below' };
    }
    return { top: 0, left: 0, direction: 'below' as const };
  };

  const calculateAttachmentsDropdownPosition = () => {
    if (attachmentsButtonRef.current) {
      const rect = attachmentsButtonRef.current.getBoundingClientRect();
      const dropdownWidth = 256; // w-64
      const dropdownMaxHeight = 320; // max-h-80 = 20rem = 320px
      
      // Get actual dropdown height if it exists, otherwise use max
      const actualDropdownHeight = attachmentsDropdownRef.current?.offsetHeight || dropdownMaxHeight;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let top, left;
      
      // Prefer showing below, but if not enough space, show above
      if (spaceBelow >= actualDropdownHeight + 16 || spaceBelow > spaceAbove) {
        // Show below
        top = rect.bottom + 8;
      } else {
        // Show above
        top = rect.top - actualDropdownHeight - 8;
      }
      
      // Align right edge of dropdown with right edge of button
      left = rect.right - dropdownWidth;
      
      // Ensure dropdown doesn't go off-screen horizontally
      if (left < 8) left = 8;
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
      }
      
      // Ensure dropdown doesn't go off-screen vertically
      if (top < 8) top = 8;
      if (top + actualDropdownHeight > window.innerHeight - 8) {
        top = window.innerHeight - actualDropdownHeight - 8;
      }
      
      return { top, left, direction: spaceBelow >= actualDropdownHeight + 16 ? 'below' : 'above' };
    }
    return { top: 0, left: 0, direction: 'below' as const };
  };

  const calculateTooltipPosition = () => {
    if (commentContainerRef.current) {
      const commentRect = commentContainerRef.current.getBoundingClientRect();
      const tooltipWidth = 320; // w-80 = 320px
      const tooltipMaxHeight = 256; // max-h-64 = 256px
      
      // Get actual tooltip height if it exists, otherwise use max
      const actualTooltipHeight = commentTooltipRef.current?.offsetHeight || tooltipMaxHeight;
      const spaceAbove = commentRect.top;
      const spaceBelow = window.innerHeight - commentRect.bottom;
      
      // Calculate horizontal position - center tooltip on the comment icon
      let left = commentRect.left + (commentRect.width / 2) - (tooltipWidth / 2);
      
      // Keep tooltip within viewport bounds horizontally
      if (left < 8) {
        left = 8;
      }
      if (left + tooltipWidth > window.innerWidth - 8) {
        left = window.innerWidth - tooltipWidth - 8;
      }
      
      // Position tooltip - prefer above, fallback to below
      let top;
      if (spaceAbove >= actualTooltipHeight + 16 || spaceAbove > spaceBelow) {
        // Show above (preferred)
        top = commentRect.top - actualTooltipHeight - 8;
      } else {
        // Show below (fallback)
        top = commentRect.bottom + 8;
      }
      
      // Ensure tooltip doesn't go off-screen vertically
      if (top < 8) top = 8;
      if (top + actualTooltipHeight > window.innerHeight - 8) {
        top = window.innerHeight - actualTooltipHeight - 8;
      }
      
      return { left, top };
    }
    return { left: 0, top: 0 };
  };

  // Recalculate dropdown positions when they open (before browser paints)
  useLayoutEffect(() => {
    if (showPrioritySelect) {
      setPriorityDropdownPosition(calculateDropdownPosition());
    }
  }, [showPrioritySelect]);

  useLayoutEffect(() => {
    if (showAttachmentsDropdown) {
      setAttachmentsDropdownPosition(calculateAttachmentsDropdownPosition());
    }
  }, [showAttachmentsDropdown]);

  useLayoutEffect(() => {
    if (showCommentTooltip) {
      setTooltipPosition(calculateTooltipPosition());
    }
  }, [showCommentTooltip]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Don't handle member select here - it's portal-rendered in TaskCardToolbar
      // and handles its own click-outside logic via stopPropagation
      
      if (showPrioritySelect) {
        // Check if click is outside both the button and the dropdown
        if (
          priorityButtonRef.current && !priorityButtonRef.current.contains(target) &&
          priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)
        ) {
          setShowPrioritySelect(false);
        }
      }
      
      if (showAttachmentsDropdown) {
        // Check if click is outside both the button and the dropdown
        if (
          attachmentsButtonRef.current && !attachmentsButtonRef.current.contains(target) &&
          attachmentsDropdownRef.current && !attachmentsDropdownRef.current.contains(target)
        ) {
          setShowAttachmentsDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPrioritySelect, showAttachmentsDropdown]);

  useEffect(() => {
    if (isDragging) {
      onDragStart(task);
    } else {
      onDragEnd();
    }
  }, [isDragging, task, onDragStart, onDragEnd]);

  // Close tag removal menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagRemovalMenuRef.current && !tagRemovalMenuRef.current.contains(event.target as Node)) {
        setShowTagRemovalMenu(false);
        setSelectedTagForRemoval(null);
      }
    };

    if (showTagRemovalMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTagRemovalMenu]);

  // Handle click outside for title and description editing
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if clicked outside the card
      if (cardElement && !cardElement.contains(target)) {
        // Save title if editing
        if (isEditingTitle) {
          handleTitleSave();
        }
        
        // Save description if editing
        if (isEditingDescription) {
          if (editedDescription !== task.description) {
            onEdit({ ...task, description: editedDescription });
          }
          setIsEditingDescription(false);
        }
      }
    };

    if (isEditingTitle || isEditingDescription) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditingTitle, isEditingDescription, editedDescription, task, cardElement, handleTitleSave, onEdit]);

  // Tag removal handlers
  const handleConfirmTagRemoval = () => {
    if (selectedTagForRemoval && onTagRemove) {
      onTagRemove(selectedTagForRemoval.id.toString());
      setShowTagRemovalMenu(false);
      setSelectedTagForRemoval(null);
    }
  };

  const handleCancelTagRemoval = () => {
    setShowTagRemovalMenu(false);
    setSelectedTagForRemoval(null);
  };

  const validComments = (task.comments || [])
    .filter(comment => 
      comment && 
      comment.id && 
      comment.text && 
      comment.text.trim() !== '' && 
      comment.authorId && 
      comment.createdAt
    );

  return (
    <>
      <div
        ref={(node) => {
          setNodeRef(node);
          setCardElement(node);
        }}
        style={{ ...style, borderLeft: `4px solid ${member.color}` }}
        className={`task-card sortable-item cursor-pointer ${
          isSelected ? 'bg-gray-100 dark:bg-gray-700' : 
          member.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50 dark:bg-yellow-900' : 
          'bg-white dark:bg-gray-800'
        } p-4 rounded-lg shadow-sm relative transition-all duration-200 ${
          isDragging ? 'opacity-90 scale-105 shadow-2xl rotate-2 ring-2 ring-blue-400' : 'hover:shadow-md'
        } ${
          isLinkingMode && linkingSourceTask?.id !== task.id 
            ? 'hover:ring-2 hover:ring-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900' 
            : ''
        } ${
          isLinkingMode && linkingSourceTask?.id === task.id 
            ? 'ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900' 
            : ''
        } ${
          // Highlight related tasks when hovering over link tool
          hoveredLinkTask && getTaskRelationshipType && hoveredLinkTask.id !== task.id ? (() => {
            const relationshipType = getTaskRelationshipType(task.id);
            if (relationshipType === 'parent') {
              return 'ring-2 ring-green-400 bg-green-50 dark:bg-green-900 shadow-lg';
            } else if (relationshipType === 'child') {
              return 'ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-900 shadow-lg';
            } else if (relationshipType === 'related') {
              return 'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900 shadow-lg';
            }
            return '';
          })() : ''
        }`}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          // Only open task details if we're not in linking mode and not clicking interactive elements
          if (isLinkingMode) return;
          
          const target = e.target as HTMLElement;
          // Don't open if clicking on interactive elements or their children
          // Check both direct tag and closest() to catch clicks on elements inside buttons
          if (
            target.tagName === 'BUTTON' ||
            target.tagName === 'INPUT' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'A' ||
            target.tagName === 'IMG' || // Images might be inside buttons
            target.tagName === 'SVG' || // SVG icons might be inside buttons
            target.tagName === 'PATH' || // SVG paths inside icons
            target.closest('button') ||
            target.closest('a') ||
            target.closest('input') ||
            target.closest('select') ||
            target.closest('svg') || // SVG elements and their children
            target.closest('[data-stop-propagation]') // Allow marking elements to stop propagation
          ) {
            return;
          }
          
          // Delay opening/closing TaskDetails to allow double-click to cancel it
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
          }
          clickTimerRef.current = setTimeout(() => {
            // Toggle: if clicking the same task that's already selected, close TaskDetails
            if (selectedTask && selectedTask.id === task.id) {
              onSelect(null);
            } else {
              onSelect(task);
            }
            clickTimerRef.current = null;
          }, 250); // Wait 250ms to distinguish from double-click
        }}
        onMouseEnter={() => {
          setIsHoveringCard(true);
          setIsHoveringTitle(true);
          setIsHoveringDescription(true);
        }}
        onMouseLeave={() => {
          setIsHoveringCard(false);
          setIsHoveringTitle(false);
          setIsHoveringDescription(false);
        }}
        onMouseUp={isLinkingMode ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onFinishLinking) {
            if (linkingSourceTask?.id !== task.id) {
              // Different task - create relationship
              onFinishLinking(task);
            } else {
              // Same task - cancel linking
              onFinishLinking(null);
            }
          }
        } : undefined}
      >
        {/* Task Identifier Overlay - Top Right Corner */}
        {task.ticket && (
          <div className="absolute right-0 z-10" style={{ top: '-8px' }}>
            <a 
              href={generateTaskUrl(task.ticket, getProjectIdentifier())}
              className={`bg-white dark:bg-gray-800 px-1.5 py-0.8 text-gray-600 dark:text-gray-300 font-mono font-bold hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 transition-all duration-200 cursor-pointer`}
              style={{
                borderTopLeftRadius: '0.25rem',
                borderTopRightRadius: '0.25rem',
                borderBottomLeftRadius: '0',
                borderBottomRightRadius: '0',
                border: 'none',
                fontSize: '12px',
                textDecoration: 'none',
                display: 'inline-block',
                lineHeight: '1.2',
                verticalAlign: 'top'
              }}
              title={t('taskCard.directLinkTo', { ticket: task.ticket })}
            >
              {task.ticket}
            </a>
                </div>
              )}
        {/* TaskCard Toolbar - Extracted to separate component */}
        <TaskCardToolbar
          task={task}
          member={member}
          members={members}
          isDragDisabled={isDragDisabled || isAnyEditingActive || isDndGloballyDisabled()}
          showMemberSelect={showMemberSelect}
          onCopy={onCopy}
          onEdit={onEdit}
          onSelect={onSelect}
          onRemove={onRemove}
          onShowQuickEdit={() => setShowQuickEdit(true)}
          onAddComment={handleAddComment}
          onMemberChange={handleMemberChange}
          onToggleMemberSelect={() => setShowMemberSelect(!showMemberSelect)}
          setDropdownPosition={setDropdownPosition}
          dropdownPosition={dropdownPosition}
          listeners={listeners}
          attributes={attributes}
          availableTags={availableTags}
          onTagAdd={onTagAdd}
          columnIsFinished={columnIsFinished}
          columns={columns}
          
          // Task linking props
          isLinkingMode={isLinkingMode}
          linkingSourceTask={linkingSourceTask}
          onStartLinking={onStartLinking}
          
          // Hover highlighting props
          hoveredLinkTask={hoveredLinkTask}
          onLinkToolHover={onLinkToolHover}
          onLinkToolHoverEnd={onLinkToolHoverEnd}
          
          // Show toolbar only on hover or when editing
          isHoveringCard={isHoveringCard}
          isEditingTitle={isEditingTitle}
          isEditingDescription={isEditingDescription}
        />

        {/* Relationship Type Indicator - Only show when hovering over link tool */}
        {hoveredLinkTask && getTaskRelationshipType && hoveredLinkTask.id !== task.id && (() => {
          const relationshipType = getTaskRelationshipType(task.id);
          if (relationshipType) {
            const badges = {
              parent: { text: 'PARENT', color: 'bg-green-500' },
              child: { text: 'CHILD', color: 'bg-purple-500' },
              related: { text: 'RELATED', color: 'bg-yellow-500' }
            };
            const badge = badges[relationshipType];
            return (
              <div className="absolute top-2 left-2 z-20">
                <div className={`${badge.color} text-white text-xs px-1.5 py-0.5 rounded-full font-bold shadow-md`}>
                  {badge.text}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Title Row - Full Width */}
        <div className="mb-2 mt-1">
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onFocus={handleInputFocus}
              className="font-medium text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full text-sm"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <div 
              className={`relative ${isDragDisabled || isAnyEditingActive ? '' : 'cursor-grab active:cursor-grabbing'}`}
              {...listeners}
            >
              {isHoveringTitle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTitleClick(e as any);
                  }}
                  className="absolute -left-[10px] top-1/2 -translate-y-1/2 -translate-x-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors z-10"
                  title={t('taskCard.editTitle')}
                  data-tour-id="task-quick-edit"
                >
                  <Pencil size={12} className="text-gray-400 hover:text-blue-500" />
                </button>
              )}
              <h3 
                className="font-medium text-gray-800 dark:text-gray-100 px-1 py-0.5 rounded text-sm pr-12"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  // Cancel pending single-click timer to prevent TaskDetails from opening
                  if (clickTimerRef.current) {
                    clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = null;
                  }
                  handleTitleClick(e as any);
                }}
                style={{ cursor: isDragDisabled || isAnyEditingActive ? 'default' : 'grab' }}
              >
                {task.title}
              </h3>
            </div>
          )}
        </div>

        {/* Description Section */}
        {taskViewMode !== 'compact' && (
          <>
            {isEditingDescription ? (
              <div className="-mt-2 mb-3" onClick={(e) => e.stopPropagation()} style={{ cursor: 'text' }}>
                <TextEditor
                  onSubmit={async (content) => {
                    // Handle save
                    if (content !== task.description) {
                      onEdit({ ...task, description: content });
                    }
                    setIsEditingDescription(false);
                  }}
                  onCancel={() => {
                    setEditedDescription(task.description);
                    setIsEditingDescription(false);
                  }}
                  onChange={(content) => {
                    setEditedDescription(content);
                  }}
                  initialContent={editedDescription}
                  placeholder={t('taskCard.enterTaskDescription')}
                  compact={true}
                  showSubmitButtons={false}
                  resizable={true}
                  toolbarOptions={{
                    bold: true,
                    italic: true,
                    underline: false,
                    link: true,
                    lists: true,
                    alignment: false,
                    attachments: false
                  }}
                  // Image behavior: read-only mode for TaskCard
                  allowImagePaste={false}    // ❌ No pasting new images
                  allowImageDelete={false}   // ❌ No delete button on images
                  allowImageResize={true}    // ✅ Allow resizing for layout
                  imageDisplayMode="compact" // 📏 Smaller images in TaskCard
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                  <span>{t('taskCard.descriptionSaveHint')}</span>
                </div>
              </div>
            ) : (
              <div
                className={`relative -mt-2 mb-3 ${isDragDisabled || isAnyEditingActive ? '' : 'cursor-grab active:cursor-grabbing'}`}
                {...listeners}
              >
                {isHoveringDescription && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDescriptionClick(e as any);
                    }}
                    className="absolute -left-[10px] top-2 -translate-x-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors z-10"
                    title={t('taskCard.editDescription')}
                  >
                    <Pencil size={12} className="text-gray-400 hover:text-blue-500" />
                  </button>
                )}
                <div
                  className={`task-card-description text-sm text-gray-600 dark:text-gray-300 px-2 py-1 rounded transition-colors min-h-[2.5rem] prose prose-sm max-w-none ${
                    taskViewMode === 'shrink' ? 'line-clamp-2 overflow-hidden' : ''
                  }`}
                  title={taskViewMode === 'shrink' && task.description ? task.description.replace(/<[^>]*>/g, '') : ""}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Cancel pending single-click timer to prevent TaskDetails from opening
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = null;
                    }
                    handleDescriptionClick(e as any);
                  }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(getFixedDescription() || '')
                  }}
                  style={{
                    // Ensure images fit nicely in task cards
                    '--tw-prose-body': '1rem',
                    '--tw-prose-headings': '1rem',
                    cursor: isDragDisabled || isAnyEditingActive ? 'default' : 'grab'
                  } as React.CSSProperties}
                />
              </div>
            )}
          </>
        )}

        {/* Sprint Badge - Conditional Display */}
        {shouldShowSprintBadge() && (() => {
          const sprintName = getSprintName();
          // Truncate long sprint names
          const displayName = sprintName.length > 20 ? sprintName.substring(0, 17) + '...' : sprintName;
          
          return (
            <div className="flex justify-end mb-2">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 max-w-full truncate"
                title={t('taskCard.sprint', { name: sprintName })}
              >
                {displayName}
              </span>
            </div>
          );
        })()}

        {/* Tags Section - Right Aligned */}
        {task.tags && task.tags.length > 0 && (() => {
          // Merge task tags with live tag data to get updated colors
          const liveTags = mergeTaskTagsWithLiveData(task.tags, availableTags);
          
          return (
            <div 
              className="flex justify-end mb-2 relative"
              onMouseEnter={() => setShowAllTags(true)}
              onMouseLeave={() => setShowAllTags(false)}
            >
              <div className={`flex flex-wrap gap-1 justify-end transition-all duration-200 ${
                showAllTags ? 'max-w-none' : 'max-w-full overflow-hidden'
              }`}>
                {(showAllTags ? liveTags : liveTags.slice(0, 3)).map((tag) => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                    style={getTagDisplayStyle(tag)}
                    title={t('taskCard.clickToRemoveTag')}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const menuWidth = 220;
                    const menuHeight = 80; // Approximate height of the menu
                    
                    // Calculate ideal position (centered below tag)
                    let left = rect.left + rect.width / 2 - menuWidth / 2;
                    let top = rect.bottom + 5;
                    
                    // Prevent going off the right edge
                    if (left + menuWidth > window.innerWidth - 10) {
                      left = window.innerWidth - menuWidth - 10;
                    }
                    
                    // Prevent going off the left edge
                    if (left < 10) {
                      left = 10;
                    }
                    
                    // If menu would go below viewport, show it above the tag instead
                    if (top + menuHeight > window.innerHeight - 10) {
                      top = rect.top - menuHeight - 5;
                    }
                    
                    // If still going off top, position it within viewport
                    if (top < 10) {
                      top = 10;
                    }
                    
                    setTagRemovalPosition({ left, top });
                    setSelectedTagForRemoval(tag);
                    setShowTagRemovalMenu(true);
                  }}
                >
                  {tag.tag}
                </span>
              ))}
              {!showAllTags && liveTags.length > 3 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-400 text-white">
                  +{liveTags.length - 3}
                </span>
              )}
            </div>
          </div>
          );
        })()}
        
        {/* Bottom metadata row */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          {/* Left side - dates and effort and comments */}
          <div className="flex items-center gap-2">
            {/* Dates - ultra compact with sprint selector */}
            <div className="flex items-center gap-0.5">
              <div
                ref={calendarIconRef}
                title={t('taskCard.clickToSelectSprint')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSprintSelectorOpen();
                }}
                data-tour-id="sprint-association"
              >
                <Calendar 
                  size={12} 
                  className="cursor-pointer hover:text-blue-600 transition-colors"
                />
              </div>
              <div 
                className="text-[8px] leading-none font-mono cursor-pointer hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors"
                onClick={handleDateRangeClick}
                title={t('taskCard.clickToChangeDates')}
              >
                {/* Start Date */}
                <div
                  className={`${!dateValidation.startDateValid ? 'font-semibold ring-1 ring-red-400 rounded px-0.5' : ''}`}
                  onMouseEnter={(e) => {
                    if (!dateValidation.startDateValid) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDateTooltipPosition({
                        left: rect.left + rect.width / 2,
                        top: rect.top - 4
                      });
                      setShowStartDateTooltip(true);
                    }
                  }}
                  onMouseLeave={() => setShowStartDateTooltip(false)}
                  title={!dateValidation.startDateValid ? dateValidation.startDateError : ''}
                >
                  {formatDate(task.startDate)}
                </div>
                {/* Due Date - directly underneath with zero spacing */}
                {task.dueDate && (
                  <div 
                    className={`${!dateValidation.dueDateValid ? 'font-semibold ring-1 ring-red-400 rounded px-0.5' : ''}`}
                    onMouseEnter={(e) => {
                      if (!dateValidation.dueDateValid) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDateTooltipPosition({
                          left: rect.left + rect.width / 2,
                          top: rect.top - 4
                        });
                        setShowDueDateTooltip(true);
                      }
                    }}
                    onMouseLeave={() => setShowDueDateTooltip(false)}
                    title={!dateValidation.dueDateValid ? dateValidation.dueDateError : ''}
                  >
                    {formatDate(task.dueDate)}
                  </div>
                )}
              </div>
            </div>
            
            {/* Effort - squeezed close */}
            <div className="flex items-center gap-0.5">
              <Clock size={12} />
              {isEditingEffort ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editedEffort}
                  onChange={(e) => setEditedEffort(parseInt(e.target.value) || 0)}
                  onBlur={handleEffortSave}
                  onKeyDown={handleEffortKeyDown}
                  className="text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-10"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingEffort(true);
                  }}
                  className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer text-xs"
                  title={t('taskCard.clickToChangeEffort')}
                >
                  {task.effort}h
                </button>
              )}
            </div>

            {/* Comments - squeezed close to effort */}
            {validComments && validComments.length > 0 && (
              <div 
                ref={commentContainerRef}
                className="relative"
                onMouseEnter={handleCommentTooltipShow}
                onMouseLeave={handleCommentTooltipHide}
              >
                <div
                  className="flex items-center gap-0.5 rounded px-1 py-1"
                  title={t('taskCard.hoverToViewComments')}
                >
                  <MessageCircle 
                    size={12} 
                    className="text-blue-600" 
                  />
                  <span className="text-blue-600 font-medium text-xs">
                    {validComments.length}
                  </span>
                </div>
              
              </div>
            )}
          </div>

          {/* Right side - attachments and priority */}
          <div className="flex items-center gap-2">
            {/* Attachments indicator - clickable */}
            {task.attachmentCount > 0 && (
              <div className="relative">
                <button
                  ref={attachmentsButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAttachmentsDropdown(!showAttachmentsDropdown);
                  }}
                  className="flex items-center gap-0.5 text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
                  title={task.attachmentCount > 1 ? t('taskCard.attachments', { count: task.attachmentCount }) : t('taskCard.attachment', { count: task.attachmentCount })}
                  data-stop-propagation
                >
                  <Paperclip size={12} />
                  <span className="text-xs">{task.attachmentCount}</span>
                </button>

              </div>
            )}

            {/* Attachments Dropdown - Portal */}
            {showAttachmentsDropdown && createPortal(
              <div 
                ref={attachmentsDropdownRef}
                className="fixed w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-[9999] max-h-80 overflow-y-auto"
                style={{
                  top: `${attachmentsDropdownPosition.top}px`,
                  left: `${attachmentsDropdownPosition.left}px`
                }}
              >
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 px-2">
                    {t('taskCard.attachmentsTitle', { count: task.attachmentCount })}
                  </div>
                  {taskAttachments
                    .filter(att => !att.name.startsWith('img-'))
                    .map((attachment) => (
                      <a
                        key={attachment.id}
                        href={getAuthenticatedAttachmentUrl(attachment.url) || attachment.url}
                        {...(siteSettings?.SITE_OPENS_NEW_TAB === undefined || siteSettings?.SITE_OPENS_NEW_TAB === 'true' 
                          ? { target: '_blank', rel: 'noopener noreferrer' } 
                          : {})}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 px-2 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        <Paperclip size={14} className="flex-shrink-0 text-gray-400" />
                        <span className="truncate flex-1">{attachment.name}</span>
                      </a>
                    ))}
                  {taskAttachments.filter(att => !att.name.startsWith('img-')).length === 0 && (
                    <div className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400 italic">
                      {t('taskCard.loadingAttachments')}
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}

            {/* Priority */}
            <div className="relative priority-container">
              <button
              ref={priorityButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowPrioritySelect(!showPrioritySelect);
              }}
              className={`px-2 py-1 rounded-full text-xs cursor-pointer hover:opacity-80 transition-all ${showPrioritySelect ? 'ring-2 ring-blue-400' : ''}`}
              style={(() => {
                // Always use priorityId to find the current priority (handles renamed priorities)
                // Fall back to priorityName from API (from JOIN), then stored priority name
                const priorityOption = task.priorityId 
                  ? availablePriorities.find(p => p.id === task.priorityId)
                  : (task.priorityName 
                    ? availablePriorities.find(p => p.priority === task.priorityName)
                    : (task.priority 
                      ? availablePriorities.find(p => p.priority === task.priority)
                      : null));
                return priorityOption ? getPriorityColors(priorityOption.color) : { backgroundColor: '#f3f4f6', color: '#6b7280' };
              })()}
              title={t('taskCard.clickToChangePriority')}
            >
              {(() => {
                // Always use priorityId to look up current priority name (handles renamed priorities)
                // This ensures we show the current name, not the old stored name
                if (task.priorityId) {
                  const priorityOption = availablePriorities.find(p => p.id === task.priorityId);
                  if (priorityOption) {
                    return priorityOption.priority; // Use current name from availablePriorities
                  }
                }
                // Fallback: use priorityName from API (from JOIN), or stored priority name
                return task.priorityName || task.priority || '';
              })()}
            </button>
            
            {/* Completed Column Banner Overlay - positioned over priority */}
            {columnIsFinished && !columnIsArchived && (
              <div className="absolute inset-0 pointer-events-none z-30">
                {/* Diagonal banner background */}
                <div className="absolute top-0 right-0 w-full h-full">
                  <div 
                    className="absolute top-0 right-0 w-0 h-0"
                    style={{
                      borderLeft: '60px solid transparent',
                      borderBottom: '100% solid rgba(34, 197, 94, 0.2)',
                      transform: 'translateX(0)'
                    }}
                  />
                </div>
                {/* "DONE" stamp */}
                <div className="absolute top-0.5 right-0.5">
                  <div className="bg-green-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-lg opacity-95 transform -rotate-12">
                    {t('taskCard.done')}
                  </div>
                </div>
              </div>
            )}
            
            {/* Overdue Task Banner Overlay - positioned over priority */}
            {!columnIsFinished && !columnIsArchived && isOverdue() && siteSettings?.HIGHLIGHT_OVERDUE_TASKS === 'true' && (
              <div className="absolute inset-0 pointer-events-none z-30">
                {/* Diagonal banner background */}
                <div className="absolute top-0 right-0 w-full h-full">
                  <div 
                    className="absolute top-0 right-0 w-0 h-0"
                    style={{
                      borderLeft: '60px solid transparent',
                      borderBottom: '100% solid rgba(239, 68, 68, 0.2)',
                      transform: 'translateX(0)'
                    }}
                  />
                </div>
                {/* "LATE" stamp */}
                <div className="absolute top-0.5 right-0.5">
                  <div className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-lg opacity-95 transform -rotate-12">
                    {t('taskCard.late')}
                  </div>
                </div>
              </div>
            )}

            </div>
          </div>
        </div>
      </div>

      {/* Priority Dropdown - Portal */}
      {showPrioritySelect && createPortal(
        <div 
          ref={priorityDropdownRef}
          className="fixed w-24 bg-white dark:bg-gray-800 rounded-md shadow-lg z-[9999] border border-gray-200 dark:border-gray-700"
          style={{
            top: `${priorityDropdownPosition.top}px`,
            left: `${priorityDropdownPosition.left}px`
          }}
        >
          {availablePriorities
            .filter(priorityOption => priorityOption.id !== task.priorityId)
            .map(priorityOption => (
              <button
                key={priorityOption.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePriorityChange(priorityOption.id);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center gap-2"
              >
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: priorityOption.color }}
                />
                {priorityOption.priority}
              </button>
            ))}
        </div>,
        document.body
      )}



      {showQuickEdit && (
        <QuickEditModal
          task={task}
          members={members}
          onClose={() => {
            setShowQuickEdit(false);
            setDndGloballyDisabled(false);
          }}
          onSave={onEdit}
        />
      )}

      {/* Add Comment Modal */}
      <AddCommentModal
        isOpen={showAddCommentModal}
        taskTitle={task.title}
        onClose={() => setShowAddCommentModal(false)}
        onSubmit={handleCommentSubmit}
      />

      {/* Portal-rendered comment tooltip */}
      {showCommentTooltip && createPortal(
        <div 
          ref={commentTooltipRef}
          className="comment-tooltip fixed w-80 bg-gray-800 text-white text-xs rounded-md shadow-lg z-[9999] max-h-64 flex flex-col"
          style={{
            left: `${tooltipPosition.left}px`,
            top: `${tooltipPosition.top}px`
          }}
          onMouseEnter={handleCommentTooltipShow}
          onMouseLeave={handleCommentTooltipHide}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
                      {/* Scrollable comments area */}
                      <div className="p-3 overflow-y-auto flex-1">
                    {validComments
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((comment, index) => {
                        const author = members.find(m => m.id === comment.authorId);
                        
                        // Function to render HTML content with safe link handling and blob URL fixing
                        const renderCommentHTML = (htmlText: string) => {
                          // First, fix blob URLs by replacing them with authenticated server URLs (matching TaskDetails/TaskPage)
                          let fixedContent = htmlText;
                          const blobPattern = /blob:[^"]*#(img-[^"]*)/g;
                          fixedContent = fixedContent.replace(blobPattern, (_match, filename) => {
                            // Convert blob URL to authenticated server URL
                            const authenticatedUrl = getAuthenticatedAttachmentUrl(`/attachments/${filename}`);
                            return authenticatedUrl || `/uploads/${filename}`;
                          });
                          
                          // Fallback: Remove ANY remaining blob URLs that couldn't be matched
                          if (fixedContent.includes('blob:')) {
                            // Replace remaining blob URLs in img tags
                            fixedContent = fixedContent.replace(/<img[^>]*src="blob:[^"]*"[^>]*>/gi, '<!-- Image removed: blob URL expired -->');
                            // Also replace any blob URLs in other contexts
                            fixedContent = fixedContent.replace(/blob:[^\s"')]+/gi, '');
                          }
                          
                          // Create a temporary div to parse the HTML
                          const tempDiv = document.createElement('div');
                          tempDiv.innerHTML = fixedContent;
                          
                          // Find all links and update their attributes for safety
                          const links = tempDiv.querySelectorAll('a');
                          const opensInNewTab = siteSettings?.SITE_OPENS_NEW_TAB === undefined || siteSettings?.SITE_OPENS_NEW_TAB === 'true';
                          
                          links.forEach(link => {
                            if (opensInNewTab) {
                              link.setAttribute('target', '_blank');
                              link.setAttribute('rel', 'noopener noreferrer');
                            } else {
                              link.removeAttribute('target');
                            }
                            link.style.color = '#60a5fa'; // text-blue-400
                            link.style.textDecoration = 'underline';
                            link.style.wordBreak = 'break-all';
                            link.style.cursor = 'pointer';
                            
                            // Add click handler
                            link.addEventListener('click', (e) => {
                              e.stopPropagation();
                              if (opensInNewTab) {
                                window.open(link.href, '_blank', 'noopener,noreferrer');
                              } else {
                                window.location.href = link.href;
                              }
                            });
                            
                            link.addEventListener('mousedown', (e) => {
                              e.stopPropagation();
                            });
                          });
                          
                          return (
                            <span 
                              dangerouslySetInnerHTML={{ __html: tempDiv.innerHTML }}
                              className="select-text"
                            />
                          );
                        };

                        return (
                          <div key={comment.id} className={`mb-3 ${index > 0 ? 'pt-2 border-t border-gray-600' : ''}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: author?.color || '#6B7280' }} 
                              />
                              <span className="font-medium text-gray-200">{author?.name || 'Unknown'}</span>
                              <span className="text-gray-400 text-xs">
                                {formatDateTime(comment.createdAt)}
                              </span>
                              {comment.attachments && comment.attachments.length > 0 && (
                                <Paperclip size={12} className="text-gray-400" title={`${comment.attachments.length} attachment(s)`} />
                              )}
                            </div>
                            <div className="text-gray-300 text-xs leading-relaxed select-text">
                              {renderCommentHTML(comment.text)}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                      
                      {/* Sticky footer */}
                      <div className="border-t border-gray-600 p-3 bg-gray-800 rounded-b-md flex items-center justify-between">
                        <span className="text-gray-300 font-medium">
                          {t('taskCard.comments', { count: validComments.length })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(task, { scrollToComments: true });
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          {t('taskCard.open')}
                        </button>
                      </div>
        </div>,
        document.body
      )}

      {/* Tag Removal Confirmation Menu - Portal */}
      {showTagRemovalMenu && selectedTagForRemoval && createPortal(
        <div 
          ref={tagRemovalMenuRef}
          className="fixed w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] p-3"
          style={{ 
            left: `${tagRemovalPosition.left}px`, 
            top: `${tagRemovalPosition.top}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm font-medium text-gray-800 mb-2">
            {t('taskCard.removeTag')}
                    </div>
          <div className="text-xs text-gray-600 mb-3">
            {t('taskCard.removeTagConfirm', { tag: selectedTagForRemoval.tag })}
              </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmTagRemoval}
              className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
            >
              {t('taskCard.remove')}
            </button>
                    <button
              onClick={handleCancelTagRemoval}
              className="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded transition-colors"
            >
              {t('taskCard.cancel')}
                    </button>
              </div>
        </div>,
        document.body
      )}

      {/* Portal-rendered Sprint Selector Dropdown */}
      {showSprintSelector && sprintSelectorCoords && createPortal(
        <div
          ref={sprintSelectorRef}
          className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-[9999]"
          style={{
            left: `${sprintSelectorCoords.left}px`,
            top: `${sprintSelectorCoords.top}px`,
            width: '256px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2">
            <input
              type="text"
              value={sprintSearchTerm}
              onChange={(e) => setSprintSearchTerm(e.target.value)}
              onKeyDown={handleSprintKeyDown}
              placeholder={t('taskCard.searchSprints')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
          
          <div className="max-h-60 overflow-y-auto">
            {sprintsLoading ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {t('taskCard.loadingSprints')}
              </div>
            ) : (
              <>
                {/* "None (Backlog)" option */}
                {'backlog'.includes(sprintSearchTerm.toLowerCase()) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSprintSelect(null);
                    }}
                    onMouseEnter={() => setHighlightedSprintIndex(-1)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-600 ${
                      highlightedSprintIndex === -1
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {t('taskCard.noneBacklog')}
                      </div>
                      <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-400 dark:bg-gray-600 text-white">
                        {t('taskCard.unassigned')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('taskCard.removeFromSprint')}
                    </div>
                  </button>
                )}
                
                {sprints.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {t('taskCard.noSprintsAvailable')}
                  </div>
                ) : (
                  sprints
                    .filter(sprint =>
                      sprint.name.toLowerCase().includes(sprintSearchTerm.toLowerCase())
                    )
                    .map((sprint, index) => (
                      <button
                        key={sprint.id}
                        ref={(el) => (sprintOptionRefs.current[index] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSprintSelect(sprint);
                        }}
                        onMouseEnter={() => setHighlightedSprintIndex(index)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                          highlightedSprintIndex === index
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : sprint.is_active === 1 || sprint.is_active === true
                            ? 'bg-green-50 dark:bg-green-900/10'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {sprint.name}
                          </div>
                          {(sprint.is_active === 1 || sprint.is_active === true) && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-500 text-white">
                              {t('taskCard.active')}
                            </span>
                          )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatDate(sprint.start_date)} → {formatDate(sprint.end_date)}
                    </div>
                  </button>
                ))
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Date Range Picker */}
      {showDateRangePicker && dateRangePickerPosition && (
        <DateRangePicker
          startDate={task.startDate || ''}
          endDate={task.dueDate}
          onDateChange={handleDateRangeChange}
          onClose={handleDateRangePickerClose}
          position={dateRangePickerPosition}
          sprint={task.sprintId && sprints.length > 0 ? sprints.find(s => s.id === task.sprintId) : null}
        />
      )}

      {/* Date Validation Tooltip */}
      {(showStartDateTooltip || showDueDateTooltip) && dateTooltipPosition && createPortal(
        <div
          ref={dateTooltipRef}
          className="fixed bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg z-[10000] pointer-events-none whitespace-nowrap"
          style={{
            left: `${dateTooltipPosition.left}px`,
            top: `${dateTooltipPosition.top}px`,
            transform: 'translate(-50%, -100%)',
            marginBottom: '4px'
          }}
        >
          {showStartDateTooltip && dateValidation.startDateError}
          {showDueDateTooltip && dateValidation.dueDateError}
          <div 
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-600"
          />
        </div>,
        document.body
      )}
    </>
  );
});

export default TaskCard;
