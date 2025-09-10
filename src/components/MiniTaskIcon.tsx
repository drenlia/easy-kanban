import React from 'react';
import { Task, TeamMember } from '../types';

interface MiniTaskIconProps {
  task: Task;
  member?: TeamMember;
  className?: string;
}

const MiniTaskIcon: React.FC<MiniTaskIconProps> = ({ task, member, className = '' }) => {
  return (
    <div 
      className={`
        w-8 h-8 rounded-lg bg-white border-2 border-blue-400 shadow-lg 
        flex items-center justify-center text-xs font-bold text-gray-700
        transform transition-all duration-200 cursor-grabbing
        ${className}
      `}
      title={task.title}
    >
      {/* Task icon - show first letter of title or member avatar */}
      {member?.avatarUrl ? (
        <img 
          src={member.avatarUrl} 
          alt={member.name}
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <span className="text-blue-600">
          {task.title.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
};

export default MiniTaskIcon;
