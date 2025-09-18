import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock, MessageCircle, Calendar, Paperclip, Link } from 'lucide-react';
import { Task, TeamMember, Priority, PriorityOption, CurrentUser, Tag } from '../types';
import { TaskViewMode } from '../utils/userPreferences';
import QuickEditModal from './QuickEditModal';
import TaskCardToolbar from './TaskCardToolbar';
import AddCommentModal from './AddCommentModal';
import { formatToYYYYMMDD, formatToYYYYMMDDHHmmss } from '../utils/dateUtils';
import { createComment, fetchTaskAttachments } from '../api';
import { generateTaskUrl } from '../utils/routingUtils';
import { generateUUID } from '../utils/uuid';
import { mergeTaskTagsWithLiveData, getTagDisplayStyle } from '../utils/tagUtils';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
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
  onSelect: (task: Task, options?: { scrollToComments?: boolean }) => void;
  isDragDisabled?: boolean;
  taskViewMode?: TaskViewMode;
  availablePriorities?: PriorityOption[];
  selectedTask?: Task | null;
  availableTags?: Tag[];
  siteSettings?: { [key: string]: string };
  columnIsFinished?: boolean;
  onTagAdd?: (tagId: string) => void;
  onTagRemove?: (tagId: string) => void;
  boards?: any[]; // To get project identifier from board
  
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
}



export default function TaskCard({
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
  boards,
  
  // Task linking props
  isLinkingMode,
  linkingSourceTask,
  onStartLinking,
  onFinishLinking,
  
  // Hover highlighting props
  hoveredLinkTask,
  onLinkToolHover,
  onLinkToolHoverEnd,
  getTaskRelationshipType
}: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [showCommentTooltip, setShowCommentTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  const [showTagRemovalMenu, setShowTagRemovalMenu] = useState(false);
  const [selectedTagForRemoval, setSelectedTagForRemoval] = useState<Tag | null>(null);
  const [tagRemovalPosition, setTagRemovalPosition] = useState<{left: number, top: number}>({left: 0, top: 0});
  
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
      if (!task.description?.includes('img-')) {
        setAttachmentsLoaded(true);
        return; // Only fetch if description has images
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
  }, [task.id, task.description]);

  // Fix blob URLs in task description - using EXACT same logic as comments
  const fixImageUrls = (htmlContent: string, attachments: any[]) => {
    let fixedContent = htmlContent;
    attachments.forEach(attachment => {
      if (attachment.name.startsWith('img-')) {
        // Replace blob URLs with server URLs
        const blobPattern = new RegExp(`blob:[^"]*#${attachment.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        fixedContent = fixedContent.replace(blobPattern, attachment.url);
      }
    });
    return fixedContent;
  };

  const getFixedDescription = () => {
    if (!task.description) return task.description;
    
    // If attachments are still loading and we have images, show original content for now
    if (!attachmentsLoaded && task.description.includes('img-')) {
      return task.description;
    }
    
    // Use the exact same function as comments
    const fixedContent = fixImageUrls(task.description, taskAttachments);
    
    
    return fixedContent;
  };
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [isEditingEffort, setIsEditingEffort] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showPrioritySelect, setShowPrioritySelect] = useState(false);
  const [editedDate, setEditedDate] = useState(task.startDate);
  const [editedDueDate, setEditedDueDate] = useState(task.dueDate || '');
  const [editedEffort, setEditedEffort] = useState(task.effort);
  const [editedDescription, setEditedDescription] = useState(task.description);
  const [showAllTags, setShowAllTags] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('below');
  const [showAddCommentModal, setShowAddCommentModal] = useState(false);
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const commentTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentTooltipShowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commentContainerRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);
  const tagRemovalMenuRef = useRef<HTMLDivElement>(null);

  // Check if any editing is active to disable drag
  const isAnyEditingActive = isEditingTitle || isEditingDate || isEditingDueDate || isEditingEffort || isEditingDescription || showQuickEdit || showMemberSelect || showPrioritySelect || showCommentTooltip || showTagRemovalMenu;

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
    listeners,
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

  // Helper function to parse date string as local date (avoiding timezone issues)
  const parseLocalDate = (dateString: string): Date => {
    if (!dateString) return new Date();
    
    // Handle both YYYY-MM-DD and full datetime strings
    const dateOnly = dateString.split('T')[0]; // Get just the date part
    const [year, month, day] = dateOnly.split('-').map(Number);
    
    // Create date in local timezone
    return new Date(year, month - 1, day); // month is 0-indexed
  };

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

  useEffect(() => {
    const handleClickOutside = (_event: MouseEvent) => {
      if (showMemberSelect) {
        setShowMemberSelect(false);
      }
      if (showPrioritySelect) {
        setShowPrioritySelect(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMemberSelect, showPrioritySelect]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (commentTooltipTimeoutRef.current) {
        clearTimeout(commentTooltipTimeoutRef.current);
      }
      if (commentTooltipShowTimeoutRef.current) {
        clearTimeout(commentTooltipShowTimeoutRef.current);
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
  const [clickPositionDescription, setClickPositionDescription] = useState<{x: number, y: number} | null>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleDescriptionInputFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (clickPositionDescription !== null) {
      const textarea = e.target;
      const { x: clickX, y: clickY } = clickPositionDescription;
      
      // Create a temporary div to measure text layout (better for multi-line)
      const tempDiv = document.createElement('div');
      const computedStyle = window.getComputedStyle(textarea);
      tempDiv.style.font = computedStyle.font;
      tempDiv.style.fontSize = computedStyle.fontSize;
      tempDiv.style.fontFamily = computedStyle.fontFamily;
      tempDiv.style.lineHeight = computedStyle.lineHeight;
      tempDiv.style.padding = computedStyle.padding;
      tempDiv.style.border = computedStyle.border;
      tempDiv.style.width = computedStyle.width;
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.position = 'absolute';
      tempDiv.style.whiteSpace = 'pre-wrap';
      tempDiv.style.wordWrap = 'break-word';
      document.body.appendChild(tempDiv);
      
      const description = task.description || '';
      
      // Always use the full text for cursor positioning when editing
      // The click coordinates are based on the display, but we want to edit the full text
      const displayedText = description;
      
      // Create a div that matches the textarea's wrapping behavior to find visual lines
      const tempDiv2 = document.createElement('div');
      tempDiv2.style.font = computedStyle.font;
      tempDiv2.style.fontSize = computedStyle.fontSize;
      tempDiv2.style.fontFamily = computedStyle.fontFamily;
      tempDiv2.style.width = computedStyle.width;
      tempDiv2.style.whiteSpace = 'pre-wrap';
      tempDiv2.style.wordWrap = 'break-word';
      tempDiv2.style.visibility = 'hidden';
      tempDiv2.style.position = 'absolute';
      tempDiv2.style.lineHeight = computedStyle.lineHeight;
      tempDiv2.style.padding = computedStyle.padding;
      document.body.appendChild(tempDiv2);
      
      // Find the character position by testing each character and seeing where it wraps
      let cursorPosition = 0;
      let bestDistance = Infinity;
      
      // Test each character position to find the closest one to the click
      for (let i = 0; i <= displayedText.length; i++) {
        tempDiv2.textContent = displayedText.substring(0, i);
        
        // Get the position of the last character
        if (i > 0) {
          const range = document.createRange();
          const textNode = tempDiv2.firstChild;
          if (textNode) {
            // Set range to the last character
            const charIndex = Math.min(i - 1, textNode.textContent?.length || 0);
            range.setStart(textNode, charIndex);
            range.setEnd(textNode, Math.min(i, textNode.textContent?.length || 0));
            
            const rect = range.getBoundingClientRect();
            const divRect = tempDiv2.getBoundingClientRect();
            
            // Calculate position relative to the div
            const charX = rect.left - divRect.left;
            const charY = rect.top - divRect.top;
            
            // Calculate distance from click point
            const distance = Math.sqrt(Math.pow(clickX - charX, 2) + Math.pow(clickY - charY, 2));
            
            if (distance < bestDistance) {
              bestDistance = distance;
              cursorPosition = i;
            }
          }
        }
      }
      
      document.body.removeChild(tempDiv2);
      
      document.body.removeChild(tempDiv);
      
      // Set cursor position after a brief delay to ensure it works
      setTimeout(() => {
        const textareaElement = descriptionTextareaRef.current;
        if (textareaElement) {
          // Make sure cursor position is within bounds
          const maxPosition = textareaElement.value.length;
          const safeCursorPosition = Math.min(cursorPosition, maxPosition);
          
          
          textareaElement.setSelectionRange(safeCursorPosition, safeCursorPosition);
          textareaElement.focus(); // Ensure focus is maintained
        }
      }, 10); // Slightly longer delay
      
      // Clear the click position
      setClickPositionDescription(null);
    }
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

  const handleDateSave = () => {
    if (editedDate !== task.startDate) {
      onEdit({ ...task, startDate: editedDate });
    }
    setIsEditingDate(false);
  };

  const handleDateCancel = () => {
    setEditedDate(task.startDate);
    setIsEditingDate(false);
  };

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDateSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDateCancel();
    }
  };

  const handleDueDateSave = () => {
    if (editedDueDate !== (task.dueDate || '')) {
      onEdit({ ...task, dueDate: editedDueDate || undefined });
    }
    setIsEditingDueDate(false);
  };

  const handleDueDateCancel = () => {
    setEditedDueDate(task.dueDate || '');
    setIsEditingDueDate(false);
  };

  const handleDueDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDueDateSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDueDateCancel();
    }
  };

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

  const handleDescriptionSave = () => {
    if (editedDescription !== task.description) {
      onEdit({ ...task, description: editedDescription });
    }
    setIsEditingDescription(false);
  };

  const handleDescriptionCancel = () => {
    setEditedDescription(task.description);
    setIsEditingDescription(false);
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDescriptionSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDescriptionCancel();
    }
  };

  const handlePriorityChange = (priority: Priority) => {
    onEdit({ ...task, priority });
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
    
    // Wait 1 second before showing tooltip
    commentTooltipShowTimeoutRef.current = setTimeout(() => {
      // Calculate best position for tooltip
      const position = calculateTooltipPosition();
      setTooltipPosition(position);
      setShowCommentTooltip(true);
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
      setShowCommentTooltip(false);
    }, 500); // Generous delay
  };

  const calculateDropdownPosition = () => {
    if (priorityButtonRef.current) {
      const rect = priorityButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      return spaceBelow < 150 ? 'above' : 'below';
    }
    return 'below';
  };

  const calculateTooltipPosition = () => {
    if (commentContainerRef.current) {
      const commentRect = commentContainerRef.current.getBoundingClientRect();
      const tooltipWidth = 320; // w-80 = 320px
      const tooltipHeight = 256; // max-h-64 = 256px
      
      // Calculate vertical position
      const spaceAbove = commentRect.top;
      const spaceBelow = window.innerHeight - commentRect.bottom;
      const preferAbove = spaceAbove >= tooltipHeight;
      
      // Calculate horizontal position - center tooltip on the comment icon
      let left = commentRect.left + (commentRect.width / 2) - (tooltipWidth / 2);
      
      // Keep tooltip within viewport bounds
      const spaceRight = window.innerWidth - (left + tooltipWidth);
      if (spaceRight < 20) {
        left = window.innerWidth - tooltipWidth - 20; // 20px padding from edge
      }
      if (left < 20) {
        left = 20;
      }
      
      // Position tooltip above or below the comment icon
      let top;
      if (preferAbove) {
        top = commentRect.top - tooltipHeight - 10; // 10px gap above
      } else {
        top = commentRect.bottom + 10; // 10px gap below
      }
      
      return { left, top };
    }
    return { left: 0, top: 0 };
  };

  useEffect(() => {
    const handleClickOutside = (_event: MouseEvent) => {
      if (showMemberSelect) {
        setShowMemberSelect(false);
      }
      if (showPrioritySelect) {
        setShowPrioritySelect(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMemberSelect, showPrioritySelect]);

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

  // Get the card's background color to match the task identifier
  const getCardBackgroundColor = () => {
    if (isSelected) return 'bg-gray-100';
    if (member.id === SYSTEM_MEMBER_ID) return 'bg-yellow-50';
    // Overdue highlighting is now handled by the LATE banner overlay
    return 'bg-white';
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ ...style, borderLeft: `4px solid ${member.color}` }}
        className={`task-card sortable-item ${
          isSelected ? 'bg-gray-100' : 
          member.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50' : 
          'bg-white'
        } p-4 rounded-lg shadow-sm cursor-default relative transition-all duration-200 ${
          isDragging ? 'opacity-90 scale-105 shadow-2xl rotate-2 ring-2 ring-blue-400' : 'hover:shadow-md'
        } ${
          isLinkingMode && linkingSourceTask?.id !== task.id 
            ? 'hover:ring-2 hover:ring-blue-300 hover:bg-blue-50' 
            : ''
        } ${
          isLinkingMode && linkingSourceTask?.id === task.id 
            ? 'ring-2 ring-blue-500 bg-blue-100' 
            : ''
        } ${
          // Highlight related tasks when hovering over link tool
          hoveredLinkTask && getTaskRelationshipType && hoveredLinkTask.id !== task.id ? (() => {
            const relationshipType = getTaskRelationshipType(task.id);
            if (relationshipType === 'parent') {
              return 'ring-2 ring-green-400 bg-green-50 shadow-lg';
            } else if (relationshipType === 'child') {
              return 'ring-2 ring-purple-400 bg-purple-50 shadow-lg';
            } else if (relationshipType === 'related') {
              return 'ring-2 ring-yellow-400 bg-yellow-50 shadow-lg';
            }
            return '';
          })() : ''
        }`}
        {...attributes}
        onMouseUp={isLinkingMode ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onFinishLinking) {
            if (linkingSourceTask?.id !== task.id) {
              // Different task - create relationship
              onFinishLinking(task);
            } else {
              // Same task - cancel linking
              console.log('🔗 Released on same task - canceling linking');
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
              className={`${getCardBackgroundColor()} px-1.5 py-0.8 text-gray-600 font-mono font-bold hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 cursor-pointer`}
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
              title={`Direct link to ${task.ticket}`}
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
          
          // Task linking props
          isLinkingMode={isLinkingMode}
          linkingSourceTask={linkingSourceTask}
          onStartLinking={onStartLinking}
          
          // Hover highlighting props
          hoveredLinkTask={hoveredLinkTask}
          onLinkToolHover={onLinkToolHover}
          onLinkToolHoverEnd={onLinkToolHoverEnd}
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
              className="font-medium text-gray-800 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-full text-sm"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <h3 
              className="font-medium text-gray-800 cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-sm pr-12"
              onClick={handleTitleClick}
              title="Click to edit"
            >
              {task.title}
            </h3>
          )}
        </div>

        {/* Description Section */}
        {taskViewMode !== 'compact' && (
          <>
            {isEditingDescription ? (
              <div className="-mt-2 mb-3" onClick={(e) => e.stopPropagation()}>
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
                  placeholder="Enter task description..."
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
                  <span>Press Enter to save (or add list items), Shift+Enter for new line, Escape to cancel, or click outside to save</span>
                </div>
              </div>
            ) : (
              <div
                className={`task-card-description text-sm text-gray-600 -mt-2 mb-3 cursor-text hover:bg-gray-50 px-2 py-1 rounded transition-colors min-h-[2.5rem] prose prose-sm max-w-none ${
                  taskViewMode === 'shrink' ? 'line-clamp-2 overflow-hidden' : ''
                }`}
                onClick={handleDescriptionClick}
                title={taskViewMode === 'shrink' && task.description ? task.description.replace(/<[^>]*>/g, '') : "Click to edit description"}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(getFixedDescription() || '')
                }}
                style={{
                  // Ensure images fit nicely in task cards
                  '--tw-prose-body': '1rem',
                  '--tw-prose-headings': '1rem',
                } as React.CSSProperties}
              />
            )}
          </>
        )}

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
                    title="Click to remove tag"
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
            {/* Dates - ultra compact */}
            <div className="flex items-center gap-0.5">
              <Calendar size={12} />
              <div className="text-xs leading-none font-mono">
                {/* Start Date */}
                {isEditingDate ? (
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    onBlur={handleDateSave}
                    onKeyDown={handleDateKeyDown}
                    className="text-[10px] bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-[100px] font-mono"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingDate(true);
                    }}
                    className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer"
                    title="Click to change start date"
                  >
                    {formatDate(task.startDate)}
                  </div>
                )}
                
                {/* Due Date - directly underneath with zero spacing */}
                {(task.dueDate || isEditingDueDate) && (
                  <>
                    {isEditingDueDate ? (
                      <input
                        type="date"
                        value={editedDueDate}
                        onChange={(e) => setEditedDueDate(e.target.value)}
                        onBlur={handleDueDateSave}
                        onKeyDown={handleDueDateKeyDown}
                        className="text-[10px] bg-white border border-blue-400 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-[100px] block font-mono"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingDueDate(true);
                        }}
                        className="hover:bg-gray-100 rounded px-0.5 py-0.5 transition-colors cursor-pointer font-bold"
                        title="Click to change due date"
                      >
                        {formatDate(task.dueDate || '')}
                      </div>
                    )}
                  </>
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
                  title="Click to change effort"
                >
                  {task.effort}h
                </button>
              )}
            </div>

            {/* Comments - squeezed close to effort */}
            {validComments.length > 0 && (
              <div 
                ref={commentContainerRef}
                className="relative"
                onMouseEnter={handleCommentTooltipShow}
                onMouseLeave={handleCommentTooltipHide}
              >
                <div
                  className="flex items-center gap-0.5 rounded px-1 py-1"
                  title="Hover to view comments"
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
            {/* Attachments indicator */}
            {task.attachmentCount && task.attachmentCount > 0 && (
              <div className="flex items-center gap-0.5 text-gray-500" title={`${task.attachmentCount} attachment${task.attachmentCount > 1 ? 's' : ''}`}>
                <Paperclip size={12} />
                <span className="text-xs">{task.attachmentCount}</span>
              </div>
            )}

            {/* Priority */}
            <div className="relative priority-container">
              <button
              ref={priorityButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowPrioritySelect(!showPrioritySelect);
                if (!showPrioritySelect) {
                  setDropdownPosition(calculateDropdownPosition());
                }
              }}
              className={`px-2 py-1 rounded-full text-xs cursor-pointer hover:opacity-80 transition-all ${showPrioritySelect ? 'ring-2 ring-blue-400' : ''}`}
              style={(() => {
                const priorityOption = availablePriorities.find(p => p.priority === task.priority);
                return priorityOption ? getPriorityColors(priorityOption.color) : { backgroundColor: '#f3f4f6', color: '#6b7280' };
              })()}
              title="Click to change priority"
            >
              {task.priority}
            </button>
            
            {/* Completed Column Banner Overlay - positioned over priority */}
            {columnIsFinished && (
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
                    DONE
                  </div>
                </div>
              </div>
            )}
            
            {/* Overdue Task Banner Overlay - positioned over priority */}
            {!columnIsFinished && isOverdue() && siteSettings?.HIGHLIGHT_OVERDUE_TASKS === 'true' && (
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
                    LATE
                  </div>
                </div>
              </div>
            )}

            {showPrioritySelect && (
              <div 
                className={`absolute left-0 w-24 bg-white rounded-md shadow-lg z-[100] border border-gray-200 ${
                  dropdownPosition === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}
              >
                {availablePriorities
                  .filter(priorityOption => priorityOption.priority !== task.priority)
                  .map(priorityOption => (
                    <button
                      key={priorityOption.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePriorityChange(priorityOption.priority);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                    >
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: priorityOption.color }}
                      />
                      {priorityOption.priority}
                    </button>
                  ))}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>



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
                          // First, fix blob URLs by replacing them with server URLs (matching TaskDetails/TaskPage)
                          let fixedContent = htmlText;
                          const blobPattern = /blob:[^"]*#(img-[^"]*)/g;
                          fixedContent = fixedContent.replace(blobPattern, (_match, filename) => {
                            // Convert blob URL to server URL
                            return `/uploads/${filename}`;
                          });
                          
                          // Create a temporary div to parse the HTML
                          const tempDiv = document.createElement('div');
                          tempDiv.innerHTML = fixedContent;
                          
                          // Find all links and update their attributes for safety
                          const links = tempDiv.querySelectorAll('a');
                          links.forEach(link => {
                            link.setAttribute('target', '_blank');
                            link.setAttribute('rel', 'noopener noreferrer');
                            link.style.color = '#60a5fa'; // text-blue-400
                            link.style.textDecoration = 'underline';
                            link.style.wordBreak = 'break-all';
                            link.style.cursor = 'pointer';
                            
                            // Add click handler
                            link.addEventListener('click', (e) => {
                              e.stopPropagation();
                              window.open(link.href, '_blank', 'noopener,noreferrer');
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
                          Comments ({validComments.length})
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(task, { scrollToComments: true });
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          Open
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
            Remove Tag
                    </div>
          <div className="text-xs text-gray-600 mb-3">
            Remove "{selectedTagForRemoval.tag}" from this task?
              </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmTagRemoval}
              className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
            >
              Remove
            </button>
                    <button
              onClick={handleCancelTagRemoval}
              className="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded transition-colors"
            >
              Cancel
                    </button>
              </div>
        </div>,
        document.body
      )}
    </>
  );
}
