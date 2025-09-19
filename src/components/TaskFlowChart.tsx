import React, { useState, useEffect, useCallback } from 'react';
import { getTaskFlowChart } from '../api';
import { Maximize2, Minimize2, X, Filter, ChevronDown, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface TaskNode {
  id: string;
  ticket: string;
  title: string;
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

interface TaskFlowChartProps {
  currentTaskId: string; // Now expects the actual task UUID, not ticket
  currentTaskData: any; // The task object from TaskPage
}

export default function TaskFlowChart({ currentTaskId, currentTaskData }: TaskFlowChartProps) {
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

  // Build task tree from optimized API response
  const buildTaskTreeFromAPI = async (rootTaskId: string): Promise<{ tasks: Map<string, any>, relationships: any[] }> => {
    console.log(`🚀 TaskFlowChart: Fetching flow chart data for: ${rootTaskId}`);
    
    try {
      const flowData = await getTaskFlowChart(rootTaskId);
      console.log(`✅ TaskFlowChart: Received flow data:`, flowData);
      
      // Convert tasks array to map for easier lookup
      const tasksMap = new Map();
      flowData.tasks.forEach(task => {
        tasksMap.set(task.id, {
          ...task,
          children: [],
          parents: []
        });
      });
      
      // Build parent-child relationships
      flowData.relationships.forEach(rel => {
        const parentTask = tasksMap.get(rel.taskId);
        const childTask = tasksMap.get(rel.relatedTaskId);
        
        if (parentTask && childTask) {
          if (rel.relationship === 'parent') {
            // Current task is parent of related task
            parentTask.children.push(rel.relatedTaskId);
            childTask.parents.push(rel.taskId);
          } else if (rel.relationship === 'child') {
            // Current task is child of related task
            childTask.children.push(rel.taskId);
            parentTask.parents.push(rel.relatedTaskId);
          }
        }
      });
      
      // Collect available statuses
      const statuses = new Set<string>();
      flowData.tasks.forEach(task => {
        if (task.status) {
          statuses.add(task.status);
        }
      });
      setAvailableStatuses(Array.from(statuses).sort());
      
      console.log(`🌳 TaskFlowChart: Built tree with ${tasksMap.size} tasks and ${flowData.relationships.length} relationships`);
      console.log(`🎯 TaskFlowChart: Available statuses:`, Array.from(statuses));
      return { tasks: tasksMap, relationships: flowData.relationships };
      
    } catch (error) {
      console.error(`❌ TaskFlowChart: Error fetching flow chart data:`, error);
      throw error;
    }
  };

  // Convert the flat task map into a hierarchical tree structure
  const buildHierarchy = (allTasks: Map<string, any>, rootTaskId: string): TaskNode | null => {
    console.log(`🌲 TaskFlowChart: Starting buildHierarchy with ${allTasks.size} tasks`);
    
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
      
      console.log(`📦 TaskFlowChart: Building node for ${taskData.ticket} (level ${level})`);
      
      // Use the actual task data from the API
      const node: TaskNode = {
        id: taskId,
        ticket: taskData.ticket || `TASK-${taskId.slice(-5)}`,
        title: taskData.title || 'Unknown Task',
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
        console.log(`👶 TaskFlowChart: Building ${taskData.children.length} children for ${taskData.ticket}`);
        node.children = taskData.children
          .slice(0, 10) // Limit children to prevent performance issues
          .map((childId: string) => buildNode(childId, level + 1))
          .filter((child: TaskNode | null) => child !== null);
        console.log(`✅ TaskFlowChart: Built ${node.children.length} children for ${taskData.ticket}`);
      }
      
      return node;
    };
    
    // Find the root of the tree (task with no parents)
    let actualRoot = rootTaskId;
    const taskData = allTasks.get(rootTaskId);
    console.log(`🔍 TaskFlowChart: Root task data:`, taskData ? { ticket: taskData.ticket, parents: taskData.parents?.length || 0 } : 'NOT FOUND');
    
    if (taskData && taskData.parents && taskData.parents.length > 0) {
      console.log(`🔍 TaskFlowChart: Current task has ${taskData.parents.length} parents, finding ultimate root`);
      // Current task has parents, find the ultimate root
      actualRoot = taskData.parents[0]; // Start with first parent
      let depth = 0;
      let currentTask = allTasks.get(actualRoot);
      
      while (currentTask && currentTask.parents && currentTask.parents.length > 0 && depth < 10) {
        depth++;
        actualRoot = currentTask.parents[0];
        currentTask = allTasks.get(actualRoot);
        console.log(`🔍 TaskFlowChart: Going up tree, depth ${depth}, found parent: ${currentTask?.ticket || actualRoot}`);
      }
      
      if (depth >= 10) {
        console.warn(`🚨 TaskFlowChart: Hit max depth finding root, using ${actualRoot}`);
      }
    }
    
    console.log(`🌲 TaskFlowChart: Building tree with root: ${allTasks.get(actualRoot)?.ticket || actualRoot} (requested: ${taskData?.ticket || rootTaskId})`);
    
    const result = buildNode(actualRoot);
    console.log(`✅ TaskFlowChart: Hierarchy built with ${nodeCount} nodes`);
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
  useEffect(() => {
    const loadTaskTree = async () => {
      if (!currentTaskId) {
        console.log('❌ TaskFlowChart: No currentTaskId provided');
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        console.log(`🚀 TaskFlowChart: Building task flow chart for UUID: ${currentTaskId}`);
        console.log(`🚀 TaskFlowChart: Task ticket: ${currentTaskData?.ticket}`);
        
        // Step 1: Get all flow chart data in one optimized API call
        const { tasks: allTasks } = await buildTaskTreeFromAPI(currentTaskId);
        
        if (allTasks.size === 0) {
          console.log('📭 TaskFlowChart: No tasks found');
          setTaskTree(null);
          return;
        }
        
        // Step 2: Build hierarchical tree structure
        const tree = buildHierarchy(allTasks, currentTaskId);
        console.log(`🌲 TaskFlowChart: Tree structure built:`, tree);
        
        if (tree) {
          // Step 3: Calculate positions
          calculatePositions(tree, 400, 50); // Start at center-top
          setTaskTree(tree);
          console.log('✅ TaskFlowChart: Task tree built successfully');
        } else {
          console.log('❌ TaskFlowChart: Failed to build tree structure');
          setError('Failed to build task tree structure');
        }
        
      } catch (error) {
        console.error('❌ TaskFlowChart: Error building task tree:', error);
        setError('Failed to load task relationships');
      } finally {
        setLoading(false);
      }
    };
    
    loadTaskTree();
  }, [currentTaskId]);

  // Fullscreen toggle functions
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Navigate to a specific task
  const navigateToTask = useCallback((taskId: string, projectId?: string) => {
    if (projectId) {
      // Get the task data to find the ticket
      const taskData = taskTree && findTaskInTree(taskTree, taskId);
      if (taskData?.ticket) {
        const url = `#${projectId}#${taskData.ticket}`;
        console.log(`🔗 TaskFlowChart: Navigating to task: ${url}`);
        window.location.hash = url;
      }
    }
  }, [taskTree]);

  // Helper function to find task in tree
  const findTaskInTree = (node: TaskNode, targetId: string): TaskNode | null => {
    if (node.id === targetId) return node;
    
    for (const child of node.children) {
      const found = findTaskInTree(child, targetId);
      if (found) return found;
    }
    
    return null;
  };

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

  // Pan functions
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
      e.preventDefault();
    }
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
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

    return (
      <g key={node.id}>
        {/* Clickable overlay */}
        <rect
          x={node.x - 100}
          y={node.y}
          width={200}
          height={100}
          fill="transparent"
          className="cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only navigate if we're not dragging
            if (!isDragging) {
              const projectId = currentTaskData?.projectId || currentTaskData?.project;
              navigateToTask(node.id, projectId);
            }
          }}
        />
        
        {/* Task box */}
        <rect
          x={node.x - 100} // Center the box (width/2)
          y={node.y}
          width={200}
          height={100}
          fill="white"
          stroke={node.id === currentTaskId ? "#3B82F6" : "#D1D5DB"}
          strokeWidth={node.id === currentTaskId ? "3" : "1"}
          rx={8}
          className={`drop-shadow-md ${node.id !== currentTaskId ? 'hover:stroke-blue-400 transition-colors cursor-pointer' : ''}`}
        />
        
        {/* Status indicator dot */}
        <circle
          cx={node.x - 85}
          cy={node.y + 15}
          r={4}
          fill={getStatusColor(node.status)}
          className="drop-shadow-sm"
        />
        
        {/* Task ticket */}
        <text
          x={node.x}
          y={node.y + 20}
          textAnchor="middle"
          className="text-sm font-bold fill-gray-900 pointer-events-none"
        >
          {node.ticket}
        </text>
        
        {/* Task title */}
        <text
          x={node.x}
          y={node.y + 40}
          textAnchor="middle"
          className="text-xs fill-gray-700 pointer-events-none"
        >
          {node.title.length > 25 ? `${node.title.slice(0, 25)}...` : node.title}
        </text>
        
        {/* Member name */}
        <text
          x={node.x}
          y={node.y + 60}
          textAnchor="middle"
          className="text-xs fill-gray-500 pointer-events-none"
        >
          {node.memberName}
        </text>
        
        {/* Status */}
        <text
          x={node.x}
          y={node.y + 80}
          textAnchor="middle"
          className="text-xs font-medium pointer-events-none"
          fill={getStatusColor(node.status)}
        >
          {node.status}
        </text>
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
    
    visibleChildren.forEach((child, index) => {
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
          stroke="#6B7280"
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
          fill="#6B7280"
          className="opacity-70"
        />
      );
      
      connections.push(
        <circle
          key={`${node.id}-${child.id}-end`}
          cx={childX}
          cy={childY}
          r={3}
          fill="#6B7280"
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Building task flow chart...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
        </div>
      );
    }

    if (!taskTree) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-600">No related tasks found. This task has no parent or child relationships.</p>
        </div>
      );
    }

    const { width, height, minX, minY } = calculateSVGDimensions(taskTree);

    return (
      <div 
        className={`w-full overflow-hidden bg-gray-50 rounded-lg border ${isFullscreen ? 'h-full' : ''} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
            const nodes: JSX.Element[] = [];
            const traverse = (node: TaskNode) => {
              nodes.push(renderTaskNode(node));
              node.children.forEach(traverse);
            };
            traverse(taskTree);
            return nodes;
          })()}
        </svg>
      </div>
    );
  };

  // Regular view
  if (!isFullscreen) {
    return (
      <div className="relative">
        {/* Control buttons */}
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={zoomOut}
              disabled={zoom <= 0.3}
              className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4 text-gray-600" />
            </button>
            <div className="px-2 py-1 text-xs text-gray-600 bg-gray-50 border-x border-gray-200 min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={zoomIn}
              disabled={zoom >= 3}
              className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={resetZoom}
              className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors border-l border-gray-200"
              title="Reset zoom and pan"
            >
              <RotateCcw className="h-4 w-4 text-gray-600" />
            </button>
          </div>
          {/* Status filter button */}
          {availableStatuses.length > 0 && (
            <div className="relative" data-status-filter>
              <button
                onClick={() => setShowStatusFilter(!showStatusFilter)}
                className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                title="Filter by status"
              >
                <Filter className="h-4 w-4 text-gray-600" />
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
                      <h3 className="text-sm font-medium text-gray-700">Filter by Status</h3>
                      <button
                        onClick={() => setSelectedStatuses([])}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableStatuses.map(status => (
                        <label key={status} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStatuses([...selectedStatuses, status]);
                              } else {
                                setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700 flex items-center">
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
            className="p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            title="View in fullscreen"
          >
            <Maximize2 className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        
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
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <span className="text-blue-600 mr-2">🌳</span>
              Task Flow Chart
            </h2>
            <p className="text-sm text-gray-600">
              {currentTaskData?.ticket} - {currentTaskData?.title}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Zoom controls for fullscreen */}
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={zoomOut}
                disabled={zoom <= 0.3}
                className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4 text-gray-600" />
              </button>
              <div className="px-2 py-1 text-xs text-gray-600 bg-gray-50 border-x border-gray-200 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </div>
              <button
                onClick={zoomIn}
                disabled={zoom >= 3}
                className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={resetZoom}
                className="p-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors border-l border-gray-200"
                title="Reset zoom and pan"
              >
                <RotateCcw className="h-4 w-4 text-gray-600" />
              </button>
            </div>
            
            <button
              onClick={exitFullscreen}
              className="p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              title="Exit fullscreen (Esc)"
            >
              <Minimize2 className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={exitFullscreen}
              className="p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Chart content */}
        <div className="flex-1 p-4 overflow-hidden">
          {renderChart()}
        </div>
        
        {/* Footer with instructions */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 text-center rounded-b-lg">
          <p className="text-xs text-gray-500">
            <span className="inline-block mr-4">
              Press <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-xs">Esc</kbd> or click outside to exit
            </span>
            <span className="inline-block mr-4">
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Mouse Wheel</kbd> to zoom
            </span>
            <span className="inline-block">
              <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Click & Drag</kbd> to pan
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
