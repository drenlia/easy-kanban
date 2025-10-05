import { useEffect, useRef, useState } from 'react';
import { X, Users, Columns, ClipboardList, MessageSquare, ArrowRight, LayoutGrid, List, Calendar, Search, Eye, Settings, Play } from 'lucide-react';
import { useTour } from '../contexts/TourContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'overview' | 'kanban' | 'list' | 'gantt';

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const { startTour } = useTour();

  const handleStartTour = () => {
    console.log('Start Tutorial button clicked!');
    onClose(); // Close the modal first
    setTimeout(() => {
      startTour(); // Use context function
    }, 100);
  };

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutGrid },
    { id: 'kanban' as TabType, label: 'Kanban View', icon: Columns },
    { id: 'list' as TabType, label: 'List View', icon: List },
    { id: 'gantt' as TabType, label: 'Gantt View', icon: Calendar },
  ];

  const renderOverviewTab = () => (
    <div className="space-y-8">
      {/* General Explanation */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <LayoutGrid className="text-blue-500" />
          What is Easy Kanban?
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>Easy Kanban is a comprehensive project management platform that combines Kanban boards, Gantt charts, and list views for complete project visibility. It features real-time collaboration, advanced task management, and team coordination tools.</p>
          <p>The application supports multiple project boards, task dependencies, file attachments, rich text editing, and sophisticated filtering. It's designed for teams of all sizes with role-based permissions and admin controls.</p>
        </div>
      </section>

      {/* Navigation */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-green-500" />
          Navigation & Interface
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Board Selector:</strong> Switch between different project boards using the tab interface at the top. Each board can have its own columns and tasks. Use the scroll arrows to navigate through many boards.</p>
          <p><strong>View Modes:</strong> Toggle between Kanban (visual board), List (table format), and Gantt (timeline) views using the Tools panel.</p>
          <p><strong>Search & Filter:</strong> Use the search interface to filter tasks by text, dates, members, priorities, tags, and more. Save filter views for quick access.</p>
          <p><strong>User Profile:</strong> Access your profile settings, preferences, and account information via the user menu in the top-right.</p>
          <p><strong>Activity Feed:</strong> View real-time updates, changes, and team activity in the draggable activity panel.</p>
          <p><strong>Admin Panel:</strong> Administrators can access user management, system settings, and configuration options.</p>
            </div>
          </section>

          {/* Team Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Users className="text-purple-500" />
          Team Management & Member Selection
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Team Members:</strong> Each member gets a unique color for easy identification. Administrators can add, edit, or invite new team members through the Admin panel.</p>
          <p><strong>Member Selection:</strong> Select specific team members to filter tasks, or use "All" to see everyone's tasks. You must also enable at least one role checkbox below to see filtered results.</p>
          <p><strong>Role-Based Filtering:</strong> Use the checkboxes to filter tasks by different member roles:</p>
          <ul className="ml-4 space-y-1 text-gray-600 dark:text-gray-300">
            <li><strong>Assignees:</strong> Show tasks assigned to the selected team members</li>
            <li><strong>Watchers:</strong> Show tasks that the selected team members are watching</li>
            <li><strong>Collaborators:</strong> Show tasks that the selected team members can collaborate on</li>
            <li><strong>Requesters:</strong> Show tasks requested by the selected team members</li>
            <li><strong>System:</strong> Show tasks assigned to the system user (admin only)</li>
          </ul>
          <p><strong>Filter Warning:</strong> If no role checkboxes are selected, you'll see a warning and no tasks will be displayed.</p>
        </div>
      </section>

      {/* Tools */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-orange-500" />
          Tools & Features
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Views:</strong> Switch between Kanban (visual board), List (table format), and Gantt (timeline) views using the Tools panel.</p>
          <p><strong>Search & Filter:</strong> Advanced filtering by text, dates, members, priorities, tags, and project IDs. Save and share filter views.</p>
          <p><strong>Task View Modes:</strong> Toggle between compact and detailed task views to optimize screen space.</p>
          <p><strong>Activity Feed:</strong> Draggable panel showing real-time changes, comments, and team activity with notification badges.</p>
          <p><strong>User Profile:</strong> Manage account settings, preferences, avatar, and personal information.</p>
          <p><strong>Real-time Collaboration:</strong> See live updates as team members work on tasks and boards.</p>
          <p><strong>Keyboard Shortcuts:</strong> Use F1 for help, keyboard navigation for efficiency.</p>
        </div>
      </section>
    </div>
  );

  const renderKanbanTab = () => (
    <div className="space-y-8">
      {/* Kanban Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Columns className="text-blue-500" />
          Kanban Board Overview
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>The Kanban view displays tasks as cards organized in columns representing different stages of your workflow. This visual approach helps teams understand work progress at a glance.</p>
          <p>Your board starts with 4 default columns: <strong>To Do</strong>, <strong>In Progress</strong>, <strong>Testing</strong>, and <strong>Completed</strong>. Columns can be customized, reordered, and deleted as needed.</p>
          <p>Tasks can be dragged between columns to update their status, and within columns to change priority order.</p>
            </div>
          </section>

      {/* Column Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Columns className="text-purple-500" />
          Column Management
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Create Columns:</strong> Click the three-dot menu (⋮) in any column header and select "Add Column" to create a new column. The new column will be inserted after the current column.</p>
          <p><strong>Rename Columns:</strong> Double-click column headers to edit their names directly.</p>
          <p><strong>Reorder Columns:</strong> Drag column headers to reorder them according to your workflow (admin only).</p>
          <p><strong>Delete Columns:</strong> Use the three-dot menu (⋮) in the column header and select "Delete Column" to remove columns (admin only).</p>
          <p><strong>Finished Columns:</strong> Columns with names like "Done", "Completed", or "Finished" are automatically marked as finished. Tasks in these columns won't be considered overdue.</p>
            </div>
          </section>

          {/* Task Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ClipboardList className="text-orange-500" />
              Task Management
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Create Tasks:</strong> First select team members using the checkboxes, then click the "+" button in any column header to create a new task. The task will be automatically assigned to the currently logged-in user.</p>
          <p><strong>Edit Tasks:</strong> Click the pen icon for quick edits, or the info icon for detailed editing with rich text, attachments, and comments.</p>
          <p><strong>Move Tasks:</strong> Drag and drop tasks between columns to update their status. Visual feedback shows valid drop zones.</p>
          <p><strong>Reorder Tasks:</strong> Drag tasks up or down within a column to change their priority order.</p>
          <p><strong>Copy Tasks:</strong> Use the copy icon to duplicate existing tasks with all their properties.</p>
          <p><strong>Delete Tasks:</strong> Click the X button to remove tasks. Confirmation may be required based on admin settings.</p>
          <p><strong>Task Details:</strong> Click the info icon to open the full task editor with comments, attachments, watchers, and collaborators.</p>
        </div>
      </section>

      {/* Drag & Drop */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-teal-500" />
          Drag & Drop Features
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Cross-Column Movement:</strong> Drag tasks from one column to another to update their status.</p>
          <p><strong>Within-Column Reordering:</strong> Drag tasks up or down within a column to change their priority.</p>
          <p><strong>Visual Feedback:</strong> The interface shows drop zones and highlights where tasks can be placed.</p>
          <p><strong>Auto-Save:</strong> Changes are automatically saved when you drop tasks in new positions.</p>
            </div>
          </section>

          {/* Task Details */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <MessageSquare className="text-indigo-500" />
              Task Details & Communication
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Task Information:</strong> Set title, description, effort, priority, start date, due date, and assign requester. Rich text editor supports formatting and links.</p>
          <p><strong>Comments:</strong> Add rich text comments with file attachments to discuss task progress, ask questions, or provide updates.</p>
          <p><strong>Attachments:</strong> Upload files and documents related to the task using the paperclip icon. Multiple file types supported.</p>
          <p><strong>Priority Levels:</strong> Customizable priority system with colors and names defined by administrators.</p>
          <p><strong>Tags:</strong> Add custom tags with colors to categorize and filter tasks. Tags are managed by administrators.</p>
          <p><strong>Watchers:</strong> Add team members as watchers to receive notifications when tasks are updated.</p>
          <p><strong>Collaborators:</strong> Add team members as collaborators who can edit and comment on tasks.</p>
          <p><strong>Task Relationships:</strong> Link tasks as parent-child or related relationships for project organization.</p>
        </div>
      </section>
    </div>
  );

  const renderListTab = () => (
    <div className="space-y-8">
      {/* List View Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <List className="text-blue-500" />
          List View Overview
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>The List view displays all tasks in a table format, making it easy to see detailed information at a glance and perform bulk operations.</p>
          <p>This view is perfect for data analysis, reporting, and managing large numbers of tasks efficiently. It supports horizontal scrolling for many columns.</p>
          <p>Tasks are organized by columns and can be sorted, filtered, and managed in bulk.</p>
        </div>
      </section>

      {/* Column Management */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-purple-500" />
          Column Configuration
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Show/Hide Columns:</strong> Click the column menu button to toggle which columns are visible.</p>
          <p><strong>Resize Columns:</strong> Drag column borders to adjust width for better readability.</p>
          <p><strong>Default Columns:</strong> ID, Task, Assignee, Priority, Status, Start Date, Due Date, Tags, Comments, Created</p>
          <p><strong>Column Persistence:</strong> Your column preferences are saved and restored between sessions.</p>
          <p><strong>Horizontal Scrolling:</strong> Use scroll controls to navigate through many columns efficiently.</p>
        </div>
      </section>

      {/* Sorting & Filtering */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Search className="text-orange-500" />
          Sorting & Filtering
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Sort by Column:</strong> Click any column header to sort tasks by that field (ascending/descending).</p>
          <p><strong>Multi-Level Sorting:</strong> Hold Shift while clicking headers to sort by multiple columns.</p>
          <p><strong>Search Integration:</strong> Use the search panel to filter tasks by text, dates, members, priorities, tags, and project IDs.</p>
          <p><strong>Saved Filters:</strong> Save frequently used filter combinations for quick access and sharing with team members.</p>
          <p><strong>Advanced Filtering:</strong> Filter by assignees, watchers, collaborators, requesters, and system tasks.</p>
        </div>
      </section>

      {/* Task Actions */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ClipboardList className="text-green-500" />
          Task Actions
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Quick Actions:</strong> Hover over task rows to reveal action buttons (View, Copy, Delete).</p>
          <p><strong>Status Changes:</strong> Use dropdown menus to quickly change task status between columns.</p>
          <p><strong>Direct Editing:</strong> Click on editable fields to modify task information directly.</p>
          <p><strong>Task Details:</strong> Click the info icon to open the full task editor with all features.</p>
        </div>
      </section>

      {/* Data Display */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Eye className="text-indigo-500" />
          Data Display Features
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Rich Text:</strong> Task descriptions support rich text formatting, links, and embedded content.</p>
          <p><strong>Date Formatting:</strong> Dates are displayed in a consistent, readable format with timezone awareness.</p>
          <p><strong>Priority Indicators:</strong> Color-coded priority levels with customizable colors and names.</p>
          <p><strong>Member Avatars:</strong> Assignee information includes member avatars, names, and color coding.</p>
          <p><strong>Tag Display:</strong> Tags are shown as colored badges for easy categorization and filtering.</p>
          <p><strong>Comment Counts:</strong> Visual indicators show the number of comments and attachments on each task.</p>
          <p><strong>Status Indicators:</strong> Clear visual indicators for task status, overdue items, and completion state.</p>
        </div>
      </section>
    </div>
  );

  const renderGanttTab = () => (
    <div className="space-y-8">
      {/* Gantt Overview */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="text-blue-500" />
          Gantt View Overview
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p>The Gantt view displays tasks as horizontal bars on a timeline, showing task durations, dependencies, and project progress over time.</p>
          <p>This view is ideal for project planning, resource allocation, and understanding task relationships and deadlines. It features virtual scrolling for large projects.</p>
          <p>Tasks can be dragged to change dates, resized to adjust duration, and linked with dependency arrows.</p>
        </div>
      </section>

      {/* Timeline Navigation */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ArrowRight className="text-purple-500" />
          Timeline Navigation
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Scroll Navigation:</strong>Use scroll bars to navigate through time periods.</p>
          <p><strong>Today Button:</strong> Click the "Today" button to jump to the current date on the timeline.</p>
          <p><strong>Task Navigation:</strong> Use the arrow buttons to jump to the earliest or latest tasks in the timeline.</p>
          <p><strong>Relationship Mode:</strong> Toggle relationship mode to create task dependencies and links.</p>
        </div>
      </section>

      {/* Task Management */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <ClipboardList className="text-orange-500" />
          Task Management
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Create Tasks:</strong> Click on any date in the timeline to create a new task on that date. Drag across multiple dates to set a date range for the task.</p>
          <p><strong>Edit Tasks:</strong> Click on task bars to open the task editor for detailed modifications.</p>
          <p><strong>Resize Tasks:</strong> Drag the edges of task bars to adjust start and end dates.</p>
          <p><strong>Move Tasks:</strong> Drag task bars horizontally to change their timeline position.</p>
          <p><strong>Reorder Tasks:</strong> Drag tasks vertically to change their priority order within columns.</p>
          <p><strong>Copy Tasks:</strong> Use the copy button to duplicate tasks with all their properties.</p>
          <p><strong>Delete Tasks:</strong> Use the delete button to remove tasks from the timeline.</p>
            </div>
          </section>

      {/* Dependencies */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ArrowRight className="text-teal-500" />
          Task Dependencies
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Create Dependencies:</strong> Click and drag from one task to another to create dependency relationships.</p>
          <p><strong>Dependency Types:</strong> Set parent-child and related task relationships with visual arrows.</p>
          <p><strong>Visual Arrows:</strong> Dependencies are shown as arrows connecting related tasks on the timeline.</p>
          <p><strong>Cycle Detection:</strong> The system prevents circular dependencies to maintain project integrity.</p>
          <p><strong>Task Relationships:</strong> Link tasks as parent-child or related for better project organization.</p>
        </div>
      </section>

      {/* Timeline Features */}
      <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="text-indigo-500" />
          Timeline Features
            </h3>
            <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Timeline Navigation:</strong> Scroll horizontally through time periods and zoom in/out for different time scales.</p>
          <p><strong>Today Indicator:</strong> A vertical line shows the current date on the timeline for reference.</p>
          <p><strong>Late Badge:</strong> Overdue tasks are highlighted to draw attention to tasks that are past their due date.</p>
          <p><strong>Column Organization:</strong> Tasks are organized by columns (workflow stages) for better project structure.</p>
          <p><strong>Real-time Updates:</strong> Changes from team members are reflected immediately in the timeline.</p>
            </div>
          </section>

      {/* Performance Features */}
          <section>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="text-green-500" />
          Performance & Optimization
        </h3>
        <div className="space-y-3 text-gray-600 dark:text-gray-300">
          <p><strong>Virtual Scrolling:</strong> Large projects with many tasks are handled efficiently with virtual scrolling for smooth performance.</p>
          <p><strong>Lazy Loading:</strong> Task details and relationships are loaded on-demand to improve performance.</p>
          <p><strong>Real-time Updates:</strong> Changes from team members are reflected immediately in the timeline.</p>
          <p><strong>Keyboard Shortcuts:</strong> Use keyboard shortcuts for quick navigation and editing.</p>
          <p><strong>Performance Monitoring:</strong> Built-in performance monitoring ensures smooth operation with large datasets.</p>
            </div>
          </section>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'kanban':
        return renderKanbanTab();
      case 'list':
        return renderListTab();
      case 'gantt':
        return renderGanttTab();
      default:
        return renderOverviewTab();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div ref={modalRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-4/5 max-w-6xl max-h-[90vh] flex flex-col">
        {/* Sticky Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Easy Kanban Help</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Press F1 anytime to open this help</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartTour}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              <Play size={16} />
              Start Tutorial
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={24} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b bg-gray-50 dark:bg-gray-700 px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {renderTabContent()}
        </div>

        {/* Sticky Footer */}
        <div className="flex justify-end p-6 border-t bg-gray-50 dark:bg-gray-700 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}