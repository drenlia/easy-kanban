import React, { useEffect, useRef } from 'react';
import { X, Users, Columns, ClipboardList, MessageSquare, Paperclip, ArrowRight } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} className="bg-white rounded-lg shadow-xl w-3/5 max-w-4xl max-h-[90vh] flex flex-col">
        {/* Sticky Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">How to Use Easy Kanban</h2>
            <p className="text-sm text-gray-500 mt-1">Press F1 anytime to open this help</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {/* Getting Started */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ClipboardList className="text-blue-500" />
              Getting Started
            </h3>
            <div className="space-y-3 text-gray-600">
              <p>Welcome to Easy Kanban! This tool helps teams manage tasks and track progress through different stages.</p>
              <p>Your board starts with 4 default columns: <strong>To Do</strong>, <strong>In Progress</strong>, <strong>Testing</strong>, and <strong>Completed</strong>.</p>
            </div>
          </section>

          {/* Team Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="text-green-500" />
              Team Management
            </h3>
            <div className="space-y-3 text-gray-600">
              <p><strong>Add Team Members:</strong> Click the "Add Member" button to add new team members. Each member gets a unique color for easy identification.</p>
              <p><strong>Remove Members:</strong> Use the member management panel to remove team members when needed.</p>
              <p><strong>Member Colors:</strong> Each task shows the assigned member's color for quick visual identification.</p>
            </div>
          </section>

          {/* Board Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Columns className="text-purple-500" />
              Board Management
            </h3>
            <div className="space-y-3 text-gray-600">
              <p><strong>Create Boards:</strong> Add new boards for different projects or teams using the board selector.</p>
              <p><strong>Rename Boards:</strong> Click the settings icon next to the board name to rename it.</p>
              <p><strong>Customize Columns:</strong> Double-click column headers or use the menu to rename, add, or remove columns.</p>
              <p><strong>Column Actions:</strong> Use the three-dot menu on each column for more options.</p>
            </div>
          </section>

          {/* Task Management */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ClipboardList className="text-orange-500" />
              Task Management
            </h3>
            <div className="space-y-3 text-gray-600">
              <p><strong>Create Tasks:</strong> Select a team member and click the "+" button in any column to create a new task.</p>
              <p><strong>Edit Tasks:</strong> Click the pen icon for quick edits, or the info icon for detailed editing.</p>
              <p><strong>Move Tasks:</strong> Drag and drop tasks between columns to update their status.</p>
              <p><strong>Copy Tasks:</strong> Use the copy icon to duplicate existing tasks.</p>
              <p><strong>Delete Tasks:</strong> Click the X button to remove tasks when they're no longer needed.</p>
            </div>
          </section>

          {/* Task Details */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MessageSquare className="text-indigo-500" />
              Task Details & Communication
            </h3>
            <div className="space-y-3 text-gray-600">
              <p><strong>Task Information:</strong> Set title, description, effort, priority, start date, and assign requester.</p>
              <p><strong>Comments:</strong> Add comments to discuss task progress, ask questions, or provide updates.</p>
              <p><strong>Attachments:</strong> Upload files and documents related to the task using the paperclip icon.</p>
              <p><strong>Priority Levels:</strong> Use Low (blue), Medium (yellow), or High (red) priority indicators.</p>
            </div>
          </section>

          {/* Drag & Drop */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ArrowRight className="text-teal-500" />
              Drag & Drop Workflow
            </h3>
            <div className="space-y-3 text-gray-600">
              <p><strong>Move Between Columns:</strong> Drag tasks from one column to another to update their status.</p>
              <p><strong>Reorder Within Columns:</strong> Drag tasks up or down within a column to change their priority order.</p>
              <p><strong>Visual Feedback:</strong> The interface shows drop zones and highlights where tasks can be placed.</p>
            </div>
          </section>

          {/* Tips & Best Practices */}
          <section>
            <h3 className="text-xl font-semibold text-gray-800 mb-4">💡 Tips & Best Practices</h3>
            <div className="bg-blue-50 p-4 rounded-lg space-y-2 text-gray-700">
              <p><strong>• Regular Updates:</strong> Update task status regularly to keep the board current.</p>
              <p><strong>• Clear Descriptions:</strong> Write clear, actionable task descriptions.</p>
              <p><strong>• Use Comments:</strong> Communicate progress and blockers through comments.</p>
              <p><strong>• Priority Management:</strong> Use priority levels to focus on what matters most.</p>
              <p><strong>• Regular Reviews:</strong> Review and clean up completed tasks periodically.</p>
            </div>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="flex justify-end p-6 border-t bg-gray-50 sticky bottom-0">
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
