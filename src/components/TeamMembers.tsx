import React from 'react';
import { Plus, X } from 'lucide-react';
import { TeamMember } from '../types';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
  '#E67E22', '#27AE60', '#C0392B', '#7F8C8D'
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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const usedColors = new Set(members.map(m => m.color));
    const availableColor = PRESET_COLORS.find(c => !usedColors.has(c)) || PRESET_COLORS[0];

    onAdd({
      id: crypto.randomUUID(),
      name: newMemberName.trim(),
      color: availableColor
    });

    setNewMemberName('');
    setShowAddForm(false);
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
                onRemove(member.id);
              }}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
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
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}