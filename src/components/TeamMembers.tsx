import React from 'react';
import { TeamMember } from '../types';

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
}

export default function TeamMembers({
  members,
  selectedMember,
  onSelectMember
}: TeamMembersProps) {
  
  // Function to get avatar display for a member
  const getMemberAvatar = (member: TeamMember) => {
    // Priority: Google avatar > Local avatar > Default initials
    if (member.googleAvatarUrl) {
      return (
        <img 
          src={member.googleAvatarUrl} 
          alt={member.name}
          className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
        />
      );
    }
    
    if (member.avatarUrl) {
      return (
        <img 
          src={member.avatarUrl} 
          alt={member.name}
          className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
        />
      );
    }
    
    // Default initials avatar
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
    return (
      <div 
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-white shadow-sm"
        style={{ backgroundColor: member.color }}
      >
        {initials}
      </div>
    );
  };
  // Members are now managed from the admin page
  const isAdmin = true; // This will be passed as a prop later if needed

  return (
    <div className="p-3 bg-white shadow-sm rounded-lg mb-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Team Members</h2>
        <div className="text-xs text-gray-500 italic">
          Members managed from Admin page
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map(member => (
          <div
            key={member.id}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cursor-pointer transition-all ${
              selectedMember === member.id ? 'ring-2 ring-offset-1' : ''
            }`}
            style={{
              backgroundColor: `${member.color}15`,
              color: member.color
            }}
            onClick={() => onSelectMember(member.id)}
          >
            {getMemberAvatar(member)}
            <span className="text-xs font-medium">{member.name}</span>
          </div>
        ))}
      </div>


    </div>
  );
}