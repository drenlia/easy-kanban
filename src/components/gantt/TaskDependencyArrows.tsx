import React, { useEffect, useState, useRef } from 'react';
import { getTaskRelationships } from '../../api';

interface GanttTask {
  id: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  ticket: string;
  columnId: string;
  status: string;
  priority: string;
  columnPosition: number;
  taskPosition: number;
}

interface TaskRelationship {
  id: string;
  task_id: string;
  relationship: 'parent' | 'child' | 'related';
  to_task_id: string;
  task_ticket: string;
  related_task_ticket: string;
}

interface TaskPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  taskId: string;
}

interface TaskDependencyArrowsProps {
  ganttTasks: GanttTask[];
  taskPositions: Map<string, {x: number, y: number, width: number, height: number}>;                                                                           
  isRelationshipMode?: boolean;
  onCreateRelationship?: (fromTaskId: string, toTaskId: string) => void;
  onDeleteRelationship?: (relationshipId: string, fromTaskId: string) => void;
  relationships?: TaskRelationship[]; // Add relationships prop for auto-sync
  dateRange?: { date: Date }[]; // Add date range for position calculation
  taskViewMode?: 'compact' | 'shrink' | 'expand';
}

interface DependencyArrow {
  id: string;
  relationshipId: string;
  fromTaskId: string;
  toTaskId: string;
  relationship: 'parent' | 'child' | 'related';
  fromPosition: TaskPosition;
  toPosition: TaskPosition;
  path: string;
  color: string;
}

export const TaskDependencyArrows: React.FC<TaskDependencyArrowsProps> = ({
  ganttTasks,
  taskPositions,
  isRelationshipMode = false,
  onCreateRelationship,
  onDeleteRelationship,
  relationships = [],
  dateRange = [],
  taskViewMode = 'expand'
}) => {
  
  
  const [localRelationships, setLocalRelationships] = useState<TaskRelationship[]>([]);
  const [arrows, setArrows] = useState<DependencyArrow[]>([]);
  const [hoveredArrow, setHoveredArrow] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [positionKey, setPositionKey] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // Connection drawing state (simplified for icon-based approach)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  // Trigger position recalculation when tasks change
  useEffect(() => {
    const timer = setTimeout(() => {
      setPositionKey(prev => prev + 1);
    }, 50); // Small delay to ensure DOM is updated
    return () => clearTimeout(timer);
  }, [ganttTasks.length]); // Only depend on task count, not positions

  // Listen for scroll events to recalculate arrows when timeline changes
  useEffect(() => {
    const timelineContainer = document.querySelector('.gantt-timeline-container');
    if (!timelineContainer) return;

    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setPositionKey(prev => prev + 1);
      }, 100);
    };

    timelineContainer.addEventListener('scroll', handleScroll);
    
    return () => {
      timelineContainer.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Use relationships from props (auto-synced via polling) - KEEP THIS IMPROVEMENT
  useEffect(() => {
    
    if (ganttTasks.length === 0) {
      setLocalRelationships([]);
      return;
    }

    // Filter to only show relationships between visible tasks
    const visibleTaskIds = new Set(ganttTasks.map(t => t.id));
    const visibleRelationships = relationships.filter(rel => 
      visibleTaskIds.has(rel.task_id) && visibleTaskIds.has(rel.to_task_id)
    );

    setLocalRelationships(visibleRelationships);
  }, [ganttTasks, relationships]);

  // Calculate task position directly from timeline - COMPLETELY INDEPENDENT
  const getTaskPosition = (task: GanttTask): TaskPosition | null => {
    
    // Get the timeline container
    const timelineContainer = document.querySelector('.gantt-timeline-container');
    if (!timelineContainer) {
      return null;
    }
    
    // Get the date range from props
    if (!dateRange || dateRange.length === 0) {
      return null;
    }
    
    
    // Calculate column width
    const containerWidth = timelineContainer.scrollWidth;
    const columnWidth = containerWidth / dateRange.length;
    
    // Find task dates
    const taskStartDate = task.startDate;
    const taskEndDate = task.endDate;
    
    if (!taskStartDate || !taskEndDate) {
      return null;
    }
    
    // Find date indices
    const startDateStr = taskStartDate.toISOString().split('T')[0];
    const endDateStr = taskEndDate.toISOString().split('T')[0];
    
    const startIndex = dateRange.findIndex(d => d.date.toISOString().split('T')[0] === startDateStr);
    const endIndex = dateRange.findIndex(d => d.date.toISOString().split('T')[0] === endDateStr);
    
    
    if (startIndex === -1 || endIndex === -1) {
      return null;
    }
    
    // Calculate X position (absolute timeline position)
    const x = startIndex * columnWidth;
    const width = (endIndex - startIndex + 1) * columnWidth;
    
    // Find the task in the DOM to get Y position
    const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
    if (!taskElement) {
      return null;
    }
    
    const taskRect = taskElement.getBoundingClientRect();
    const containerRect = timelineContainer.getBoundingClientRect();
    
    // Calculate Y position relative to container
    const y = taskRect.top - containerRect.top;
    const height = taskRect.height;
    
    // Check if we need to account for scroll position
    const scrollTop = timelineContainer.scrollTop || 0;
    const adjustedY = y - scrollTop;
    
    // Add a fixed offset to compensate for vertical misalignment
    // The arrows are appearing below the tasks, so we need to move them up
    const verticalOffset = -60; // Perfectly centered with task bars
    const finalY = adjustedY + verticalOffset;
    
    const position = {
      x,
      y: finalY, // Use final Y coordinate with SVG offset
      width,
      height,
      taskId: task.id
    };
    
    return position;
  };

  // Generate SVG path for arrow - CORRECT SPECIFICATION
  const generateArrowPath = (from: TaskPosition, to: TaskPosition): string => {
    // Estimate column width from task positioning (assuming uniform grid)
    const estimatedColumnWidth = from.width / Math.max(1, Math.round(from.width / 50)); // Rough estimate
    
    // CORRECT SPECIFICATION:
    // 1. Start: End date of parent (right edge), vertically centered
    // 2. Step out: Half a data cell to the right
    // 3. Horizontal routing: Go left/right under the parent task
    // 4. Approach: Stop at half a data cell before child's start date
    // 5. Connect: Vertical line down/up to child's start date (left edge), vertically centered
    
    const fromX = from.x + from.width; // Right edge of parent task (end date)
    const fromY = from.y + (from.height / 2); // Vertical center of parent task
    const toX = to.x; // Left edge of child task (start date)
    const toY = to.y + (to.height / 2); // Vertical center of child task

    // Step out half a data cell from parent's end date
    const stepOutDistance = estimatedColumnWidth * 0.5;
    const stepOutX = fromX + stepOutDistance;
    
    // Approach half a data cell before child's start date
    const approachDistance = estimatedColumnWidth * 0.5;
    const approachX = toX - approachDistance;
    
    // Route horizontally under the parent task
    const routeY = fromY + 30; // 30px below parent task center (26px + 4px more)
    
    // Connect 2px lower to both tasks
    const fromYAdjusted = fromY + 2; // 2px lower from parent center
    const toYAdjusted = toY + 2; // 2px lower to child center
    
    // Path: right from parent end → down under parent → left/right to approach point → up to child start
    return `M ${fromX} ${fromYAdjusted} L ${stepOutX} ${fromYAdjusted} L ${stepOutX} ${routeY} L ${approachX} ${routeY} L ${approachX} ${toYAdjusted} L ${toX} ${toYAdjusted}`;
  };

  // Calculate arrows based on relationships and task positions - SIMPLE VERSION
  useEffect(() => {
    if (!localRelationships || !ganttTasks) return;
    
    const newArrows: DependencyArrow[] = [];
    const processedPairs = new Set<string>(); // Prevent duplicate arrows

    localRelationships.forEach((rel) => {
      const fromTask = ganttTasks.find(t => t.id === rel.task_id);
      const toTask = ganttTasks.find(t => t.id === rel.to_task_id);


      if (!fromTask || !toTask) {
        return;
      }

      const fromPos = getTaskPosition(fromTask);
      const toPos = getTaskPosition(toTask);


      if (!fromPos || !toPos) {
        return;
      }

      // Only show parent->child arrows (finish-to-start dependencies)
      if (rel.relationship === 'parent') {
        
        // Create unique pair identifier to prevent duplicates
        const pairKey = `${rel.task_id}-${rel.to_task_id}`;
        if (processedPairs.has(pairKey)) {
          return;
        }
        processedPairs.add(pairKey);

        const path = generateArrowPath(fromPos, toPos);
        const color = rel.relationship === 'parent' ? '#3B82F6' : 
                     rel.relationship === 'related' ? '#6B7280' : '#10B981';

        const arrow = {
          id: `${rel.id}-${pairKey}`, // Ensure unique ID
          relationshipId: rel.id, // Store the actual relationship ID for deletion                                                                             
          fromTaskId: rel.task_id,
          toTaskId: rel.to_task_id,
          relationship: rel.relationship as any,
          fromPosition: fromPos,
          toPosition: toPos,
          path,
          color
        };

        newArrows.push(arrow);
      } else {
      }
    });

    setArrows(newArrows);
  }, [localRelationships, ganttTasks, taskPositions, positionKey]);

  // Arrow marker definition
  const ArrowMarker = ({ id, color }: { id: string; color: string }) => (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="3"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L0,6 L9,3 z" fill={color} />
      </marker>
    </defs>
  );

  // Always render the component so we can see debug dots

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        zIndex: 10,
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible'
        }}
      >
      {/* Define arrow markers for each color */}
      <ArrowMarker id="arrow-parent" color="#3B82F6" />
      <ArrowMarker id="arrow-related" color="#6B7280" />
      <ArrowMarker id="arrow-child" color="#10B981" />

      {/* SVG overlays no longer needed - using link icons instead */}

      {/* Connection drawing no longer needed - using simple click approach */}

      {/* Render dependency arrows */}
      {arrows.map((arrow) => (
        <g key={`arrow-${arrow.id}`}>
          {/* Arrow path */}
          <path
            key={`arrow-path-${arrow.id}-${arrow.path.slice(0,20)}`}
            d={arrow.path}
            stroke={arrow.color}
            strokeWidth={hoveredArrow === arrow.id ? 4 : 3}
            strokeOpacity={0.5}
            fill="none"
            markerEnd={`url(#arrow-${arrow.relationship})`}
            className="transition-all duration-200"
            style={{
              filter: hoveredArrow === arrow.id ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none'
            }}
          />
          
          {/* Invisible wider path for easier hovering */}
          <path
            d={arrow.path}
            stroke="transparent"
            strokeWidth={10}
            fill="none"
            className="pointer-events-auto cursor-pointer"
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              setHoveredArrow(arrow.id);
            }}
            onMouseLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredArrow(null);
              }, 100);
            }}
          />
          
          {/* Delete button on hover */}
          {hoveredArrow === arrow.id && onDeleteRelationship && (
            <g>
              {(() => {
                // Get the actual task position from taskPositions map
                const toTaskPosition = taskPositions.get(arrow.toTaskId);
                if (!toTaskPosition) return null;
                
                // Position delete button 20px to the left of the target task's left edge
                const deleteX = toTaskPosition.x - 20;
                const deleteY = toTaskPosition.y + toTaskPosition.height / 2;
                
                
                return (
                  <>
                    {/* Extended hover area around delete button */}
                    <rect
                      x={deleteX - 15}
                      y={deleteY - 15}
                      width={30}
                      height={30}
                      fill="transparent"
                      className="pointer-events-auto"
                      onMouseEnter={() => {
                        if (hoverTimeoutRef.current) {
                          clearTimeout(hoverTimeoutRef.current);
                        }
                        setHoveredArrow(arrow.id);
                      }}
                      onMouseLeave={() => {
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoveredArrow(null);
                        }, 100);
                      }}
                    />
                    {/* Delete button background */}
                    <circle
                      cx={deleteX}
                      cy={deleteY}
                      r="6"
                      fill="rgba(239, 68, 68, 0.9)"
                      stroke="white"
                      strokeWidth="1"
                      className="cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
                      onMouseEnter={() => {
                        if (hoverTimeoutRef.current) {
                          clearTimeout(hoverTimeoutRef.current);
                        }
                        setHoveredArrow(arrow.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeleteRelationship(arrow.relationshipId, arrow.fromTaskId);
                      }}
                    />
                    {/* X icon */}
                    <text
                      x={deleteX}
                      y={deleteY + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="8"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      ×
                    </text>
                  </>
                );
              })()}
            </g>
          )}
        </g>
      ))}

    </svg>
    </div>
  );
};