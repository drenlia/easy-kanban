import React from 'react';
import { Plus, X } from 'lucide-react';
import { TeamMember } from '../types';
import * as api from '../api';
import { generateUUID } from '../utils/uuid';

export const PRESET_COLORS = [
  '#FF3B30', // Bright Red
  '#007AFF', // Vivid Blue
  '#4CD964', // Lime Green
  '#FF9500', // Orange
  '#5856D6', // Purple
  '#FF2D55', // Pink
  '#00C7BE', // Teal
  '#FFD60A', // Yellow
  '#BF5AF2', // Magenta
  '#34C759', // Green
  '#FF6B6B', // Coral
  '#1C7ED6', // Royal Blue
  '#845EF7', // Violet
  '#F76707', // Deep Orange
  '#20C997', // Mint
  '#E599F7', // Light Purple
  '#40C057', // Forest Green
  '#F59F00', // Golden
  '#0CA678', // Sea Green
  '#FA5252'  // Red Orange
];

interface TeamMembersProps {
  members: TeamMember[];
  selectedMember: string | null;
  onSelectMember: (id: string) => void;
  onAdd: (member: TeamMember) => void;
  onRemove: (id: string) => void;
}

export default function TeamMembers({
  members,
  selectedMember,
  onSelectMember,
  onAdd,
  onRemove
}: TeamMembersProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newMemberName, setNewMemberName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || isSubmitting) return;

    const usedColors = new Set(members.map(m => m.color));
    const availableColor = PRESET_COLORS.find(c => !usedColors.has(c)) || PRESET_COLORS[0];

    const newMember: TeamMember = {
      id: generateUUID(),
      name: newMemberName.trim(),
      color: availableColor
    };

    try {
      setIsSubmitting(true);
      await onAdd(newMember);
      setNewMemberName('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add member:', error);
      alert('Failed to add member. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await onRemove(id);
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    }
  };

  return (
    <div className="p-4 bg-white shadow-md rounded-lg mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Team Members</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          <Plus size={18} /> Add Member
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {members.map(member => (
          <div
            key={member.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-all ${
              selectedMember === member.id ? 'ring-2 ring-offset-2' : ''
            }`}
            style={{
              backgroundColor: `${member.color}20`,
              color: member.color,
              ringColor: member.color
            }}
            onClick={() => onSelectMember(member.id)}
          >
            <span className="font-medium">{member.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(member.id);
              }}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              disabled={isSubmitting}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleAdd} className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-semibold mb-4">Add Team Member</h3>
            <input
              type="text"
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              placeholder="Member name"
              className="w-full px-3 py-2 border rounded-md mb-4"
              autoFocus
              disabled={isSubmitting}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2 ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}