import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';

interface TaskBarTooltipProps {
  task: any;
  formatDate: (date: string | Date) => string;
  children: React.ReactNode;
}

export const TaskBarTooltip: React.FC<TaskBarTooltipProps> = ({ task, formatDate, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const targetRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsVisible(true);
    updatePosition(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isVisible) {
      updatePosition(e);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const updatePosition = (e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    
    // Offset tooltip slightly from cursor
    setPosition({
      x: x + 15,
      y: y + 15
    });
  };

  const tooltipContent = (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 max-w-sm pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.05s ease-in-out'
      }}
    >
      <div className="font-semibold mb-1">
        {task.ticket}: {task.title}
      </div>
      <div className="text-gray-300 mb-1">
        {formatDate(task.startDate)} - {formatDate(task.endDate)}
      </div>
      {task.description && (
        <div 
          className="text-gray-300 mt-2 border-t border-gray-700 pt-2 max-h-32 overflow-y-auto prose prose-sm prose-invert max-w-none"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(task.description)
          }}
        />
      )}
    </div>
  );

  return (
    <>
      <div
        ref={targetRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full"
      >
        {children}
      </div>
      {isVisible && createPortal(tooltipContent, document.body)}
    </>
  );
};

