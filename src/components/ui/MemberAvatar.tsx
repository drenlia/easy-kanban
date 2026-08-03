import React from 'react';
import type { TeamMember } from '../../types';
import { SYSTEM_MEMBER_ID } from '../../constants/appConstants';
import { getAuthenticatedAvatarUrl } from '../../utils/authImageUrl';
import {
  getAgentAvatarSrc,
  isAgentMemberId,
  resolveTaskMember,
} from '../../utils/agentMemberUi';

type AvatarSize = 'xs' | 'sm' | 'md';

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'w-4 h-4 text-[9px]',
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-7 h-7 text-xs',
};

interface MemberAvatarProps {
  member?: TeamMember | null;
  memberId?: string | null;
  members?: TeamMember[];
  size?: AvatarSize;
  className?: string;
  title?: string;
}

/**
 * Compact circular member avatar (photo, agent bot, system emoji, or initial).
 */
export default function MemberAvatar({
  member: memberProp,
  memberId,
  members,
  size = 'md',
  className = '',
  title,
}: MemberAvatarProps) {
  const member =
    memberProp ||
    (memberId && members ? resolveTaskMember(members, memberId) : undefined);

  if (!member) {
    return (
      <div
        className={`${SIZE_CLASS[size]} rounded-full bg-gray-200 dark:bg-gray-600 shrink-0 ${className}`}
        title={title}
        aria-hidden
      />
    );
  }

  const sizeClass = SIZE_CLASS[size];
  const label = title || member.name;

  if (member.id === SYSTEM_MEMBER_ID) {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 ${className}`}
        style={{ backgroundColor: member.color || '#1E40AF' }}
        title={label}
      >
        🤖
      </div>
    );
  }

  if (isAgentMemberId(member.id)) {
    return (
      <img
        src={getAgentAvatarSrc(member)}
        alt={member.name}
        title={label}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  const avatarSrc = member.googleAvatarUrl || member.avatarUrl;
  if (avatarSrc) {
    return (
      <img
        src={getAuthenticatedAvatarUrl(avatarSrc)}
        alt={member.name}
        title={label}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-medium text-white shrink-0 ${className}`}
      style={{ backgroundColor: member.color || '#6B7280' }}
      title={label}
    >
      {(member.name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

/** Soft tinted styles for priority pills (matches TaskCard). */
export function getPriorityPillStyle(hexColor?: string | null): React.CSSProperties {
  if (!hexColor) {
    return {
      backgroundColor: 'rgb(107, 114, 128, 0.1)',
      color: '#6B7280',
    };
  }
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return { backgroundColor: `${hexColor}20`, color: hexColor };
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
    color: hexColor,
    border: `1px solid rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}
