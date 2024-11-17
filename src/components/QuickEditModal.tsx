import React from 'react';
import { X } from 'lucide-react';
import { Task, Priority, TeamMember } from '../types';

interface QuickEditModalProps {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onSave: (task: Task) => void;
}

export default function QuickEditModal({ task, members, onClose, onSave }: QuickEditModalProps) {
  const [editedTask, setEditedTask] = React.useState(task);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedTask);
    onClose();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Store the date as is without timezone conversion
    setEditedTask(prev => ({ ...prev, startDate: e.target.value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-xl w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Quick Edit Task</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={editedTask.title}
              onChange={e => setEditedTask(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assigned To
            </label>
            <select
              value={editedTask.memberId}
              onChange={e => setEditedTask(prev => ({ ...prev, memberId: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
            >
              {members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={editedTask.description}
              onChange={e => setEditedTask(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={editedTask.startDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Effort (hours)
              </label>
              <input
                type="number"
                min="0"
                value={editedTask.effort}
                onChange={e => setEditedTask(prev => ({ ...prev, effort: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={editedTask.priority}
              onChange={e => setEditedTask(prev => ({ ...prev, priority: e.target.value as Priority }))}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}