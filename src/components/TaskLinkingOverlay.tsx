import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../types';

interface TaskLinkingOverlayProps {
  isLinkingMode: boolean;
  linkingSourceTask: Task | null;
  linkingLine: { startX: number; startY: number; endX: number; endY: number } | null;
  onUpdateLinkingLine: (endPosition: { x: number; y: number }) => void;
  onCancelLinking: () => void;
}

const TaskLinkingOverlay: React.FC<TaskLinkingOverlayProps> = ({
  isLinkingMode,
  linkingSourceTask,
  linkingLine,
  onUpdateLinkingLine,
  onCancelLinking,
}) => {
  const { t } = useTranslation('tasks');
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const currentMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const edgeScrollZone = 50;
  const scrollSpeed = 10;

  const findScrollableContainer = (): HTMLElement | null => {
    return document.querySelector('.kanban-scrollable-container') as HTMLElement | null;
  };

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

    if (mousePos.x < edgeScrollZone) {
      scrollX = -scrollSpeed;
    } else if (mousePos.x > viewportWidth - edgeScrollZone) {
      scrollX = scrollSpeed;
    }

    if (mousePos.y < edgeScrollZone) {
      scrollY = -scrollSpeed;
    } else if (mousePos.y > viewportHeight - edgeScrollZone) {
      scrollY = scrollSpeed;
    }

    if (scrollX !== 0 && container) {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const newScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + scrollX));
      if (newScrollLeft !== container.scrollLeft) {
        container.scrollLeft = newScrollLeft;
      }
    }

    if (scrollY !== 0) {
      const canScrollUp = window.scrollY > 0;
      const canScrollDown = window.scrollY < document.documentElement.scrollHeight - window.innerHeight;

      if ((scrollY < 0 && canScrollUp) || (scrollY > 0 && canScrollDown)) {
        window.scrollBy({
          top: scrollY,
          left: 0,
          behavior: 'auto',
        });
      }
    }

    if (scrollX !== 0 || scrollY !== 0) {
      scrollAnimationFrameRef.current = requestAnimationFrame(() => {
        handleAutoScroll();
      });
    } else {
      scrollAnimationFrameRef.current = null;
    }
  };

  useEffect(() => {
    if (!isLinkingMode || !linkingLine) {
      return;
    }

    const updateLineFromClientPoint = (clientX: number, clientY: number) => {
      currentMousePositionRef.current = { x: clientX, y: clientY };

      if (overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        onUpdateLinkingLine({
          x: clientX - rect.left,
          y: clientY - rect.top,
        });
      } else {
        onUpdateLinkingLine({ x: clientX, y: clientY });
      }

      if (scrollAnimationFrameRef.current === null) {
        handleAutoScroll();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateLineFromClientPoint(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
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

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { capture: false });
    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyPress);

      if (scrollAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }

      currentMousePositionRef.current = null;
    };
  }, [isLinkingMode, linkingLine, onUpdateLinkingLine, onCancelLinking]);

  if (!isLinkingMode || !linkingLine || !linkingSourceTask) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[80] pointer-events-none"
      style={{ cursor: 'crosshair' }}
    >
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#3B82F6" />
          </marker>
        </defs>

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

        <circle
          cx={linkingLine.startX}
          cy={linkingLine.startY}
          r="4"
          fill="#3B82F6"
          stroke="white"
          strokeWidth="2"
        />
      </svg>

      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
        <div className="flex items-center space-x-2">
          <span>🔗</span>
          <span>
            {t('relationships.linkingFrom', { ticket: linkingSourceTask.ticket })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TaskLinkingOverlay;
