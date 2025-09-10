import React, { useEffect, useRef } from 'react';
import { Task } from '../types';

interface TaskLinkingOverlayProps {
  isLinkingMode: boolean;
  linkingSourceTask: Task | null;
  linkingLine: {startX: number, startY: number, endX: number, endY: number} | null;
  onUpdateLinkingLine: (endPosition: {x: number, y: number}) => void;
  onFinishLinking: (targetTask: Task | null, relationshipType?: 'parent' | 'child' | 'related') => Promise<void>;
  onCancelLinking: () => void;
}

const TaskLinkingOverlay: React.FC<TaskLinkingOverlayProps> = ({
  isLinkingMode,
  linkingSourceTask,
  linkingLine,
  onUpdateLinkingLine,
  onFinishLinking,
  onCancelLinking
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle mouse movement and mouse up to update the linking line
  useEffect(() => {
    if (!isLinkingMode || !linkingLine) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        onUpdateLinkingLine({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        });
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      // If mouse up happens on the overlay (not on a task), cancel linking
      const target = event.target as Element;
      if (!target.closest('.task-card')) {
        console.log('🚫 Mouse up outside task - canceling linking');
        onCancelLinking();
      }
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelLinking();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isLinkingMode, linkingLine, onUpdateLinkingLine, onCancelLinking]);

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
