import React from 'react';
import { TeamMember, Task, Column, Columns, Priority } from './types';
import TeamMembers from './components/TeamMembers';
import KanbanColumn from './components/Column';
import TaskDetails from './components/TaskDetails';
import { Github } from 'lucide-react';

const INITIAL_COLUMNS: Columns = {
  todo: { id: 'todo', title: 'To Do', tasks: [] },
  progress: { id: 'progress', title: 'In Progress', tasks: [] },
  testing: { id: 'testing', title: 'Testing', tasks: [] },
  completed: { id: 'completed', title: 'Completed', tasks: [] },
};

export default function App() {
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [columns, setColumns] = React.useState<Columns>(INITIAL_COLUMNS);
  const [selectedMember, setSelectedMember] = React.useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = React.useState<string | null>(null);
  const [draggedTask, setDraggedTask] = React.useState<{
    id: string;
    sourceColumnId: string;
    currentIndex: number;
  } | null>(null);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);

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

  const handleAddMember = (member: TeamMember) => {
    setMembers([...members, member]);
    if (!selectedMember) setSelectedMember(member.id);
  };

  const handleRemoveMember = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
    if (selectedMember === id) {
      setSelectedMember(members.length > 1 ? members[0].id : null);
    }
    setColumns(prev => {
      const newColumns = { ...prev };
      Object.keys(newColumns).forEach(columnId => {
        newColumns[columnId].tasks = newColumns[columnId].tasks.filter(
          task => task.memberId !== id
        );
      });
      return newColumns;
    });
  };

  const handleAddColumn = () => {
    const id = crypto.randomUUID();
    setColumns(prev => {
      const entries = Object.entries(prev);
      const newColumns: Columns = {};
      entries.forEach(([key, value], index) => {
        newColumns[key] = value;
        if (index === entries.length - 1) {
          newColumns[id] = { id, title: 'New Column', tasks: [] };
        }
      });
      return newColumns;
    });
  };

  const handleEditColumn = (columnId: string, title: string) => {
    setColumns(prev => ({
      ...prev,
      [columnId]: { ...prev[columnId], title }
    }));
  };

  const handleRemoveColumn = (columnId: string) => {
    const newColumns = { ...columns };
    delete newColumns[columnId];
    setColumns(newColumns);
  };

  const handleAddTask = (columnId: string) => {
    if (!selectedMember) {
      alert('Please select a team member first');
      return;
    }

    const task: Task = {
      id: crypto.randomUUID(),
      title: 'New Task',
      description: 'Task description',
      memberId: selectedMember,
      startDate: new Date().toISOString().split('T')[0],
      effort: 1,
      columnId,
      priority: 'medium' as Priority,
      requesterId: selectedMember,
      comments: []
    };

    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        tasks: [...prev[columnId].tasks, task]
      }
    }));
  };

  const handleCopyTask = (task: Task) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      title: `${task.title} (Copy)`,
      comments: []
    };

    setColumns(prev => ({
      ...prev,
      [task.columnId]: {
        ...prev[task.columnId],
        tasks: [...prev[task.columnId].tasks, newTask]
      }
    }));
  };

  const handleRemoveTask = (taskId: string) => {
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
    setColumns(prev => {
      const newColumns = { ...prev };
      Object.keys(newColumns).forEach(columnId => {
        newColumns[columnId].tasks = newColumns[columnId].tasks.filter(
          task => task.id !== taskId
        );
      });
      return newColumns;
    });
  };

  const handleEditTask = (task: Task) => {
    setColumns(prev => {
      const newColumns = { ...prev };
      Object.keys(newColumns).forEach(columnId => {
        newColumns[columnId].tasks = newColumns[columnId].tasks.map(t =>
          t.id === task.id ? { ...task, columnId } : t
        );
      });
      return newColumns;
    });
    if (selectedTask?.id === task.id) {
      setSelectedTask(task);
    }
  };

  const handleColumnDragStart = (columnId: string) => {
    setDraggedColumn(columnId);
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetColumnId) return;

    setColumns(prev => {
      const entries = Object.entries(prev);
      const draggedIndex = entries.findIndex(([key]) => key === draggedColumn);
      const targetIndex = entries.findIndex(([key]) => key === targetColumnId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newEntries = [...entries];
      const [draggedEntry] = newEntries.splice(draggedIndex, 1);
      newEntries.splice(targetIndex, 0, draggedEntry);
      
      return Object.fromEntries(newEntries);
    });
  };

  const handleTaskDragStart = (taskId: string, sourceColumnId: string, currentIndex: number) => {
    setDraggedTask({ id: taskId, sourceColumnId, currentIndex });
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
    setDraggedColumn(null);
  };

  const handleTaskDragOver = (e: React.DragEvent<HTMLDivElement>, targetColumnId: string, targetIndex: number) => {
    e.preventDefault();
    if (!draggedTask) return;

    const { id: draggedTaskId, sourceColumnId } = draggedTask;

    setColumns(prev => {
      const newColumns = { ...prev };
      const sourceColumn = { ...prev[sourceColumnId] };
      const targetColumn = { ...prev[targetColumnId] };
      
      const taskIndex = sourceColumn.tasks.findIndex(t => t.id === draggedTaskId);
      if (taskIndex === -1) return prev;
      
      const [task] = sourceColumn.tasks.splice(taskIndex, 1);
      const updatedTask = { ...task, columnId: targetColumnId };

      // If targetIndex is -1 or greater than the length of tasks, append to the end
      const finalTargetIndex = targetIndex === -1 || targetIndex >= targetColumn.tasks.length
        ? targetColumn.tasks.length
        : targetIndex;
      
      if (sourceColumnId === targetColumnId) {
        sourceColumn.tasks.splice(finalTargetIndex, 0, updatedTask);
        newColumns[sourceColumnId] = sourceColumn;
      } else {
        targetColumn.tasks.splice(finalTargetIndex, 0, updatedTask);
        newColumns[sourceColumnId] = sourceColumn;
        newColumns[targetColumnId] = targetColumn;
      }

      return newColumns;
    });

    setDraggedTask({
      id: draggedTaskId,
      sourceColumnId: targetColumnId,
      currentIndex: targetIndex
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow-md">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <a href="https://drenlia.com" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-700">
              Drenlia Inc.
            </a>
          </div>
          <a
            href="https://github.com/DanielAtDrenlia/easy-kanban"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-900"
          >
            <Github size={24} />
          </a>
        </div>
      </header>

      <div className={`flex-1 p-6 ${selectedTask ? 'pr-96' : ''}`}>
        <div className="max-w-[1400px] mx-auto">
          <TeamMembers
            members={members}
            selectedMember={selectedMember}
            onSelectMember={setSelectedMember}
            onAdd={handleAddMember}
            onRemove={handleRemoveMember}
          />

          <h1 className="text-2xl font-bold text-gray-800 mb-6">Project Board</h1>

          <div style={gridStyle}>
            {Object.values(columns).map(column => (
              <KanbanColumn
                key={column.id}
                column={column}
                members={members}
                selectedMember={selectedMember}
                onAddTask={handleAddTask}
                onRemoveTask={handleRemoveTask}
                onEditTask={handleEditTask}
                onCopyTask={handleCopyTask}
                onEditColumn={handleEditColumn}
                onRemoveColumn={handleRemoveColumn}
                onAddColumn={handleAddColumn}
                onDragStart={handleColumnDragStart}
                onDragOver={handleColumnDragOver}
                onTaskDragStart={handleTaskDragStart}
                onTaskDragEnd={handleTaskDragEnd}
                onTaskDragOver={handleTaskDragOver}
                onSelectTask={setSelectedTask}
              />
            ))}
          </div>
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
    </div>
  );
}
