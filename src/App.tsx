import React, { useState, useEffect, useCallback } from 'react';
import { TeamMember, Task, Column, Columns, Priority, Board } from './types';
import TeamMembers from './components/TeamMembers';
import KanbanColumn from './components/Column';
import TaskDetails from './components/TaskDetails';
import BoardTabs from './components/BoardTabs';
import HelpModal from './components/HelpModal';
import DebugPanel from './components/DebugPanel';
import ResetCountdown from './components/ResetCountdown';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { Github, HelpCircle } from 'lucide-react';
import * as api from './api';
import { useLoadingState } from './hooks/useLoadingState';
import { TaskSchema, MemberSchema, BoardSchema, ColumnSchema } from './validation/schemas';
import { z } from 'zod';
import { generateUUID } from './utils/uuid';

interface QueryLog {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'ERROR';
  query: string;
  timestamp: string;
  error?: string;
}

const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'progress', title: 'In Progress' },
  { id: 'testing', title: 'Testing' },
  { id: 'completed', title: 'Completed' }
];

export default function App() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [columns, setColumns] = useState<Columns>({});
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [queryLogs, setQueryLogs] = useState<QueryLog[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const { loading, withLoading } = useLoadingState();

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      await withLoading('general', async () => {
        try {
          const [loadedMembers, loadedBoards] = await Promise.all([
            api.getMembers(),
            api.getBoards()
          ]);
          
          setMembers(loadedMembers);
          setBoards(loadedBoards);
          
          if (loadedBoards.length > 0) {
            setSelectedBoard(loadedBoards[0].id);
            setColumns(loadedBoards[0].columns || {});
          }

          if (loadedMembers.length > 0) {
            setSelectedMember(loadedMembers[0].id);
          }
        } catch (error) {
          console.error('Failed to load initial data:', error);
        }
      });
      await fetchQueryLogs();
    };

    loadInitialData();
  }, []);

  // Update columns when selected board changes
  useEffect(() => {
    if (selectedBoard) {
      // Always refresh board data from server when switching boards
      // This ensures we have the latest data including new tasks
      refreshBoardData();
    }
  }, [selectedBoard]);

  const refreshBoardData = async () => {
    try {
      const loadedBoards = await api.getBoards();
      setBoards(loadedBoards);
      
      if (selectedBoard) {
        const board = loadedBoards.find(b => b.id === selectedBoard);
        if (board) {
          setColumns(board.columns || {});
        }
      }
    } catch (error) {
      console.error('Failed to refresh board data:', error);
    }
  };

  const fetchQueryLogs = async () => {
    try {
      const logs = await api.getQueryLogs();
      setQueryLogs(logs);
    } catch (error) {
      console.error('Failed to fetch query logs:', error);
    }
  };

  const handleAddMember = async (member: TeamMember) => {
    try {
      // Validate input
      const validatedMember = MemberSchema.parse(member);
      
      await withLoading('members', async () => {
        const createdMember = await api.createMember(validatedMember);
        setMembers([...members, createdMember]);
        if (!selectedMember) setSelectedMember(createdMember.id);
        await fetchQueryLogs();
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.errors);
        alert('Validation error: ' + error.errors.map(e => e.message).join(', '));
      } else {
        console.error('Failed to add member:', error);
      }
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await api.deleteMember(id);
      setMembers(members.filter(m => m.id !== id));
      if (selectedMember === id) {
        setSelectedMember(members.length > 1 ? members[0].id : null);
      }
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleAddBoard = async () => {
    try {
      const boardId = generateUUID();
      const newBoard: Board = {
        id: boardId,
        title: 'New Board',
        columns: {}
      };

      // Create the board first
      const createdBoard = await api.createBoard(newBoard);

      // Create default columns for the new board
      const columnPromises = DEFAULT_COLUMNS.map(async col => {
        const column: Column = {
          id: `${col.id}-${boardId}`,
          title: col.title,
          tasks: [],
          boardId: boardId
        };
        return api.createColumn(column);
      });

      await Promise.all(columnPromises);

      // Refresh board data to get the complete structure
      await refreshBoardData();
      
      // Set the new board as selected
      setSelectedBoard(boardId);
      
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to add board:', error);
    }
  };

  const handleEditBoard = async (boardId: string, title: string) => {
    try {
      await api.updateBoard(boardId, title);
      setBoards(prev => prev.map(b => 
        b.id === boardId ? { ...b, title } : b
      ));
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to update board:', error);
    }
  };

  const handleRemoveBoard = async (boardId: string) => {
    if (boards.length <= 1) {
      alert('Cannot delete the last board');
      return;
    }

    try {
      await api.deleteBoard(boardId);
      const newBoards = boards.filter(b => b.id !== boardId);
      setBoards(newBoards);
      
      if (selectedBoard === boardId) {
        const firstBoard = newBoards[0];
        setSelectedBoard(firstBoard.id);
        setColumns(firstBoard.columns);
      }
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to remove board:', error);
    }
  };

  const handleAddTask = async (columnId: string) => {
    if (!selectedMember || !selectedBoard) return;

    const columnTasks = [...(columns[columnId]?.tasks || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    const newTask: Task = {
      id: generateUUID(),
      title: 'New Task',
      description: 'Task description',
      memberId: selectedMember,
      startDate: new Date().toISOString().split('T')[0],
      effort: 1,
      columnId,
      position: 0,
      priority: 'medium' as Priority,
      requesterId: selectedMember,
      boardId: selectedBoard,
      comments: []
    };

    // Optimistic update
    const updatedTasks = [newTask, ...columnTasks.map((task, index) => ({
      ...task,
      position: (index + 1) * 1000
    }))];
    
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: updatedTasks
      }
    }));

    try {
      await withLoading('tasks', async () => {
        await api.createTask(newTask);
        
        if (columnTasks.length > 0) {
          const updatePromises = columnTasks.map((task, index) => 
            api.updateTask({ ...task, position: (index + 1) * 1000 })
          );
          await Promise.all(updatePromises);
        }
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      // Rollback by refreshing
      await refreshBoardData();
    }
  };

  const handleEditTask = async (task: Task) => {
    // Optimistic update
    const previousColumns = { ...columns };
    
    // Update UI immediately
    setColumns(prev => ({
      ...prev,
      [task.columnId]: {
        ...prev[task.columnId],
        tasks: prev[task.columnId].tasks.map(t => 
          t.id === task.id ? task : t
        )
      }
    }));
    
    try {
      await withLoading('tasks', async () => {
        await api.updateTask(task);
        await fetchQueryLogs();
      });
    } catch (error) {
      // Rollback on error
      setColumns(previousColumns);
      console.error('Failed to update task:', error);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to remove task:', error);
    }
  };

  const handleCopyTask = async (task: Task) => {
    const newTask: Task = {
      ...task,
      id: generateUUID(),
      title: `${task.title} (Copy)`,
      comments: []
    };

    try {
      const createdTask = await api.createTask(newTask);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to copy task:', error);
    }
  };

  const handleTaskDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
  };

  const handleTaskDragOver = (e: React.DragEvent, columnId: string, index: number) => {
    e.preventDefault();
  };

  const handleTaskDrop = async (columnId: string, index: number) => {
    if (!draggedTask) return;

    const sourceColumnId = draggedTask.columnId;
    const sourceColumn = columns[sourceColumnId];
    const targetColumn = columns[columnId];
    
    if (!sourceColumn || !targetColumn) return;

    // Remove task from source
    const sourceTasks = sourceColumn.tasks.filter(t => t.id !== draggedTask.id);
    
    // Get target tasks
    const targetTasks = sourceColumnId === columnId 
      ? sourceTasks 
      : [...targetColumn.tasks];

    // Create updated task with new position
    const updatedTask = {
      ...draggedTask,
      columnId,
      position: index
    };

    // Insert task at new position
    targetTasks.splice(index, 0, updatedTask);

    // Update positions for all affected tasks
    const updatePositions = (tasks: Task[]): Task[] => {
      return tasks.map((task, idx) => ({
        ...task,
        position: idx * 1000  // Use larger intervals for positions
      }));
    };

    const updatedSourceTasks = updatePositions(sourceTasks);
    const updatedTargetTasks = updatePositions(targetTasks);

    // Update UI first
    setColumns(prev => ({
      ...prev,
      [sourceColumnId]: {
        ...sourceColumn,
        tasks: updatedSourceTasks
      },
      [columnId]: {
        ...targetColumn,
        tasks: updatedTargetTasks
      }
    }));

    // Then update database
    try {
      // First update the moved task
      await api.updateTask(updatedTask);
      
      // Then update all other affected tasks
      const promises = [];
      
      // Update source column tasks if different from target
      if (sourceColumnId !== columnId) {
        promises.push(...updatedSourceTasks.map(task => api.updateTask(task)));
      }
      
      // Update target column tasks
      promises.push(...updatedTargetTasks
        .filter(task => task.id !== updatedTask.id)
        .map(task => api.updateTask(task)));

      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to update task positions:', error);
      await refreshBoardData();
    }

    setDraggedTask(null);
  };

  const handleEditColumn = async (columnId: string, title: string) => {
    try {
      await api.updateColumn(columnId, title);
      setColumns(prev => ({
        ...prev,
        [columnId]: { ...prev[columnId], title }
      }));
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  };

  const handleRemoveColumn = async (columnId: string) => {
    try {
      await api.deleteColumn(columnId);
      const { [columnId]: removed, ...remainingColumns } = columns;
      setColumns(remainingColumns);
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  const handleAddColumn = async () => {
    if (!selectedBoard) return;

    const columnId = generateUUID();
    const newColumn: Column = {
      id: columnId,
      title: 'New Column',
      tasks: [],
      boardId: selectedBoard
    };

    try {
      const createdColumn = await api.createColumn(newColumn);
      await refreshBoardData(); // Refresh to ensure consistent state
      await fetchQueryLogs();
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  // Calculate grid columns based on number of columns
  const columnCount = Object.keys(columns).length;
  const gridCols = columnCount <= 4 ? 4 : Math.min(6, columnCount);
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, minmax(300px, 1fr))`,
    gap: '1.5rem',
    width: '100%',
    overflowX: 'auto'
  };

  const clearQueryLogs = async () => {
    setQueryLogs([]);
  };

  // Get debug parameter from URL
  const showDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  // Keyboard shortcut for help (F1)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setShowHelpModal(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {process.env.DEMO_ENABLED === 'true' && <ResetCountdown />}
      <header className="bg-white shadow-md">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="https://drenlia.com" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-700">
              Drenlia Inc.
            </a>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600 hover:text-gray-900"
              title="Help (F1)"
            >
              <HelpCircle size={24} />
            </button>
            <a
              href="https://github.com/drenlia/easy-kanban"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900"
            >
              <Github size={24} />
            </a>
          </div>
        </div>
      </header>

      <div className={`flex-1 p-6 ${selectedTask ? 'pr-96' : ''}`}>
        <div className="max-w-[1400px] mx-auto">
          {loading.general ? (
            <LoadingSpinner size="large" className="mt-20" />
          ) : (
            <>
              <TeamMembers
                members={members}
                selectedMember={selectedMember}
                onSelectMember={setSelectedMember}
                onAdd={handleAddMember}
                onRemove={handleRemoveMember}
              />

              {/* Board Tabs */}
              <BoardTabs
                boards={boards}
                selectedBoard={selectedBoard}
                onSelectBoard={setSelectedBoard}
                onAddBoard={handleAddBoard}
                onEditBoard={handleEditBoard}
                onRemoveBoard={handleRemoveBoard}
              />

              {selectedBoard && (
                <div className="relative">
                  {(loading.tasks || loading.boards || loading.columns) && (
                    <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
                      <LoadingSpinner size="medium" />
                    </div>
                  )}
                  <div style={gridStyle}>
              {Object.values(columns).map(column => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  members={members}
                  selectedMember={selectedMember}
                  draggedTask={draggedTask}
                  onAddTask={handleAddTask}
                  onRemoveTask={handleRemoveTask}
                  onEditTask={handleEditTask}
                  onCopyTask={handleCopyTask}
                  onEditColumn={handleEditColumn}
                  onRemoveColumn={handleRemoveColumn}
                  onAddColumn={handleAddColumn}
                  onTaskDragStart={handleTaskDragStart}
                  onTaskDragEnd={handleTaskDragEnd}
                  onTaskDragOver={handleTaskDragOver}
                  onTaskDrop={handleTaskDrop}
                  onSelectTask={setSelectedTask}
                />
              ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedTask && (
        <div className="fixed top-0 right-0 h-full">
          <TaskDetails
            task={selectedTask}
            members={members}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleEditTask}
          />
        </div>
      )}

      {showDebug && (
        <DebugPanel
          logs={queryLogs}
          onClear={clearQueryLogs}
        />
      )}

      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
}
