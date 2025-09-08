import React from 'react';
import { 
  CurrentUser, 
  TeamMember, 
  Board, 
  Task, 
  Columns, 
  PriorityOption,
  Tag 
} from '../../types';
import { TaskViewMode, ViewMode } from '../../utils/userPreferences';
import Admin from '../Admin';
import KanbanPage from './KanbanPage';

interface MainLayoutProps {
  currentPage: 'kanban' | 'admin';
  currentUser: CurrentUser | null;
  selectedTask: Task | null;
  
  // Admin props
  adminRefreshKey: number;
  onUsersChanged: () => Promise<void>;
  onSettingsChanged: () => Promise<void>;
  
  // Kanban props
  siteSettings: { [key: string]: string };
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
  availableTags: Tag[];
  taskViewMode: TaskViewMode;
  viewMode: ViewMode;
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
  isAllModeActive: boolean;
  includeAssignees: boolean;
  includeWatchers: boolean;
  includeCollaborators: boolean;
  includeRequesters: boolean;
  includeSystem: boolean;
  onToggleAssignees: (include: boolean) => void;
  onToggleWatchers: (include: boolean) => void;
  onToggleCollaborators: (include: boolean) => void;
  onToggleRequesters: (include: boolean) => void;
  onToggleSystem: (include: boolean) => void;
  onToggleTaskViewMode: () => void;
  onViewModeChange: (mode: ViewMode) => void;
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
  onTagAdd: (taskId: string) => (tagId: string) => Promise<void>;
  onTagRemove: (taskId: string) => (tagId: string) => Promise<void>;
  onMoveTaskToColumn: (taskId: string, targetColumnId: string) => Promise<void>;
  onEditColumn: (columnId: string, title: string) => Promise<void>;
  onRemoveColumn: (columnId: string) => Promise<void>;
  onAddColumn: (afterColumnId: string) => Promise<void>;
  onTaskDragStart: (task: Task) => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onTaskDrop: () => Promise<void>;
  onSelectTask: (task: Task | null) => void;
  onTaskDropOnBoard: (taskId: string, targetBoardId: string) => Promise<void>;
  animateCopiedTaskId?: string | null;
  showColumnDeleteConfirm?: string | null;
  onConfirmColumnDelete?: (columnId: string) => Promise<void>;
  onCancelColumnDelete?: () => void;
  getColumnTaskCount?: (columnId: string) => number;
  isTaskMiniMode?: boolean;
  onTaskEnterMiniMode?: () => void;
  onTaskExitMiniMode?: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  currentPage,
  currentUser,
  selectedTask,
  adminRefreshKey,
  onUsersChanged,
  onSettingsChanged,
  ...kanbanProps
}) => {
  return (
    <div className={`flex-1 p-6 ${selectedTask ? 'pr-96' : ''}`}>
      <div className="w-4/5 mx-auto">
        {currentPage === 'admin' ? (
          <Admin 
            key={adminRefreshKey}
            currentUser={currentUser} 
            onUsersChanged={onUsersChanged}
            onSettingsChanged={onSettingsChanged}
          />
        ) : (
          <KanbanPage
            currentUser={currentUser}
            selectedTask={selectedTask}
            {...kanbanProps}
          />
        )}
      </div>
    </div>
  );
};

export default MainLayout;
