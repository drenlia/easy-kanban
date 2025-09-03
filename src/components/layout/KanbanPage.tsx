import React from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { 
  CurrentUser, 
  TeamMember, 
  Board, 
  Task, 
  Columns, 
  PriorityOption 
} from '../../types';
import { TaskViewMode } from '../../utils/userPreferences';
import TeamMembers from '../TeamMembers';
import Tools from '../Tools';
import SearchInterface from '../SearchInterface';
import KanbanColumn from '../Column';
import TaskCard from '../TaskCard';
import BoardTabs from '../BoardTabs';
import LoadingSpinner from '../LoadingSpinner';


interface KanbanPageProps {
  currentUser: CurrentUser | null;
  selectedTask: Task | null;
  loading: {
    general: boolean;
    tasks: boolean;
    boards: boolean;
    columns: boolean;
  };
  members: TeamMember[];
  boards: Board[];
  selectedBoard: string | null;
  columns: Columns;
  selectedMembers: string[];
  draggedTask: Task | null;
  draggedColumn: any;
  dragPreview: any;
  availablePriorities: PriorityOption[];
  taskViewMode: TaskViewMode;
  isSearchActive: boolean;
  searchFilters: any;
  filteredColumns: Columns;
  activeFilters: boolean;
  gridStyle: React.CSSProperties;
  sensors: any;
  collisionDetection: any;

  
  // Event handlers
  onSelectMember: (memberId: string) => void;
  onClearMemberSelections: () => void;
  onSelectAllMembers: () => void;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  onToggleAssignees: (include: boolean) => void;
  onToggleWatchers: (include: boolean) => void;
  onToggleCollaborators: (include: boolean) => void;
  onToggleRequesters: (include: boolean) => void;
  onToggleTaskViewMode: () => void;
  onToggleSearch: () => void;
  onSearchFiltersChange: (filters: any) => void;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => Promise<void>;
  onEditBoard: (boardId: string, title: string) => Promise<void>;
  onRemoveBoard: (boardId: string) => Promise<void>;
  onReorderBoards: (boardId: string, newPosition: number) => Promise<void>;
  getTaskCountForBoard: (board: Board) => number;
  onDragStart: (event: any) => void;
  onDragOver: (event: any) => void;
  onDragEnd: (event: any) => void;
  onAddTask: (columnId: string) => Promise<void>;
  columnWarnings: {[columnId: string]: string};
  onDismissColumnWarning: (columnId: string) => void;
  onRemoveTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => Promise<void>;
  onCopyTask: (task: Task) => Promise<void>;
  onEditColumn: (columnId: string, title: string) => Promise<void>;
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: () => Promise<void>;
  onTaskDragStart: (task: Task) => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onTaskDrop: () => Promise<void>;
  onSelectTask: (task: Task | null) => void;
}

const KanbanPage: React.FC<KanbanPageProps> = ({
  currentUser,
  selectedTask,
  loading,
  members,
  boards,
  selectedBoard,
  columns,
  selectedMembers,
  draggedTask,
  draggedColumn,
  dragPreview,
  availablePriorities,
  taskViewMode,
  isSearchActive,
  searchFilters,
  filteredColumns,
  activeFilters,
  gridStyle,
  sensors,
  collisionDetection,
  onSelectMember,
  onClearMemberSelections,
  onSelectAllMembers,
  includeAssignees,
  includeWatchers,
  includeCollaborators,
  includeRequesters,
  onToggleAssignees,
  onToggleWatchers,
  onToggleCollaborators,
  onToggleRequesters,
  onToggleTaskViewMode,
  onToggleSearch,
  onSearchFiltersChange,
  onSelectBoard,
  onAddBoard,
  onEditBoard,
  onRemoveBoard,
  onReorderBoards,
  getTaskCountForBoard,
  onDragStart,
  onDragOver,
  onDragEnd,
  onAddTask,
  columnWarnings,
  onDismissColumnWarning,
  onRemoveTask,
  onEditTask,
  onCopyTask,
  onEditColumn,
  onRemoveColumn,
  onAddColumn,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  onSelectTask,
}) => {
  if (loading.general) {
    return <LoadingSpinner size="large" className="mt-20" />;
  }

  return (
    <>
      {/* Tools and Team Members in a flex container */}
      <div className="flex gap-4 mb-4">
        <Tools 
          taskViewMode={taskViewMode}
          onToggleTaskViewMode={onToggleTaskViewMode}
          isSearchActive={isSearchActive}
          onToggleSearch={onToggleSearch}
        />
        <div className="flex-1">
          <TeamMembers
            members={members}
            selectedMembers={selectedMembers}
            onSelectMember={onSelectMember}
            onClearSelections={onClearMemberSelections}
            onSelectAll={onSelectAllMembers}
            includeAssignees={includeAssignees}
            includeWatchers={includeWatchers}
            includeCollaborators={includeCollaborators}
            includeRequesters={includeRequesters}
            onToggleAssignees={onToggleAssignees}
            onToggleWatchers={onToggleWatchers}
            onToggleCollaborators={onToggleCollaborators}
            onToggleRequesters={onToggleRequesters}
            currentUserId={currentUser?.id}
          />
        </div>
      </div>

      {/* Search Interface */}
      {isSearchActive && (
        <SearchInterface
          filters={searchFilters}
          availablePriorities={availablePriorities}
          onFiltersChange={onSearchFiltersChange}
        />
      )}

      {/* Board Tabs */}
      <BoardTabs
        boards={boards}
        selectedBoard={selectedBoard}
        onSelectBoard={onSelectBoard}
        onAddBoard={onAddBoard}
        onEditBoard={onEditBoard}
        onRemoveBoard={onRemoveBoard}
        onReorderBoards={onReorderBoards}
        isAdmin={currentUser?.roles?.includes('admin')}
        getFilteredTaskCount={getTaskCountForBoard}
        hasActiveFilters={activeFilters}
      />

      {selectedBoard && (
        <div className="relative">
          {(loading.tasks || loading.boards || loading.columns) && (
            <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
              <LoadingSpinner size="medium" />
            </div>
          )}
          
          {/* Unified Drag and Drop Context */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            {/* Admin view with column drag and drop */}
            {currentUser?.roles?.includes('admin') ? (
              <SortableContext
                items={Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(col => col.id)}
                strategy={rectSortingStrategy}
              >
                <div style={gridStyle}>
                  {Object.values(columns)
                    .sort((a, b) => (a.position || 0) - (b.position || 0))
                    .map(column => (
                                          <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      selectedMembers={selectedMembers}
                      selectedTask={selectedTask}
                      draggedTask={draggedTask}
                      draggedColumn={draggedColumn}
                      dragPreview={dragPreview}
                      onAddTask={onAddTask}
                      columnWarnings={columnWarnings}
                      onDismissColumnWarning={onDismissColumnWarning}
                      onRemoveTask={onRemoveTask}
                      onEditTask={onEditTask}
                      onCopyTask={onCopyTask}
                      onEditColumn={onEditColumn}
                      onRemoveColumn={onRemoveColumn}
                      onAddColumn={onAddColumn}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={true}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                    />
                    ))}
                </div>
              </SortableContext>
            ) : (
              /* Regular user view */
              <div style={gridStyle}>
                {Object.values(columns)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map(column => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      filteredTasks={filteredColumns[column.id]?.tasks || []}
                      members={members}
                      selectedMembers={selectedMembers}
                      selectedTask={selectedTask}
                      draggedTask={draggedTask}
                      draggedColumn={draggedColumn}
                      dragPreview={dragPreview}
                      onAddTask={onAddTask}
                      columnWarnings={columnWarnings}
                      onDismissColumnWarning={onDismissColumnWarning}
                      onRemoveTask={onRemoveTask}
                      onEditTask={onEditTask}
                      onCopyTask={onCopyTask}
                      onEditColumn={onEditColumn}
                      onRemoveColumn={onRemoveColumn}
                      onAddColumn={onAddColumn}
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={() => {}}
                      onTaskDragOver={onTaskDragOver}
                      onTaskDrop={onTaskDrop}
                      onSelectTask={onSelectTask}
                      isAdmin={false}
                      taskViewMode={taskViewMode}
                      availablePriorities={availablePriorities}
                    />
                  ))}
              </div>
            )}
            
            <DragOverlay 
              dropAnimation={null}
            >
              {draggedColumn ? (
                <div className="bg-gray-50 rounded-lg p-4 flex flex-col min-h-[200px] opacity-90 scale-105 shadow-2xl transform rotate-3 ring-2 ring-blue-400">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-semibold text-gray-700">{draggedColumn.title}</div>
                  </div>
                  <div className="flex-1 min-h-[100px] space-y-2">
                    {draggedColumn.tasks.map((task: Task) => (
                      <div key={task.id} className="bg-white p-3 rounded border shadow-sm">
                        <div className="text-sm text-gray-600">{task.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : draggedTask ? (
                /* Render exact replica of the original TaskCard */
                <div style={{ transform: 'rotate(3deg) scale(1.05)', opacity: 0.95 }}>
                  <TaskCard
                    task={draggedTask}
                    member={members.find(m => m.id === draggedTask.memberId)!}
                    members={members}
                    onRemove={() => {}}
                    onEdit={() => {}}
                    onCopy={() => {}}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                    onSelect={() => {}}
                    isDragDisabled={true}
                    taskViewMode={taskViewMode}
                    availablePriorities={availablePriorities}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}


    </>
  );
};

export default KanbanPage;
