import React, { useEffect, useState, useRef } from 'react';
import { getTaskRelationships } from '../../api';

interface GanttTask {
  id: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  ticket: string;
  columnId: string;
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
  relationships = []
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

  // Mouse event handlers no longer needed - using click-based approach with link icons

  // Use relationships from props (auto-synced via polling)
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

  // Get task position from props (calculated by parent GanttView)
  const getTaskPosition = (task: GanttTask): TaskPosition | null => {
    const pos = taskPositions.get(task.id);
    if (!pos) return null;
    
    
    return {
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
      taskId: task.id
    };
  };

  // Generate SVG path for arrow
  const generateArrowPath = (from: TaskPosition, to: TaskPosition): string => {
    // Estimate column width from task positioning (assuming uniform grid)
    const estimatedColumnWidth = from.width / Math.max(1, Math.round(from.width / 50)); // Rough estimate
    
    // Parent-child arrows: from RIGHT EDGE CENTER of parent task to LEFT CENTER of child
    const fromX = from.x + from.width; // Right edge of parent task
    const fromY = from.y + (from.height / 2); // Vertical center of parent task
    const toX = to.x + 5; // Slightly into the child task to account for arrowhead
    const toY = to.y + (to.height / 2); // Vertical center of child task

    const stepOutDistance = estimatedColumnWidth * 0.5; // Step out half a cell width
    const stepOutX = fromX + stepOutDistance; // Go right from parent
    const clearanceOffset = estimatedColumnWidth * 0.4; // Clearance before child
    
    // Check if child starts before parent ends (accounting for step-out distance)
    // Only consider it "early" if child starts before the step-out point
    const childStartsEarly = to.x < stepOutX;
    
    
    if (childStartsEarly) {
      // Child overlaps with parent - route around intelligently
      const backtrackX = to.x - clearanceOffset; // Go back before child
      
      // Determine if child is above or below parent
      const childIsAbove = toY < fromY;
      
      
      if (childIsAbove) {
        // Route above parent task
        const routeY = from.y - 20; // Go above parent task
        // Path: right from parent → up above parent → left past child → up to child level → right into child
        return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${routeY} L ${backtrackX} ${routeY} L ${backtrackX} ${toY} L ${toX} ${toY}`;
      } else {
        // Route below parent task
        const routeY = from.y + from.height + 20; // Go below parent task
        // Path: right from parent → down below parent → left past child → down to child level → right into child
        return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${routeY} L ${backtrackX} ${routeY} L ${backtrackX} ${toY} L ${toX} ${toY}`;
      }
    } else {
      // Normal case - child after parent, direct path
      const approachX = Math.max(stepOutX, to.x - clearanceOffset); // Don't go backwards
      
      // Path: right from parent → up/down to child level → right to child
      return `M ${fromX} ${fromY} L ${stepOutX} ${fromY} L ${stepOutX} ${toY} L ${approachX} ${toY} L ${toX} ${toY}`;
    }
  };

  // Calculate arrows based on relationships and task positions
  useEffect(() => {
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

      {/* Render all arrow paths first */}
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
        </g>
      ))}
      
      {/* Render all delete buttons last (on top) */}
      {arrows.map((arrow) => (
        hoveredArrow === arrow.id && onDeleteRelationship && (
          <g key={`delete-button-${arrow.id}`}>
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
        )
      ))}

    </svg>
    </div>
  );
};
