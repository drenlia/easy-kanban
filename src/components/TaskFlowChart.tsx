import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getTaskFlowChart } from '../api';
import { Maximize2, Minimize2, X, Filter, ZoomIn, ZoomOut, RotateCcw, GitBranch } from 'lucide-react';
import { feDebug } from '../utils/clientDebug';
import { useTheme } from '../contexts/ThemeContext';
import { ModernCheckbox } from './ModernCheckbox';
import websocketClient from '../services/websocketClient';
import { plainTextFromHtml } from '../utils/agentTaskHints';
import { generateTaskUrl } from '../utils/routingUtils';
import {
  CHROME_TOOLTIP_DELAY_MS,
  CHROME_TOOLTIP_MULTILINE_SURFACE_CLASS,
} from './KanbanChromeTooltip';

const PAN_THRESHOLD_PX = 5;

function flowLog(...args: unknown[]) {
  if (feDebug('FE_DEBUG_FLOWCHART')) console.log(...args);
}

/** SVG presentation colors (fill/stroke attrs ignore Tailwind dark: reliably). */
function getFlowChartSvgColors(isDark: boolean) {
  return {
    nodeFill: isDark ? '#1f2937' : '#ffffff', // gray-800 / white
    nodeStroke: isDark ? '#4b5563' : '#d1d5db', // gray-600 / gray-300
    nodeStrokeCurrent: '#3b82f6', // blue-500
    ticketFill: isDark ? '#f3f4f6' : '#111827', // gray-100 / gray-900
    titleFill: isDark ? '#d1d5db' : '#374151', // gray-300 / gray-700
    memberFill: isDark ? '#9ca3af' : '#6b7280', // gray-400 / gray-500
    connection: isDark ? '#9ca3af' : '#6b7280'
  };
}

interface TaskNode {
  id: string;
  ticket: string;
  title: string;
  description: string;
  projectId: string;
  memberId: string;
  memberName: string;
  memberColor: string;
  startDate: string;
  dueDate: string;
  status: string;
  priority: string;
  children: TaskNode[];
  parent?: TaskNode;
  level: number; // Depth in the tree for positioning
  x: number; // Calculated position
  y: number;
}

function countTreeNodes(node: TaskNode | null): number {
  if (!node) return 0;
  return 1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0);
}

/** Expand tiny viewBoxes so SVG scale-to-fit does not blow cards up to fill the panel. */
function padViewBoxForReadableNodes(
  dims: { width: number; height: number; minX: number; minY: number },
  nodeCount: number
): { width: number; height: number; minX: number; minY: number } {
  // Solo trees use empty state; pad only small multi-node diagrams
  if (nodeCount <= 1) return dims;

  const minWidth = nodeCount <= 3 ? 720 : 560;
  const minHeight = nodeCount <= 3 ? 420 : 320;
  const width = Math.max(dims.width, minWidth);
  const height = Math.max(dims.height, minHeight);
  const padX = (width - dims.width) / 2;
  const padY = (height - dims.height) / 2;

  return {
    width,
    height,
    minX: dims.minX - padX,
    minY: dims.minY - padY
  };
}

interface TaskFlowChartProps {
  currentTaskId: string; // Now expects the actual task UUID, not ticket
  currentTaskData: any; // The task object from TaskPage
  /** Increment after local relationship add/remove so the chart refetches. */
  refreshRevision?: number;
}

export default function TaskFlowChart({
  currentTaskId,
  currentTaskData,
  refreshRevision = 0,
}: TaskFlowChartProps) {
  const { t } = useTranslation('tasks');
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const svgColors = getFlowChartSvgColors(isDark);
  const [taskTree, setTaskTree] = useState<TaskNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [descriptionTooltip, setDescriptionTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredTicketId, setHoveredTicketId] = useState<string | null>(null);
  const descriptionTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasPannedRef = useRef(false);
  const tooltipMouseRef = useRef({ x: 0, y: 0 });

  // Build task tree from optimized API response
  const buildTaskTreeFromAPI = async (rootTaskId: string): Promise<{ tasks: Map<string, any>, relationships: any[] }> => {
    
    try {
      const flowData = await getTaskFlowChart(rootTaskId);
      const taskRows = Array.isArray(flowData?.tasks) ? flowData.tasks : [];
      const relRows = Array.isArray(flowData?.relationships) ? flowData.relationships : [];
      
      // Convert tasks array to map for easier lookup
      const tasksMap = new Map();
      taskRows.forEach(task => {
        tasksMap.set(task.id, {
          ...task,
          children: [],
          parents: []
        });
      });
      
      // Build parent-child relationships
      relRows.forEach(rel => {
        const fromId = rel.taskId ?? (rel as { task_id?: string }).task_id;
        const toId = rel.relatedTaskId ?? (rel as { to_task_id?: string }).to_task_id;
        const parentTask = tasksMap.get(fromId);
        const childTask = tasksMap.get(toId);
        
        if (parentTask && childTask && fromId && toId) {
          if (rel.relationship === 'parent') {
            // Current task is parent of related task
            parentTask.children.push(toId);
            childTask.parents.push(fromId);
          } else if (rel.relationship === 'child') {
            // Current task is child of related task
            childTask.children.push(fromId);
            parentTask.parents.push(toId);
          }
        }
      });
      
      // Collect available statuses
      const statuses = new Set<string>();
      taskRows.forEach(task => {
        if (task.status) {
          statuses.add(task.status);
        }
      });
      setAvailableStatuses(Array.from(statuses).sort());
      
      return { tasks: tasksMap, relationships: relRows };
      
    } catch (error) {
      console.error(`❌ TaskFlowChart: Error fetching flow chart data:`, error);
      throw error;
    }
  };

  // Convert the flat task map into a hierarchical tree structure
  const buildHierarchy = (allTasks: Map<string, any>, rootTaskId: string): TaskNode | null => {
    flowLog(`🌲 TaskFlowChart: Starting buildHierarchy with ${allTasks.size} tasks`);
    
    const visited = new Set<string>();
    const MAX_DEPTH = 10; // Prevent deep recursion
    let nodeCount = 0;
    const MAX_NODES = 50; // Prevent too many nodes
    
    const buildNode = (taskId: string, level: number = 0): TaskNode | null => {
      // Safety checks
      if (level > MAX_DEPTH) {
        console.warn(`🚨 TaskFlowChart: Max depth (${MAX_DEPTH}) reached for task ${taskId}`);
        return null;
      }
      
      if (nodeCount > MAX_NODES) {
        console.warn(`🚨 TaskFlowChart: Max nodes (${MAX_NODES}) reached`);
        return null;
      }
      
      if (visited.has(taskId)) {
        console.warn(`🔄 TaskFlowChart: Circular reference detected for task ${taskId} at level ${level}`);
        return null; // Prevent infinite loops
      }
      
      visited.add(taskId);
      nodeCount++;
      
      const taskData = allTasks.get(taskId);
      if (!taskData) {
        console.warn(`❓ TaskFlowChart: No data found for task ${taskId}`);
        return null;
      }
      
      flowLog(`📦 TaskFlowChart: Building node for ${taskData.ticket} (level ${level})`);
      
      // Use the actual task data from the API
      const node: TaskNode = {
        id: taskId,
        ticket: taskData.ticket || `TASK-${taskId.slice(-5)}`,
        title: taskData.title || 'Unknown Task',
        description: taskData.description || '',
        projectId: taskData.projectId || '',
        memberId: taskData.memberId || '',
        memberName: taskData.memberName || 'Unknown',
        memberColor: taskData.memberColor || '#6366F1',
        startDate: taskData.startDate || '',
        dueDate: taskData.dueDate || '',
        status: taskData.status || 'Unknown',
        priority: taskData.priority || 'medium',
        children: [],
        level,
        x: 0, // Will be calculated later
        y: 0
      };
      
      // Recursively build children with safety checks
      if (taskData.children && taskData.children.length > 0) {
        flowLog(`👶 TaskFlowChart: Building ${taskData.children.length} children for ${taskData.ticket}`);
        node.children = taskData.children
          .slice(0, 10) // Limit children to prevent performance issues
          .map((childId: string) => buildNode(childId, level + 1))
          .filter((child: TaskNode | null) => child !== null);
        flowLog(`✅ TaskFlowChart: Built ${node.children.length} children for ${taskData.ticket}`);
      }
      
      return node;
    };
    
    // Find the root of the tree (task with no parents)
    let actualRoot = rootTaskId;
    const taskData = allTasks.get(rootTaskId);
    
    if (taskData && taskData.parents && taskData.parents.length > 0) {
      // Current task has parents, find the ultimate root
      actualRoot = taskData.parents[0]; // Start with first parent
      let depth = 0;
      let currentTask = allTasks.get(actualRoot);
      
      while (currentTask && currentTask.parents && currentTask.parents.length > 0 && depth < 10) {
        depth++;
        actualRoot = currentTask.parents[0];
        currentTask = allTasks.get(actualRoot);
      }
      
      if (depth >= 10) {
        console.warn(`🚨 TaskFlowChart: Hit max depth finding root, using ${actualRoot}`);
      }
    }
    
    flowLog(`🌲 TaskFlowChart: Building tree with root: ${allTasks.get(actualRoot)?.ticket || actualRoot} (requested: ${taskData?.ticket || rootTaskId})`);
    
    const result = buildNode(actualRoot);
    flowLog(`✅ TaskFlowChart: Hierarchy built with ${nodeCount} nodes`);
    return result;
  };

  // Calculate positions for tree layout with better spacing
  const calculatePositions = (node: TaskNode, x: number = 0, y: number = 0): void => {
    const nodeWidth = 200;
    const nodeHeight = 120;
    const horizontalSpacing = 80; // Increased spacing
    const verticalSpacing = 180; // Increased spacing
    
    node.x = x;
    node.y = y;
    
    if (node.children.length === 0) return;
    
    // Calculate total width needed for all children
    const getSubtreeWidth = (n: TaskNode): number => {
      if (n.children.length === 0) return nodeWidth;
      
      let totalChildWidth = 0;
      n.children.forEach(child => {
        totalChildWidth += getSubtreeWidth(child);
      });
      
      // Add spacing between children
      const spacingWidth = (n.children.length - 1) * horizontalSpacing;
      return Math.max(nodeWidth, totalChildWidth + spacingWidth);
    };
    
    const totalWidth = getSubtreeWidth(node);
    let currentX = x - (totalWidth / 2);
    
    node.children.forEach((child) => {
      const childSubtreeWidth = getSubtreeWidth(child);
      const childX = currentX + (childSubtreeWidth / 2);
      const childY = y + nodeHeight + verticalSpacing;
      
      calculatePositions(child, childX, childY);
      currentX += childSubtreeWidth + horizontalSpacing;
    });
  };

  // Load and build the task tree
  const loadTaskTree = useCallback(async (options?: { silent?: boolean }) => {
    if (!currentTaskId) {
      flowLog('❌ TaskFlowChart: No currentTaskId provided');
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      flowLog(`🚀 TaskFlowChart: Building task flow chart for UUID: ${currentTaskId}`);
      flowLog(`🚀 TaskFlowChart: Task ticket: ${currentTaskData?.ticket}`);

      const { tasks: allTasks } = await buildTaskTreeFromAPI(currentTaskId);

      if (allTasks.size === 0) {
        flowLog('📭 TaskFlowChart: No tasks found');
        setTaskTree(null);
        return;
      }

      const tree = buildHierarchy(allTasks, currentTaskId);
      flowLog(`🌲 TaskFlowChart: Tree structure built:`, tree);

      if (tree) {
        calculatePositions(tree, 400, 50);
        setTaskTree(tree);
        flowLog('✅ TaskFlowChart: Task tree built successfully');
      } else {
        flowLog('❌ TaskFlowChart: Failed to build tree structure');
        setError('Failed to build task tree structure');
      }
    } catch (error) {
      console.error('❌ TaskFlowChart: Error building task tree:', error);
      setError('Failed to load task relationships');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [currentTaskId, currentTaskData?.ticket]);

  const loadTaskTreeRef = useRef(loadTaskTree);
  useEffect(() => {
    loadTaskTreeRef.current = loadTaskTree;
  }, [loadTaskTree]);

  const treeTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set<string>();
    if (currentTaskId) ids.add(currentTaskId);
    const walk = (node: TaskNode | null) => {
      if (!node) return;
      ids.add(node.id);
      node.children.forEach(walk);
    };
    walk(taskTree);
    treeTaskIdsRef.current = ids;
  }, [taskTree, currentTaskId]);

  useEffect(() => {
    void loadTaskTree({ silent: refreshRevision > 0 });
  }, [currentTaskId, refreshRevision, loadTaskTree]);

  // Keep chart in sync when relationships change elsewhere (other tabs / kanban link)
  useEffect(() => {
    if (!currentTaskId) return;

    const maybeRefresh = (data: any) => {
      if (!data) return;
      const ids = treeTaskIdsRef.current;
      if (
        data.taskId === currentTaskId ||
        data.toTaskId === currentTaskId ||
        ids.has(data.taskId) ||
        ids.has(data.toTaskId)
      ) {
        void loadTaskTreeRef.current({ silent: true });
      }
    };

    websocketClient.onTaskRelationshipCreated(maybeRefresh);
    websocketClient.onTaskRelationshipDeleted(maybeRefresh);
    return () => {
      websocketClient.offTaskRelationshipCreated(maybeRefresh);
      websocketClient.offTaskRelationshipDeleted(maybeRefresh);
    };
  }, [currentTaskId]);

  // Fullscreen toggle functions
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Navigate to a specific task (ticket + project from the node when available)
  const navigateToTask = useCallback(
    (node: TaskNode) => {
      if (!node.ticket) return;
      const projectId =
        node.projectId ||
        currentTaskData?.projectId ||
        currentTaskData?.project ||
        undefined;
      const url = generateTaskUrl(node.ticket, projectId || undefined);
      flowLog(`🔗 TaskFlowChart: Navigating to task: ${url}`);
      window.location.href = url;
    },
    [currentTaskData]
  );

  // Zoom functions
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 3)); // Max zoom 3x
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 0.3)); // Min zoom 0.3x
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const clearDescriptionTooltipTimer = useCallback(() => {
    if (descriptionTooltipTimerRef.current) {
      clearTimeout(descriptionTooltipTimerRef.current);
      descriptionTooltipTimerRef.current = null;
    }
  }, []);

  const hideDescriptionTooltip = useCallback(() => {
    clearDescriptionTooltipTimer();
    setDescriptionTooltip(null);
  }, [clearDescriptionTooltipTimer]);

  const showDescriptionTooltip = useCallback(
    (node: TaskNode, clientX: number, clientY: number) => {
      const text = plainTextFromHtml(node.description);
      if (!text) {
        hideDescriptionTooltip();
        return;
      }
      tooltipMouseRef.current = { x: clientX, y: clientY };
      clearDescriptionTooltipTimer();
      descriptionTooltipTimerRef.current = setTimeout(() => {
        const { x, y } = tooltipMouseRef.current;
        setDescriptionTooltip({ text, x, y });
      }, CHROME_TOOLTIP_DELAY_MS);
    },
    [clearDescriptionTooltipTimer, hideDescriptionTooltip]
  );

  useEffect(() => () => clearDescriptionTooltipTimer(), [clearDescriptionTooltipTimer]);

  // Pan functions — require a small move before treating as drag so clicks still work
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't start pan when interacting with the ticket link hit-target
    const target = e.target as Element | null;
    if (target?.closest?.('[data-flow-ticket-link="true"]')) {
      return;
    }
    hideDescriptionTooltip();
    panPointerStartRef.current = { x: e.clientX, y: e.clientY };
    hasPannedRef.current = false;
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    e.preventDefault();
  }, [panX, panY, hideDescriptionTooltip]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const start = panPointerStartRef.current;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!hasPannedRef.current) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
      hasPannedRef.current = true;
      setIsDragging(true);
    }

    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  }, [dragStart]);

  const handleMouseUp = useCallback(() => {
    panPointerStartRef.current = null;
    setIsDragging(false);
    // Keep hasPannedRef until next mousedown so click handlers can ignore this gesture
    requestAnimationFrame(() => {
      hasPannedRef.current = false;
    });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.3, Math.min(3, prev + delta)));
  }, []);

  // Handle escape key to exit fullscreen and close dropdowns
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          exitFullscreen();
        } else if (showStatusFilter) {
          setShowStatusFilter(false);
        }
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Close status filter if clicking outside
      if (showStatusFilter) {
        const target = event.target as Element;
        if (!target.closest('[data-status-filter]')) {
          setShowStatusFilter(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('click', handleClickOutside);

    if (isFullscreen) {
      // Prevent body scroll when fullscreen
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('click', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isFullscreen, showStatusFilter, exitFullscreen]);

  // Check if task should be visible based on status filter
  const isTaskVisible = (node: TaskNode): boolean => {
    if (selectedStatuses.length === 0) return true;
    return selectedStatuses.includes(node.status);
  };

  // Render a single task node
  const renderTaskNode = (node: TaskNode) => {
    if (!isTaskVisible(node)) return null;

    const ticketHovered = hoveredTicketId === node.id;
    const ticketFill = ticketHovered ? '#2563eb' : svgColors.ticketFill; // blue-600 on hover

    return (
      <g
        key={node.id}
        onMouseEnter={(e) => {
          showDescriptionTooltip(node, e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          tooltipMouseRef.current = { x: e.clientX, y: e.clientY };
          if (descriptionTooltip) {
            setDescriptionTooltip((prev) =>
              prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
            );
          }
        }}
        onMouseLeave={hideDescriptionTooltip}
      >
        {/* Task box (decorative) */}
        <rect
          x={node.x - 100}
          y={node.y}
          width={200}
          height={100}
          fill={svgColors.nodeFill}
          stroke={node.id === currentTaskId ? svgColors.nodeStrokeCurrent : svgColors.nodeStroke}
          strokeWidth={node.id === currentTaskId ? '3' : '1'}
          rx={8}
          pointerEvents="none"
          className={`drop-shadow-md ${node.id !== currentTaskId ? 'transition-colors' : ''}`}
        />

        {/* Status indicator dot */}
        <circle
          cx={node.x - 85}
          cy={node.y + 15}
          r={4}
          fill={getStatusColor(node.status)}
          pointerEvents="none"
          className="drop-shadow-sm"
        />

        {/* Task ticket (visual) */}
        <text
          x={node.x}
          y={node.y + 20}
          textAnchor="middle"
          fill={ticketFill}
          pointerEvents="none"
          className="text-sm font-bold"
          style={{ textDecoration: ticketHovered ? 'underline' : 'none' }}
        >
          {node.ticket}
        </text>

        {/* Task title */}
        <text
          x={node.x}
          y={node.y + 40}
          textAnchor="middle"
          fill={svgColors.titleFill}
          pointerEvents="none"
          className="text-xs"
        >
          {node.title.length > 25 ? `${node.title.slice(0, 25)}...` : node.title}
        </text>

        {/* Member name */}
        <text
          x={node.x}
          y={node.y + 60}
          textAnchor="middle"
          fill={svgColors.memberFill}
          pointerEvents="none"
          className="text-xs"
        >
          {node.memberName}
        </text>

        {/* Status */}
        <text
          x={node.x}
          y={node.y + 80}
          textAnchor="middle"
          className="text-xs font-medium"
          fill={getStatusColor(node.status)}
          pointerEvents="none"
        >
          {node.status}
        </text>

        {/* Full-card hit target (pan + description hover); below ticket link */}
        <rect
          x={node.x - 100}
          y={node.y}
          width={200}
          height={100}
          fill="transparent"
          className="cursor-grab"
        />

        {/* Ticket link hit-target — opens task page */}
        <rect
          data-flow-ticket-link="true"
          x={node.x - 70}
          y={node.y + 4}
          width={140}
          height={22}
          fill="transparent"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredTicketId(node.id)}
          onMouseLeave={() => setHoveredTicketId(null)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hasPannedRef.current) return;
            hideDescriptionTooltip();
            navigateToTask(node);
          }}
        >
          <title>{node.ticket}</title>
        </rect>
      </g>
    );
  };

  // Get status color
  const getStatusColor = (status: string): string => {
    const colors: { [key: string]: string } = {
      'To Do': '#6B7280',
      'In Progress': '#F59E0B',
      'Testing': '#8B5CF6',
      'Done': '#10B981',
      'Blocked': '#EF4444',
      'Review': '#3B82F6'
    };
    return colors[status] || '#6B7280';
  };

  // Render connection lines between parent and children
  const renderConnections = (node: TaskNode): JSX.Element[] => {
    const connections: JSX.Element[] = [];
    
    if (!isTaskVisible(node)) return connections;
    
    const visibleChildren = node.children.filter(child => isTaskVisible(child));
    
    visibleChildren.forEach((child) => {
      const parentX = node.x;
      const parentY = node.y + 100; // Bottom of parent box
      const childX = child.x;
      const childY = child.y; // Top of child box
      
      // Create curved connection using SVG path
      const midY = parentY + (childY - parentY) / 2;
      
      const pathData = `
        M ${parentX} ${parentY}
        L ${parentX} ${midY}
        L ${childX} ${midY}
        L ${childX} ${childY}
      `;
      
      connections.push(
        <path
          key={`${node.id}-${child.id}`}
          d={pathData}
          stroke={svgColors.connection}
          strokeWidth="2"
          fill="none"
          className="opacity-70"
        />
      );
      
      // Add connection point indicators
      connections.push(
        <circle
          key={`${node.id}-${child.id}-start`}
          cx={parentX}
          cy={parentY}
          r={3}
          fill={svgColors.connection}
          className="opacity-70"
        />
      );
      
      connections.push(
        <circle
          key={`${node.id}-${child.id}-end`}
          cx={childX}
          cy={childY}
          r={3}
          fill={svgColors.connection}
          className="opacity-70"
        />
      );
      
      // Recursively render child connections
      connections.push(...renderConnections(child));
    });
    
    return connections;
  };

  // Calculate SVG dimensions
  const calculateSVGDimensions = (node: TaskNode): { width: number; height: number; minX: number; minY: number } => {
    let minX = node.x - 100;
    let maxX = node.x + 100;
    let minY = node.y;
    let maxY = node.y + 100;
    
    const traverse = (n: TaskNode) => {
      minX = Math.min(minX, n.x - 100);
      maxX = Math.max(maxX, n.x + 100);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + 100);
      
      n.children.forEach(traverse);
    };
    
    traverse(node);
    
    return {
      width: maxX - minX + 40, // Add padding
      height: maxY - minY + 40,
      minX: minX - 20,
      minY: minY - 20
    };
  };

  // Render the chart content
  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-300">{t('flowChart.building')}</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      );
    }

    if (!taskTree) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-300">{t('flowChart.noRelatedTasks')}</p>
        </div>
      );
    }

    const nodeCount = countTreeNodes(taskTree);

    // One node is not a flowchart — show a compact empty state instead of a giant card
    if (nodeCount <= 1) {
      return (
        <div
          className={`flex flex-col items-center justify-center text-center px-6 py-10 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${
            isFullscreen ? 'h-full' : 'min-h-[160px]'
          }`}
        >
          <GitBranch className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-3" />
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {t('flowChart.soloTitle')}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            {t('flowChart.soloDescription')}
          </p>
          {(currentTaskData?.ticket || taskTree.ticket) && (
            <p className="mt-4 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-semibold">{currentTaskData?.ticket || taskTree.ticket}</span>
              {(currentTaskData?.title || taskTree.title) && (
                <span className="text-gray-400 dark:text-gray-500">
                  {' — '}
                  {currentTaskData?.title || taskTree.title}
                </span>
              )}
            </p>
          )}
        </div>
      );
    }

    const { width, height, minX, minY } = padViewBoxForReadableNodes(
      calculateSVGDimensions(taskTree),
      nodeCount
    );

    return (
      <>
      <div 
        className={`w-full overflow-hidden bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${isFullscreen ? 'h-full' : ''} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg 
          width="100%" 
          height="100%" 
          viewBox={`${minX} ${minY} ${width} ${height}`}
          className="min-w-full min-h-full"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {/* Render connections first (behind nodes) */}
          {renderConnections(taskTree)}
          
          {/* Render all nodes */}
          {(() => {
            const nodes: (JSX.Element | null)[] = [];
            const traverse = (node: TaskNode) => {
              const rendered = renderTaskNode(node);
              if (rendered) {
                nodes.push(rendered);
              }
              node.children.forEach(traverse);
            };
            traverse(taskTree);
            return nodes.filter(Boolean);
          })()}
        </svg>
      </div>
      {descriptionTooltip &&
        createPortal(
          <div
            className={`${CHROME_TOOLTIP_MULTILINE_SURFACE_CLASS} max-h-[min(12rem,40vh)] overflow-y-auto`}
            style={{
              position: 'fixed',
              zIndex: 99999,
              left: Math.min(descriptionTooltip.x + 12, window.innerWidth - 16),
              top: Math.min(descriptionTooltip.y + 16, window.innerHeight - 16),
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }}
            role="tooltip"
          >
            {descriptionTooltip.text}
          </div>,
          document.body
        )}
    </>
    );
  };

  const isSoloTree = !loading && !error && taskTree != null && countTreeNodes(taskTree) <= 1;

  // Regular view
  if (!isFullscreen) {
    return (
      <div className="relative">
        {/* Control buttons — hide zoom/filter when there is no diagram to navigate */}
        {!isSoloTree && (
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={zoomOut}
              disabled={zoom <= 0.3}
              className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={t('flowChart.zoomOut')}
            >
              <ZoomOut className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border-x border-gray-200 dark:border-gray-600 min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={zoomIn}
              disabled={zoom >= 3}
              className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={t('flowChart.zoomIn')}
            >
              <ZoomIn className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={resetZoom}
              className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors border-l border-gray-200 dark:border-gray-600"
              title={t('flowChart.resetZoom')}
            >
              <RotateCcw className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
          {/* Status filter button */}
          {availableStatuses.length > 0 && (
            <div className="relative" data-status-filter>
              <button
                onClick={() => setShowStatusFilter(!showStatusFilter)}
                className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                title={t('flowChart.filterByStatus')}
              >
                <Filter className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                {selectedStatuses.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {selectedStatuses.length}
                  </span>
                )}
              </button>
              
              {/* Status filter dropdown */}
              {showStatusFilter && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('flowChart.filterByStatus')}</h3>
                      <button
                        onClick={() => setSelectedStatuses([])}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        {t('flowChart.clearAll')}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableStatuses.map(status => (
                        <label key={status} className="flex items-center">
                          <ModernCheckbox
                            checked={selectedStatuses.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStatuses([...selectedStatuses, status]);
                              } else {
                                setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                              }
                            }}
                            size="sm"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-200 flex items-center">
                            <span 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: getStatusColor(status) }}
                            />
                            {status}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Fullscreen toggle button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            title={t('flowChart.viewFullscreen')}
          >
            <Maximize2 className="h-4 w-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
        )}
        
        {renderChart()}
      </div>
    );
  }

  // Fullscreen view
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center">
      {/* Fullscreen overlay */}
      <div 
        className="absolute inset-0" 
        onClick={exitFullscreen}
      />
      
      {/* Fullscreen content */}
      <div className="relative w-full h-full max-w-7xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <span className="text-blue-600 dark:text-blue-400 mr-2">🌳</span>
              {t('flowChart.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentTaskData?.ticket} - {currentTaskData?.title}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Zoom controls for fullscreen — only when there is a multi-node diagram */}
            {!isSoloTree && (
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={zoomOut}
                disabled={zoom <= 0.3}
                className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('flowChart.zoomOut')}
              >
                <ZoomOut className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border-x border-gray-200 dark:border-gray-600 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </div>
              <button
                onClick={zoomIn}
                disabled={zoom >= 3}
                className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('flowChart.zoomIn')}
              >
                <ZoomIn className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </button>
              <button
                onClick={resetZoom}
                className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors border-l border-gray-200 dark:border-gray-600"
                title={t('flowChart.resetZoom')}
              >
                <RotateCcw className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            )}
            
            <button
              onClick={exitFullscreen}
              className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              title={t('flowChart.exitFullscreen')}
            >
              <Minimize2 className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={exitFullscreen}
              className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              title={t('flowChart.close')}
            >
              <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
        
        {/* Chart content */}
        <div className="flex-1 p-4 overflow-hidden">
          {renderChart()}
        </div>
        
        {/* Footer with instructions */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-center rounded-b-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-block mr-4">
              {t('flowChart.instructions.pressEsc', { key: '' }).split('{{key}}')[0]}
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Esc</kbd>
              {t('flowChart.instructions.pressEsc', { key: '' }).split('{{key}}')[1]}
            </span>
            <span className="inline-block mr-4">
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Mouse Wheel</kbd>
              {' '}
              {t('flowChart.instructions.mouseWheel', { key: '' }).split('{{key}}')[1]}
            </span>
            <span className="inline-block">
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Click & Drag</kbd>
              {' '}
              {t('flowChart.instructions.clickDrag', { key: '' }).split('{{key}}')[1]}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
