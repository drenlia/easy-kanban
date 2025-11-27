import React, { useEffect, useRef } from 'react';
import { Task } from '../types';

interface TaskLinkingOverlayProps {
  isLinkingMode: boolean;
  linkingSourceTask: Task | null;
  linkingLine: {startX: number, startY: number, endX: number, endY: number} | null;
  feedbackMessage?: string | null;
  onUpdateLinkingLine: (endPosition: {x: number, y: number}) => void;
  onFinishLinking: (targetTask: Task | null, relationshipType?: 'parent' | 'child' | 'related') => Promise<void>;
  onCancelLinking: () => void;
}

const TaskLinkingOverlay: React.FC<TaskLinkingOverlayProps> = ({
  isLinkingMode,
  linkingSourceTask,
  linkingLine,
  feedbackMessage,
  onUpdateLinkingLine,
  onFinishLinking,
  onCancelLinking
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const currentMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const edgeScrollZone = 50; // Pixels from edge to trigger auto-scroll
  const scrollSpeed = 10; // Pixels per frame

  // Find the scrollable kanban container (for horizontal scrolling)
  const findScrollableContainer = (): HTMLElement | null => {
    // Try to find the kanban scrollable container
    const kanbanContainer = document.querySelector('.kanban-scrollable-container') as HTMLElement;
    if (kanbanContainer) {
      return kanbanContainer;
    }
    return null;
  };

  // Auto-scroll when mouse is near viewport edges
  const handleAutoScroll = () => {
    const mousePos = currentMousePositionRef.current;
    if (!mousePos) {
      scrollAnimationFrameRef.current = null;
      return;
    }

    const container = findScrollableContainer();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let scrollX = 0;
    let scrollY = 0;
    
    // Check horizontal edges
    if (mousePos.x < edgeScrollZone) {
      // Near left edge - scroll left
      scrollX = -scrollSpeed;
    } else if (mousePos.x > viewportWidth - edgeScrollZone) {
      // Near right edge - scroll right
      scrollX = scrollSpeed;
    }
    
    // Check vertical edges
    if (mousePos.y < edgeScrollZone) {
      // Near top edge - scroll up
      scrollY = -scrollSpeed;
    } else if (mousePos.y > viewportHeight - edgeScrollZone) {
      // Near bottom edge - scroll down
      scrollY = scrollSpeed;
    }
    
    // Apply horizontal scrolling to container (if available)
    if (scrollX !== 0 && container) {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const newScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + scrollX));
      if (newScrollLeft !== container.scrollLeft) {
        container.scrollLeft = newScrollLeft;
      }
    }
    
    // Apply vertical scrolling to window (or find scrollable parent)
    if (scrollY !== 0) {
      // Check if we can scroll vertically
      const canScrollUp = window.scrollY > 0;
      const canScrollDown = window.scrollY < document.documentElement.scrollHeight - window.innerHeight;
      
      if ((scrollY < 0 && canScrollUp) || (scrollY > 0 && canScrollDown)) {
        window.scrollBy({
          top: scrollY,
          left: 0,
          behavior: 'auto' // Use 'auto' for smooth continuous scrolling
        });
      }
    }
    
    // Continue scrolling if still near edge
    if (scrollX !== 0 || scrollY !== 0) {
      scrollAnimationFrameRef.current = requestAnimationFrame(() => {
        handleAutoScroll();
      });
    } else {
      scrollAnimationFrameRef.current = null;
    }
  };

  // Handle mouse movement and mouse up to update the linking line
  useEffect(() => {
    if (!isLinkingMode || !linkingLine) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Update current mouse position for auto-scroll
      currentMousePositionRef.current = { x: event.clientX, y: event.clientY };
      
      // Update linking line position
      if (overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        // For fixed overlay, coordinates are relative to viewport
        // getBoundingClientRect() for fixed elements returns viewport coordinates
        // So we can use clientX/clientY directly, or subtract rect.left/top (which should be 0 or near 0)
        const newX = event.clientX - rect.left;
        const newY = event.clientY - rect.top;
        onUpdateLinkingLine({
          x: newX,
          y: newY
        });
      } else {
        // Fallback: use clientX/clientY directly if ref not available
        onUpdateLinkingLine({
          x: event.clientX,
          y: event.clientY
        });
      }
      
      // Start auto-scroll animation if not already running
      if (scrollAnimationFrameRef.current === null) {
        handleAutoScroll();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Update current mouse position for auto-scroll
      currentMousePositionRef.current = { x: event.clientX, y: event.clientY };
      
      // Also handle pointer events
      if (overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        const newX = event.clientX - rect.left;
        const newY = event.clientY - rect.top;
        onUpdateLinkingLine({
          x: newX,
          y: newY
        });
      } else {
        onUpdateLinkingLine({
          x: event.clientX,
          y: event.clientY
        });
      }
      
      // Start auto-scroll animation if not already running
      if (scrollAnimationFrameRef.current === null) {
        handleAutoScroll();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      // If mouse up happens on the overlay (not on a task), cancel linking
      // But if it's on a task card, let the TaskCard's onMouseUp handler handle it
      const target = event.target as Element;
      const taskCard = target.closest('.task-card');
      if (!taskCard) {
        onCancelLinking();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      // Same logic for pointer events
      const target = event.target as Element;
      const taskCard = target.closest('.task-card');
      if (!taskCard) {
        onCancelLinking();
      }
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelLinking();
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: false });
    document.addEventListener('pointerup', handlePointerUp, { capture: false });
    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyPress);
      
      // Cancel any ongoing scroll animation
      if (scrollAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
      
      // Clear mouse position tracking
      currentMousePositionRef.current = null;
    };
  }, [isLinkingMode, linkingLine, onUpdateLinkingLine, onCancelLinking]);

  // Show feedback message if present
  if (feedbackMessage) {
    const message = feedbackMessage.toLowerCase();
    const isError = message.includes('failed') || message.includes('cannot create');
    const isCancelled = message.includes('cancelled');
    const isAlreadyExists = message.includes('already exists');
    const isCircularDependency = message.includes('circular dependency') || message.includes('descendant');
    
    let bgColor, icon;
    if (isError) {
      bgColor = 'bg-red-600';
      icon = '❌';
    } else if (isCancelled) {
      bgColor = 'bg-orange-600';
      icon = '⚠️';
    } else if (isCircularDependency) {
      bgColor = 'bg-red-600';
      icon = '🔄';
    } else if (isAlreadyExists) {
      bgColor = 'bg-yellow-600';
      icon = '⚠️';
    } else {
      // Success case
      bgColor = 'bg-green-600';
      icon = '✅';
    }
    
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium`}>
          <div className="flex items-center space-x-2">
            <span>{icon}</span>
            <span>{feedbackMessage}</span>
          </div>
        </div>
      </div>
    );
  }

  // Show linking overlay if in linking mode
  if (!isLinkingMode || !linkingLine || !linkingSourceTask) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 pointer-events-none"
      style={{ cursor: 'crosshair' }}
    >
      {/* SVG for drawing the connecting line */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          {/* Arrowhead marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#3B82F6"
            />
          </marker>
        </defs>
        
        {/* Main connecting line */}
        <line
          x1={linkingLine.startX}
          y1={linkingLine.startY}
          x2={linkingLine.endX}
          y2={linkingLine.endY}
          stroke="#3B82F6"
          strokeWidth="2"
          strokeDasharray="5,5"
          markerEnd="url(#arrowhead)"
        />
        
        {/* Starting point indicator */}
        <circle
          cx={linkingLine.startX}
          cy={linkingLine.startY}
          r="4"
          fill="#3B82F6"
          stroke="white"
          strokeWidth="2"
        />
      </svg>

      {/* Instructions overlay */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
        <div className="flex items-center space-x-2">
          <span>🔗</span>
          <span>Linking from <strong>{linkingSourceTask.ticket}</strong> - Click on target task or press ESC to cancel</span>
        </div>
      </div>
    </div>
  );
};

export default TaskLinkingOverlay;
