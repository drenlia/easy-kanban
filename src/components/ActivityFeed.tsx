import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, Clock, ChevronDown, ChevronUp, GripVertical, Search } from 'lucide-react';
import { updateActivityFeedPreference } from '../utils/userPreferences';
import DOMPurify from 'dompurify';

interface ActivityItem {
  id: number;
  action: string;
  details: string;
  created_at: string;
  member_name: string;
  role_name: string;
  board_title: string;
  column_title: string;
  taskId: string;
}

interface ActivityFeedProps {
  isVisible: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  activities?: ActivityItem[];
  lastSeenActivityId?: number;
  clearActivityId?: number;
  onMarkAsRead?: (activityId: number) => void;
  onClearAll?: (activityId: number) => void;
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  dimensions?: { width: number; height: number };
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
  userId?: string | null;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ 
  isVisible, 
  onClose, 
  isMinimized: initialIsMinimized = false,
  onMinimizedChange,
  activities = [],
  lastSeenActivityId = 0,
  clearActivityId = 0,
  onMarkAsRead,
  onClearAll,
  position = { x: window.innerWidth - 220, y: 66 },
  onPositionChange,
  dimensions = { width: 208, height: 400 },
  onDimensionsChange,
  userId = null
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(initialIsMinimized);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{top: number, left: number} | null>(null);
  const [showMinimizeDropdown, setShowMinimizeDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState<'width' | 'height' | 'height-top' | 'both' | 'both-top' | null>(null);
  const [resizeOffset, setResizeOffset] = useState({ x: 0, y: 0 });
  const currentDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const currentDragDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  
  // Filter state
  const [filterText, setFilterText] = useState('');

  // Sync with prop changes
  useEffect(() => {
    setIsMinimized(initialIsMinimized);
  }, [initialIsMinimized]);

  // Load saved filter preference on mount
  useEffect(() => {
    const loadFilterPreference = async () => {
      if (userId) {
        try {
          // Import the loadUserPreferences function to access saved filter
          const { loadUserPreferences } = await import('../utils/userPreferences');
          const userPrefs = loadUserPreferences(userId);
          if (userPrefs.activityFeed.filterText) {
            setFilterText(userPrefs.activityFeed.filterText);
          }
        } catch (error) {
          console.error('Failed to load activity filter preference:', error);
        }
      }
    };

    loadFilterPreference();
  }, [userId]);

  // Utility function to ensure ActivityFeed stays within viewport and above dev tools
  const constrainToViewport = (pos: { x: number; y: number }, dims: { width: number; height: number }) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Add margin from edges to ensure visibility
    const margin = 10;
    
    // Constrain X position
    const constrainedX = Math.max(margin, Math.min(viewportWidth - dims.width - margin, pos.x));
    
    // Constrain Y position - be more aggressive about keeping it visible
    // If dev tools are open (detected by reduced viewport height), adjust accordingly
    const minY = 66; // Header height + margin
    const maxY = viewportHeight - dims.height - margin;
    const constrainedY = Math.max(minY, Math.min(maxY, pos.y));
    
    return { x: constrainedX, y: constrainedY };
  };

  // Ensure ActivityFeed stays visible when viewport changes (dev tools open/close)
  useEffect(() => {
    const handleResize = () => {
      const currentDims = isMinimized ? { width: dimensions.width, height: 60 } : dimensions;
      const constrainedPosition = constrainToViewport(position, currentDims);
      
      // Only update if position actually changed to avoid infinite loops
      if (constrainedPosition.x !== position.x || constrainedPosition.y !== position.y) {
        onPositionChange?.(constrainedPosition);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, dimensions, isMinimized, onPositionChange]);

  // Handle minimize/expand with user setting persistence
  const handleMinimizeInPlace = async () => {
    await handleMinimizedChange(true, false);
  };

  const handleMinimizeToBottom = async () => {
    // Move to bottom of viewport first
    const bottomPosition = {
      x: position.x,
      y: window.innerHeight - 80 // 60px height + 20px margin
    };
    
    onPositionChange?.(bottomPosition);
    
    // Save the new position
    try {
      await updateActivityFeedPreference('position', bottomPosition, userId);
    } catch (error) {
      console.error('Failed to save bottom position:', error);
    }
    
    // Then minimize
    await handleMinimizedChange(true, true);
  };

  const handleMinimizedChange = async (minimized: boolean, isBottomMinimize: boolean = false) => {
    setIsMinimized(minimized);
    onMinimizedChange?.(minimized);
    
    // When maximizing, check if the expanded height would go off-screen
    if (!minimized) {
      const currentY = position.y;
      const expandedHeight = dimensions.height;
      const viewportHeight = window.innerHeight;
      
      // If the bottom of the expanded feed would be off-screen, move it up
      if (currentY + expandedHeight > viewportHeight - 20) {
        const newY = Math.max(66, viewportHeight - expandedHeight - 20); // 66 is header height + gap
        const adjustedPosition = { x: position.x, y: newY };
        
        console.log(`Adjusting position on maximize: ${currentY} -> ${newY} (height: ${expandedHeight})`);
        onPositionChange?.(adjustedPosition);
        
        // Save the adjusted position
        try {
          await updateActivityFeedPreference('position', adjustedPosition, userId);
        } catch (error) {
          console.error('Failed to save adjusted position:', error);
        }
      }
    }
    
    // Save minimized state to user preferences (unified system)
    try {
      await updateActivityFeedPreference('isMinimized', minimized, userId);
    } catch (error) {
      console.error('Failed to save activity feed minimized state:', error);
    }
  };

  // Calculate smart tooltip position to stay within viewport
  const calculateTooltipPosition = (rect: DOMRect): {top: number, left: number} => {
    const tooltipWidth = 320; // Approximate tooltip width (max-w-sm = 384px, but content is smaller)
    const tooltipHeight = 120; // Approximate tooltip height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8; // Margin from viewport edges
    
    // Default: centered above the element
    let tooltipX = rect.left + rect.width / 2 - tooltipWidth / 2;
    let tooltipY = rect.top - tooltipHeight - 10; // 10px gap above
    
    // Check horizontal boundaries
    if (tooltipX < margin) {
      // Too far left, align to left edge with margin
      tooltipX = margin;
    } else if (tooltipX + tooltipWidth > viewportWidth - margin) {
      // Too far right, align to right edge with margin
      tooltipX = viewportWidth - tooltipWidth - margin;
    }
    
    // Check vertical boundaries
    if (tooltipY < margin) {
      // Too close to top, position below instead
      tooltipY = rect.bottom + 10; // 10px gap below
    }
    
    // Double-check if positioning below would go off bottom
    if (tooltipY + tooltipHeight > viewportHeight - margin) {
      // Position at the best available spot
      tooltipY = Math.max(margin, viewportHeight - tooltipHeight - margin);
    }
    
    return {
      top: tooltipY,
      left: tooltipX
    };
  };

  // Tooltip handlers
  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const smartPosition = calculateTooltipPosition(rect);
    setTooltipPosition(smartPosition);
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
    setTooltipPosition(null);
  };

  // Drag functionality
  const handleDragStart = (e: React.MouseEvent) => {
    if (!feedRef.current) return;
    
    const rect = feedRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    
    // Prevent text selection
    e.preventDefault();
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Constrain to viewport using the new utility function
    const feedDims = isMinimized ? { width: dimensions.width, height: 60 } : dimensions;
    const newPosition = constrainToViewport({ x: newX, y: newY }, feedDims);
    currentDragPositionRef.current = newPosition;
    onPositionChange?.(newPosition);
  };

  const handleDragEnd = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Use the position that was actually set during dragging
    const positionToSave = currentDragPositionRef.current || position;
    
    // Save current position to user preferences (unified system)
    try {
      await updateActivityFeedPreference('position', positionToSave, userId);
    } catch (error) {
      console.error('Failed to save activity feed position:', error);
    }
    
    // Clear the drag position
    currentDragPositionRef.current = null;
  };

  // Resize functionality
  const handleResizeStart = (e: React.MouseEvent, resizeType: 'width' | 'height' | 'height-top' | 'both' | 'both-top') => {
    if (!feedRef.current) return;
    
    const rect = feedRef.current.getBoundingClientRect();
    setResizeOffset({
      x: e.clientX - rect.right, // Distance from right edge
      y: e.clientY - rect.bottom  // Distance from bottom edge
    });
    setIsResizing(resizeType);
    
    // Prevent text selection
    e.preventDefault();
    e.stopPropagation(); // Prevent drag from starting
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing || !feedRef.current) return;
    
    const rect = feedRef.current.getBoundingClientRect();
    let newWidth = dimensions.width;
    let newHeight = dimensions.height;
    let newPosition = position;
    
    // Calculate new dimensions based on resize type
    if (isResizing === 'width' || isResizing === 'both' || isResizing === 'both-top') {
      // Allow much smaller widths with more flexible constraints
      newWidth = Math.max(120, Math.min(600, e.clientX - rect.left));
    }
    
    if (isResizing === 'height' || isResizing === 'both') {
      // Resize from bottom - normal behavior
      newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, e.clientY - rect.top));
    }
    
    if (isResizing === 'height-top' || isResizing === 'both-top') {
      // Resize from top - adjust both height and position
      const deltaY = e.clientY - rect.top;
      const proposedHeight = dimensions.height - deltaY;
      const constrainedHeight = Math.max(200, Math.min(window.innerHeight * 0.8, proposedHeight));
      
      // Only move position if we're not hitting the minimum height constraint
      if (proposedHeight >= 200) {
        newPosition = {
          x: position.x,
          y: Math.max(66, position.y + (dimensions.height - constrainedHeight)) // Don't go above header
        };
      }
      
      newHeight = constrainedHeight;
    }
    
    const newDimensions = { width: newWidth, height: newHeight };
    currentDragDimensionsRef.current = newDimensions;
    onDimensionsChange?.(newDimensions);
    
    // Update position if resizing from top
    if ((isResizing === 'height-top' || isResizing === 'both-top') && newPosition !== position) {
      currentDragPositionRef.current = newPosition;
      onPositionChange?.(newPosition);
    }
  };

  const handleResizeEnd = async () => {
    if (!isResizing) return;
    setIsResizing(null);
    
    // Use the dimensions that were actually set during resizing
    const dimensionsToSave = currentDragDimensionsRef.current || dimensions;
    const positionToSave = currentDragPositionRef.current || position;
    
    // Save current dimensions to user preferences
    try {
      await updateActivityFeedPreference('width', dimensionsToSave.width, userId);
      await updateActivityFeedPreference('height', dimensionsToSave.height, userId);
      
      // Save position if it was changed (for top resize)
      if (currentDragPositionRef.current) {
        await updateActivityFeedPreference('position', positionToSave, userId);
      }
    } catch (error) {
      console.error('Failed to save activity feed dimensions/position:', error);
    }
    
    // Clear the resize dimensions and position
    currentDragDimensionsRef.current = null;
    currentDragPositionRef.current = null;
  };

  // Add global mouse event listeners for dragging and resizing
  useEffect(() => {
    if (isDragging) {
      const handleMove = (e: MouseEvent) => handleDragMove(e);
      const handleEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };
    }
  }, [isDragging]);

  useEffect(() => {
    if (isResizing) {
      const handleMove = (e: MouseEvent) => handleResizeMove(e);
      const handleEnd = () => handleResizeEnd();
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };
    }
  }, [isResizing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMinimizeDropdown) {
        const target = event.target as Element;
        // Check if click is not on the button or dropdown
        const isClickOnButton = target.closest('.minimize-dropdown');
        const isClickOnDropdown = target.closest('[data-minimize-dropdown]');
        
        if (!isClickOnButton && !isClickOnDropdown) {
          setShowMinimizeDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMinimizeDropdown]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    
    // Debug logging (can remove later)
    if (isNaN(activityTime.getTime())) {
      console.warn('Invalid timestamp:', timestamp);
      return 'unknown time';
    }
    
    const diffMs = now.getTime() - activityTime.getTime();
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return activityTime.toLocaleDateString();
  };

  const formatActivityDescription = (activity: ActivityItem) => {
    const { member_name, details, board_title } = activity;
    const name = member_name || 'Unknown User';
    
    // Extract the main action from details
    let description = details;
    
    // Add board context if available
    if (board_title && !description.includes('board')) {
      description += ` in ${board_title}`;
    }

    // Simple identifier formatting without clickable links
    // This could be enhanced later with proper routing functions
    description = description.replace(/\(([^)]+)\)$/, (_match, identifiers) => {
      return `(${identifiers})`;
    });

    return { name, description };
  };

  const getActionIcon = (action: string) => {
    if (action.includes('create')) return '➕';
    if (action.includes('update') || action.includes('move')) return '✏️';
    if (action.includes('delete')) return '🗑️';
    if (action.includes('tag')) return '🏷️';
    return '📝';
  };

  // Filter activities based on text input
  const filterActivities = (activities: ActivityItem[], filterText: string): ActivityItem[] => {
    if (!filterText.trim()) return activities;
    
    const searchTerm = filterText.toLowerCase().trim();
    return activities.filter(activity => {
      // Search in multiple fields
      const searchableText = [
        activity.member_name || '',
        activity.details || '',
        activity.action || '',
        activity.board_title || '',
        activity.column_title || ''
      ].join(' ').toLowerCase();
      
      return searchableText.includes(searchTerm);
    });
  };

  // Handle filter input change
  const handleFilterChange = (value: string) => {
    setFilterText(value);
    // Save filter preference
    if (userId) {
      updateActivityFeedPreference('filterText', value, userId).catch(error => {
        console.error('Failed to save activity filter preference:', error);
      });
    }
  };

  // Clear filter
  const clearFilter = () => {
    setFilterText('');
    if (userId) {
      updateActivityFeedPreference('filterText', '', userId).catch(error => {
        console.error('Failed to clear activity filter preference:', error);
      });
    }
  };

  // Calculate optimal dropdown position to stay within viewport
  const calculateDropdownPosition = (): {x: number, y: number} => {
    if (!feedRef.current) return {x: 0, y: 0};
    
    const feedRect = feedRef.current.getBoundingClientRect();
    const dropdownWidth = 140; // min-w-[140px] from the dropdown
    const dropdownHeight = 80; // Approximate height for 2 buttons
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8; // Small margin from viewport edge
    
    // Calculate button position (it's in the top-right area of the feed)
    const buttonX = feedRect.right - 25; // Approximate button center
    const buttonY = feedRect.top + 20; // Approximate button center
    
    // Default: position dropdown to the right and below the button
    let dropdownX = buttonX;
    let dropdownY = buttonY + 6; // 6px below button
    
    // Check if dropdown would go off-screen on the right
    if (dropdownX + dropdownWidth > viewportWidth - margin) {
      // Position to the left of the button instead
      dropdownX = buttonX - dropdownWidth;
    }
    
    // Ensure it doesn't go off-screen on the left
    if (dropdownX < margin) {
      dropdownX = margin;
    }
    
    // Check if dropdown would go off-screen on the bottom
    if (dropdownY + dropdownHeight > viewportHeight - margin) {
      // Position above the button instead
      dropdownY = buttonY - dropdownHeight - 6;
    }
    
    // Ensure it doesn't go off-screen on the top
    if (dropdownY < margin) {
      dropdownY = margin;
    }
    
    return {x: dropdownX, y: dropdownY};
  };

  // Handle minimize dropdown toggle with position calculation
  const handleMinimizeDropdownToggle = () => {
    if (!showMinimizeDropdown) {
      // Calculate position before showing
      const optimalPosition = calculateDropdownPosition();
      setDropdownPosition(optimalPosition);
    }
    setShowMinimizeDropdown(!showMinimizeDropdown);
  };

  // Highlight search terms in text - returns HTML string for dangerouslySetInnerHTML
  const highlightTextHTML = (text: string, searchTerm: string): string => {
    if (!searchTerm.trim() || !text) {
      return text;
    }

    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    return text.replace(regex, '<span class="bg-yellow-200 text-yellow-900 px-0.5 rounded font-medium">$1</span>');
  };

  // Highlight search terms in text - returns React components for regular display
  const highlightText = (text: string, searchTerm: string): React.ReactNode => {
    if (!searchTerm.trim() || !text) {
      return text;
    }

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => {
      const isMatch = regex.test(part);
      // Reset regex lastIndex to avoid issues with global flag
      regex.lastIndex = 0;
      
      if (isMatch) {
        return (
          <span 
            key={index} 
            className="bg-yellow-200 text-yellow-900 px-0.5 rounded font-medium"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!isVisible) return null;

  // Step 1: Filter activities based on clear point (what user can see at all)
  const visibleActivities = activities.filter(activity => activity.id > clearActivityId);
  
  // Step 2: Apply text filter to visible activities
  const filteredActivities = filterActivities(visibleActivities, filterText);
  
  // Step 3: Within filtered activities, determine which are "unread"
  const unreadActivities = filteredActivities.filter(activity => activity.id > lastSeenActivityId);
  const unreadCount = unreadActivities.length;
  
  // Use filtered activities for display
  const displayActivities = filteredActivities;
  
  // Get latest activity for minimized view (could be read or unread)
  const latestActivity = activities.length > 0 ? activities[0] : null;
  
  // Handle mark as read - marks visible activities as read
  const handleMarkAsRead = () => {
    if (visibleActivities.length > 0 && onMarkAsRead) {
      const latestVisibleId = Math.max(...visibleActivities.map(a => a.id));
      onMarkAsRead(latestVisibleId);
    }
  };

  // Handle clear all - sets clear point to hide current activities
  const handleClearAll = () => {
    if (onClearAll && activities.length > 0) {
      const clearId = Math.max(...activities.map(a => a.id));
      onClearAll(clearId);
    }
  };
  
  if (isMinimized) {
    return (
      <div 
        ref={feedRef}
        className={`fixed bg-white dark:bg-gray-800 shadow-lg rounded border border-gray-200 dark:border-gray-700 z-[9999] ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{
          left: position.x,
          top: position.y,
          width: dimensions.width,
          height: 60, // Fixed height for minimized
        }}
      >
        {/* Minimized Header - Same title and pill as maximized */}
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-t">
          {/* Left side - Activity title and unread count */}
          <div className="flex items-center space-x-2">
            <div 
              className="cursor-grab active:cursor-grabbing"
              onMouseDown={handleDragStart}
            >
              <GripVertical className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            </div>
            <Activity className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            {dimensions.width >= 155 && (
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Activity Feed</span>
            )}
            {unreadCount > 0 && (
              <div className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[16px] h-4 flex items-center justify-center leading-none">
                {unreadCount}
              </div>
            )}
          </div>

          {/* Right side - Simple action buttons */}
          <div className="flex items-center space-x-0.5">
            <button
              onClick={() => handleMinimizedChange(false)}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title="Expand Activity Feed"
            >
              <ChevronUp className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
            </button>
            <button
              onClick={onClose}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title="Close Activity Feed"
            >
              <X className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* Latest Activity Content */}
        <div 
          className="px-2 py-1 bg-white dark:bg-gray-800 cursor-help flex-1 flex items-center"
          onMouseEnter={latestActivity ? handleMouseEnter : undefined}
          onMouseLeave={latestActivity ? handleMouseLeave : undefined}
        >
          <div className="min-w-0 flex-1">
            {latestActivity ? (
              <div className="text-xs text-gray-700 truncate">
                <span className="font-medium text-blue-600">
                  {highlightText(latestActivity.member_name || 'Unknown User', filterText)}
                </span>
                {' '}
                <span>{highlightText(latestActivity.details, filterText)}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-500">No recent activity</span>
            )}
          </div>
        </div>
        
        {/* Tooltip for latest activity details */}
        {showTooltip && latestActivity && tooltipPosition && createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[10000] max-w-sm p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg pointer-events-none"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left
            }}
          >
            <div className="space-y-1">
              <div className="flex items-center space-x-1">
                {getActionIcon(latestActivity.action)}
                <span className="font-medium">{highlightText(latestActivity.member_name || 'Unknown User', filterText)}</span>
              </div>
              <div className="text-gray-300">{highlightText(latestActivity.details, filterText)}</div>
              {latestActivity.board_title && (
                <div className="text-gray-400">in {highlightText(latestActivity.board_title, filterText)}</div>
              )}
              <div className="flex items-center space-x-1 text-gray-400">
                <Clock className="w-2 h-2" />
                <span>{formatTimeAgo(latestActivity.created_at)}</span>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // Determine if we're in narrow mode for responsive styling
  const isNarrowMode = dimensions.width <= 160;
  const isExtraNarrowMode = dimensions.width <= 130;

  return (
    <div 
      ref={feedRef}
      className={`fixed bg-white dark:bg-gray-800 shadow-xl rounded border border-gray-200 dark:border-gray-700 z-[9999] flex flex-col ${isDragging ? 'cursor-grabbing' : ''} ${isResizing ? 'select-none' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: dimensions.width,
        height: dimensions.height,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-t">
        {/* Drag Handle */}
        <div 
          className="cursor-grab active:cursor-grabbing flex items-center mr-1"
          onMouseDown={handleDragStart}
        >
          <GripVertical className="w-3 h-3 text-gray-400 dark:text-gray-500" />
        </div>
        
        <div className="flex items-center space-x-1.5 flex-1 min-w-0">
          <Activity className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          {!isExtraNarrowMode && (
            <h3 className="font-medium text-gray-900 dark:text-gray-100 text-xs truncate">
              {isNarrowMode ? 'Activity' : 'Activity Feed'}
            </h3>
          )}
          {unreadCount > 0 && (
            <div className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
              <span className="text-xs leading-none">{unreadCount > 9 ? '9+' : unreadCount}</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-0.5">
          {/* Minimize Dropdown */}
          <div className="relative minimize-dropdown">
            <button
              onClick={handleMinimizeDropdownToggle}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors flex items-center"
              title="Minimize Options"
            >
              <ChevronDown className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
            </button>
            
            {/* Dropdown rendered here for positioning context, but content is in portal */}
          </div>
          
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Close Activity Feed"
          >
            <X className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Filter Input - Responsive */}
      <div className={`border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${isNarrowMode ? 'p-1' : 'p-2'}`}>
        <div className="relative">
          {!isExtraNarrowMode && (
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <Search className="h-3 w-3 text-gray-400" />
            </div>
          )}
          <input
            type="text"
            placeholder={isNarrowMode ? "Filter..." : "Filter activities..."}
            value={filterText}
            onChange={(e) => handleFilterChange(e.target.value)}
            className={`block w-full py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md leading-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
              isExtraNarrowMode ? 'pl-2 pr-6' : 'pl-7 pr-7'
            }`}
          />
          {filterText && (
            <button
              onClick={clearFilter}
              className="absolute inset-y-0 right-0 pr-2 flex items-center"
              title="Clear filter"
            >
              <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        {filterText && !isNarrowMode && (
          <div className="mt-1 text-xs text-gray-500">
            {displayActivities.length} of {visibleActivities.length} activities shown
          </div>
        )}
        {filterText && isNarrowMode && (
          <div className="mt-1 text-xs text-gray-500 text-center">
            {displayActivities.length}/{visibleActivities.length}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto ${isNarrowMode ? 'p-1' : 'p-2'}`}>
        {loading && activities.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-xs text-center py-2">
            {error}
          </div>
        )}

        {!loading && displayActivities.length === 0 && (
          <div className="text-gray-500 text-xs text-center py-4">
            {clearActivityId > 0 ? 'Feed cleared - new activities will appear here' : 'No recent activity'}
          </div>
        )}

        <div className="space-y-1">
          {displayActivities.map((activity) => {
            const { name, description } = formatActivityDescription(activity);
            const isUnread = activity.id > lastSeenActivityId;
            return (
              <div 
                key={activity.id} 
                className={`flex items-start rounded hover:bg-gray-100 transition-colors ${
                  isNarrowMode ? 'space-x-1 p-1' : 'space-x-1.5 p-1.5'
                } ${
                  isUnread 
                    ? 'bg-blue-50 border-l-2 border-blue-500' 
                    : 'bg-gray-50'
                }`}
              >
                {!isExtraNarrowMode && (
                  <div className="text-xs flex-shrink-0 mt-0.5">
                    {getActionIcon(activity.action)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-900 dark:text-gray-100 leading-tight">
                    {isNarrowMode ? (
                      // Compact layout for narrow widths
                      <div className="space-y-0.5">
                        <div className={`font-medium truncate ${isUnread ? 'text-blue-700' : 'text-blue-600'}`}>
                          {highlightText(name, filterText)}
                        </div>
                        <div 
                          className="text-gray-700 text-xs leading-tight"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(highlightTextHTML(description, filterText), {
                              ALLOWED_TAGS: ['a', 'span'],
                              ALLOWED_ATTR: ['href', 'class', 'title']
                            })
                          }}
                        />
                      </div>
                    ) : (
                      // Normal layout
                      <>
                        <span className={`font-medium ${isUnread ? 'text-blue-700' : 'text-blue-600'}`}>
                          {highlightText(name, filterText)}
                        </span>
                        {' '}
                        <span 
                          className="text-gray-700"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(highlightTextHTML(description, filterText), {
                              ALLOWED_TAGS: ['a', 'span'],
                              ALLOWED_ATTR: ['href', 'class', 'title']
                            })
                          }}
                        />
                      </>
                    )}
                  </div>
                  <div className={`flex items-center mt-0.5 ${isNarrowMode ? 'space-x-0.5' : 'space-x-1'}`}>
                    <Clock className="w-2 h-2 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 leading-none truncate">
                      {isNarrowMode ? formatTimeAgo(activity.created_at).replace(' ago', '') : formatTimeAgo(activity.created_at)}
                    </span>
                    {isUnread && (
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0"></div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className={`border-t border-gray-200 bg-gray-50 rounded-b space-y-1 ${isNarrowMode ? 'p-1' : 'p-1.5'}`}>
        {unreadCount > 0 ? (
          <button
            onClick={handleMarkAsRead}
            className="w-full text-xs text-green-600 hover:text-green-700 font-medium py-0.5 bg-green-50 hover:bg-green-100 rounded transition-colors"
          >
            {isNarrowMode ? `✓ ${unreadCount}` : `Mark ${unreadCount} as Read`}
          </button>
        ) : displayActivities.length > 0 ? (
          <button
            onClick={handleClearAll}
            className="w-full text-xs text-red-600 hover:text-red-700 font-medium py-0.5 bg-red-50 hover:bg-red-100 rounded transition-colors"
          >
            {isNarrowMode ? 'Clear' : 'Clear All Activities'}
          </button>
        ) : (
          <div className="text-xs text-gray-500 text-center py-1">
            {clearActivityId > 0 ? 'Feed cleared' : (isNarrowMode ? 'Auto 3s' : 'Auto-refreshing every 30s')}
          </div>
        )}
      </div>

      {/* Resize Handles */}
      {/* Top edge resize handle */}
      <div
        className="absolute top-0 left-0 w-full h-1 cursor-ns-resize hover:bg-blue-200 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'height-top')}
        style={{ top: -2 }}
      />
      
      {/* Right edge resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-200 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'width')}
        style={{ right: -2 }}
      />
      
      {/* Bottom edge resize handle */}
      <div
        className="absolute bottom-0 left-0 w-full h-1 cursor-ns-resize hover:bg-blue-200 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'height')}
        style={{ bottom: -2 }}
      />
      
      {/* Bottom-right corner resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nw-resize hover:bg-blue-300 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'both')}
        style={{ bottom: -2, right: -2 }}
      />
      
      {/* Top-right corner resize handle */}
      <div
        className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize hover:bg-blue-300 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'both-top')}
        style={{ top: -2, right: -2 }}
      />
      
      {/* Minimize Dropdown Portal - rendered outside the feed to avoid clipping */}
      {showMinimizeDropdown && dropdownPosition && createPortal(
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-[10001] py-1 min-w-[140px]"
          data-minimize-dropdown
          style={{
            left: dropdownPosition.x,
            top: dropdownPosition.y,
          }}
        >
          <button
            onClick={() => {
              handleMinimizeInPlace();
              setShowMinimizeDropdown(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
          >
            <ChevronDown className="w-3 h-3 mr-2" />
            In place
          </button>
          <button
            onClick={() => {
              handleMinimizeToBottom();
              setShowMinimizeDropdown(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
          >
            <ChevronDown className="w-3 h-3 mr-2" />
            Bottom
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ActivityFeed;
