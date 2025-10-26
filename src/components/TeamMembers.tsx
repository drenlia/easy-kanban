import React from 'react';
import { TeamMember } from '../types';
import { getAuthenticatedAvatarUrl } from '../utils/authImageUrl';

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
  selectedMembers: string[];
  onSelectMember: (id: string) => void;
  onClearSelections?: () => void;
  onSelectAll?: () => void;
  isAllModeActive?: boolean;
  includeAssignees?: boolean;
  includeWatchers?: boolean;
  includeCollaborators?: boolean;
  includeRequesters?: boolean;
  includeSystem?: boolean;
  onToggleAssignees?: (include: boolean) => void;
  onToggleWatchers?: (include: boolean) => void;
  onToggleCollaborators?: (include: boolean) => void;
  onToggleRequesters?: (include: boolean) => void;
  onToggleSystem?: (include: boolean) => void;
  currentUserId?: string;
  currentUser?: any; // To check if user is admin
  onlineUsers?: Set<string>;
  boardOnlineUsers?: Set<string>;
  systemTaskCount?: number;
}

export default function TeamMembers({
  members,
  selectedMembers,
  onSelectMember,
  onClearSelections,
  onSelectAll,
  isAllModeActive = false,
  includeAssignees = false,
  includeWatchers = false,
  includeCollaborators = false,
  includeRequesters = false,
  includeSystem = false,
  onToggleAssignees,
  onToggleWatchers,
  onToggleCollaborators,
  onToggleRequesters,
  onToggleSystem,
  currentUserId,
  currentUser,
  onlineUsers = new Set(),
  boardOnlineUsers = new Set(),
  systemTaskCount = 0
}: TeamMembersProps) {
  
  const handleClearSelections = () => {
    if (onClearSelections) {
      onClearSelections();
    }
  };

  // Create system user member object when needed
  // Use members directly - API will include/exclude SYSTEM based on includeSystem parameter
  const displayMembers = members;
  
  // Function to get avatar display for a member
  const getMemberAvatar = (member: TeamMember) => {
    // Priority: Google avatar > Local avatar > Default initials
    if (member.googleAvatarUrl) {
      return (
        <img 
          src={getAuthenticatedAvatarUrl(member.googleAvatarUrl)} 
          alt={member.name}
          className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm"
        />
      );
    }
    
    if (member.avatarUrl) {
      return (
        <img 
          src={getAuthenticatedAvatarUrl(member.avatarUrl)} 
          alt={member.name}
          className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm"
        />
      );
    }
    
    // Default initials avatar
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
    return (
      <div 
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white shadow-sm"
        style={{ backgroundColor: member.color }}
      >
        {initials}
      </div>
    );
  };
  // Members are now managed from the admin page
  const isAdmin = true; // This will be passed as a prop later if needed

  return (
    <div className="p-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg mb-4 border border-gray-100 dark:border-gray-700" data-tour-id="team-members">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
            Team Members
          </h2>
          
          {/* Clear Members Button */}
          {handleClearSelections && (
            <button
              onClick={handleClearSelections}
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500 rounded transition-colors"
              title="Clear member selections (show all members)"
            >
              Clear
            </button>
          )}
          
          {/* All Roles Toggle Button */}
          {onSelectAll && (
            <button
              onClick={onSelectAll}
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 rounded transition-colors"
              title={isAllModeActive 
                ? "Show only assignees" 
                : "Show all roles (assignees, watchers, collaborators, requesters)"
              }
            >
              {isAllModeActive ? 'Assignees Only' : 'All Roles'}
            </button>
          )}
          
          {/* Role Filter Chips */}
          <div className="flex items-center gap-2">
            {onToggleAssignees && (
              <button
                onClick={() => onToggleAssignees(!includeAssignees)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200
                  ${includeAssignees
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 transform scale-102'
                    : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                `}
                title="Show tasks assigned to the selected team members"
              >
                <span>Assignees</span>
              </button>
            )}
            
            {onToggleWatchers && (
              <button
                onClick={() => onToggleWatchers(!includeWatchers)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200
                  ${includeWatchers
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 transform scale-102'
                    : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                `}
                title="Show tasks where the selected members are watching for updates"
              >
                <span>Watchers</span>
              </button>
            )}
            
            {onToggleCollaborators && (
              <button
                onClick={() => onToggleCollaborators(!includeCollaborators)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200
                  ${includeCollaborators
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 transform scale-102'
                    : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                `}
                title="Show tasks where the selected members are actively collaborating"
              >
                <span>Collaborators</span>
              </button>
            )}
            
            {onToggleRequesters && (
              <button
                onClick={() => onToggleRequesters(!includeRequesters)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200
                  ${includeRequesters
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 transform scale-102'
                    : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                `}
                title="Show tasks requested by the selected team members"
              >
                <span>Requesters</span>
              </button>
            )}
            
            {/* System chip - only show for admins */}
            {onToggleSystem && currentUser?.roles?.includes('admin') && (
              <button
                onClick={() => onToggleSystem(!includeSystem)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200
                  ${includeSystem
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-1 transform scale-102'
                    : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                `}
                title="Show tasks assigned to the system user (admin only)"
              >
                <span>System</span>
                {systemTaskCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full text-xs font-semibold">
                    {systemTaskCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Warning when no checkboxes are selected */}
      {!includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters && (
        <div className="mb-2 text-xs text-red-400 bg-red-50 px-2 py-1 rounded border border-red-200">
          ⚠️ No filter options selected. Select at least one option above to display tasks.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {displayMembers.map(member => {
          const isSelected = selectedMembers.includes(member.id);
          return (
            <div
              key={member.id}
              className={`flex items-center gap-1 px-2 py-1 rounded-full cursor-pointer transition-all duration-200 ${
                isSelected 
                  ? 'ring-2 ring-offset-1 shadow-md transform scale-102' 
                  : 'hover:shadow-sm hover:scale-101'
              }`}
              style={{
                backgroundColor: isSelected ? `${member.color}25` : `${member.color}15`,
                color: member.color,
                ringColor: member.color
              }}
              onClick={() => onSelectMember(member.id)}
              title={`${member.name} ${isSelected ? '(selected)' : '(click to select)'}`}
            >
              {getMemberAvatar(member)}
              <span className={`text-xs font-medium ${isSelected ? 'font-semibold' : ''}`}>
                {member.name}
              </span>
            </div>
          );
        })}
      </div>


    </div>
  );
}