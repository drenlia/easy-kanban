import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { TeamMember } from '../types';
import { useTranslation } from 'react-i18next';
import { getAuthenticatedAvatarUrl } from '../utils/authImageUrl';
import {
  getAgentAvatarSrc,
  isAgentMemberId,
  sortMembersAgentLast,
} from '../utils/agentMemberUi';

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

/** Below this card width: hide role chips. */
const NARROW_MAX_WIDTH_PX = 576;

/** Horizontal padding of the card (p-3 → 12px each side). */
const CARD_PAD_X_PX = 24;

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
  /** When false, hide Agent from the member strip (Search & Filter Agent toggle). */
  showAgentTasks?: boolean;
  currentUserId?: string;
  currentUser?: any; // To check if user is admin
  systemTaskCount?: number;
}

function roleChipClass(active: boolean) {
  // Use ring without ring-offset so selection isn’t clipped by the card padding/overflow.
  return `
    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
    transition-all duration-200 shrink-0
    ${active
      ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 ring-2 ring-inset ring-blue-500'
      : 'bg-gray-500/15 dark:bg-gray-500/25 text-gray-600 dark:text-gray-400 hover:scale-101'
    }
    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
  `;
}

function truncateDisplayName(name: string, maxLength: number = 12): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.substring(0, maxLength) + '...';
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
  showAgentTasks = true,
  currentUserId,
  currentUser,
  systemTaskCount = 0
}: TeamMembersProps) {
  const { t } = useTranslation('common');
  const rootRef = useRef<HTMLDivElement>(null);
  const nameProbeRef = useRef<HTMLDivElement>(null);
  /** Narrow card: hide Assignees/Watchers/… chips */
  const [hideRoleChips, setHideRoleChips] = useState(false);
  /** Avatar-only member row (narrow card OR too many named chips to fit) */
  const [avatarOnly, setAvatarOnly] = useState(false);

  const displayMembers = sortMembersAgentLast(
    showAgentTasks ? members : members.filter((m) => !isAgentMemberId(m.id))
  );

  const recomputeLayout = useCallback(() => {
    const root = rootRef.current;
    const probe = nameProbeRef.current;
    if (!root) return;

    const width = root.clientWidth;
    const narrow = width < NARROW_MAX_WIDTH_PX;
    setHideRoleChips(narrow);

    if (narrow || displayMembers.length === 0) {
      setAvatarOnly(true);
      return;
    }

    if (!probe) {
      setAvatarOnly(false);
      return;
    }

    const available = Math.max(0, width - CARD_PAD_X_PX);
    // Named chips that would overflow a single row → avatar-only (even on wide screens)
    setAvatarOnly(probe.scrollWidth > available + 1);
  }, [displayMembers.length]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    recomputeLayout();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputeLayout());
    ro.observe(root);
    return () => ro.disconnect();
  }, [recomputeLayout, displayMembers]);

  const handleClearSelections = () => {
    if (onClearSelections) {
      onClearSelections();
    }
  };

  const getMemberAvatar = (member: TeamMember) => {
    if (isAgentMemberId(member.id)) {
      return (
        <img
          src={getAgentAvatarSrc(member)}
          alt={member.name}
          className="w-7 h-7 rounded-full object-cover"
        />
      );
    }
    if (member.googleAvatarUrl) {
      return (
        <img
          src={getAuthenticatedAvatarUrl(member.googleAvatarUrl)}
          alt={member.name}
          className="w-7 h-7 rounded-full object-cover"
        />
      );
    }
    if (member.avatarUrl) {
      return (
        <img
          src={getAuthenticatedAvatarUrl(member.avatarUrl)}
          alt={member.name}
          className="w-7 h-7 rounded-full object-cover"
        />
      );
    }
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
    return (
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: member.color }}
      >
        {initials}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="relative p-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-100 dark:border-gray-700 w-full flex-1 flex flex-col min-w-0 overflow-visible"
      data-tour-id="team-members"
    >
      {/* Off-screen probe: width of named chips in one row */}
      <div
        ref={nameProbeRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 flex flex-nowrap gap-2 opacity-0"
        style={{ width: 'max-content', visibility: 'hidden' }}
      >
        {displayMembers.map((member) => (
          <div
            key={`probe-${member.id}`}
            className="flex items-center gap-1 px-2 py-1 shrink-0 text-xs font-medium"
          >
            <span className="w-7 h-7 shrink-0" />
            <span>{truncateDisplayName(member.name)}</span>
          </div>
        ))}
      </div>

      {/* Header: title → Clear → All Roles → role chips (chips hidden when narrow) */}
      <div className="flex items-center justify-between mb-3 gap-2 min-h-5 shrink-0 overflow-visible">
        <div className="flex items-center gap-3 flex-wrap min-w-0 overflow-visible">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide leading-5 shrink-0">
            {t('teamMembers.title')}
          </h2>

          {onClearSelections && (
            <button
              type="button"
              onClick={handleClearSelections}
              disabled={selectedMembers.length === 0}
              aria-disabled={selectedMembers.length === 0}
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-600 dark:disabled:hover:text-gray-300 disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600 enabled:hover:text-red-600 dark:enabled:hover:text-red-400 enabled:hover:border-red-400 dark:enabled:hover:border-red-500"
              title={t('teamMembers.clearSelectionsTooltip')}
            >
              {t('teamMembers.clear')}
            </button>
          )}

          {onSelectAll && (
            <button
              onClick={onSelectAll}
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 rounded transition-colors"
              title={isAllModeActive
                ? t('teamMembers.showOnlyAssignees')
                : t('teamMembers.showAllRoles')
              }
            >
              {isAllModeActive ? t('teamMembers.assigneesOnly') : t('teamMembers.allRoles')}
            </button>
          )}

          {!hideRoleChips && (
            <div className="flex items-center gap-2 overflow-visible">
              {onToggleAssignees && (
                <button
                  onClick={() => onToggleAssignees(!includeAssignees)}
                  className={roleChipClass(includeAssignees)}
                  title={t('teamMembers.assigneesTooltip')}
                >
                  <span>{t('teamMembers.assignees')}</span>
                </button>
              )}

              {onToggleWatchers && (
                <button
                  type="button"
                  onClick={() => onToggleWatchers(!includeWatchers)}
                  className={roleChipClass(includeWatchers)}
                  title={t('teamMembers.watchersTooltip')}
                >
                  <span>{t('teamMembers.watchers')}</span>
                </button>
              )}

              {onToggleCollaborators && (
                <button
                  type="button"
                  onClick={() => onToggleCollaborators(!includeCollaborators)}
                  className={roleChipClass(includeCollaborators)}
                  title={t('teamMembers.collaboratorsTooltip')}
                >
                  <span>{t('teamMembers.collaborators')}</span>
                </button>
              )}

              {onToggleRequesters && (
                <button
                  onClick={() => onToggleRequesters(!includeRequesters)}
                  className={roleChipClass(includeRequesters)}
                  title={t('teamMembers.requestersTooltip')}
                >
                  <span>{t('teamMembers.requesters')}</span>
                </button>
              )}

              {onToggleSystem && currentUser?.roles?.includes('admin') && (
                <button
                  onClick={() => onToggleSystem(!includeSystem)}
                  className={roleChipClass(includeSystem)}
                  title={t('teamMembers.systemTooltip')}
                >
                  <span>{t('teamMembers.system')}</span>
                  {systemTaskCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full text-xs font-semibold">
                      {systemTaskCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!includeAssignees && !includeWatchers && !includeCollaborators && !includeRequesters && (
        <div className="mb-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded border border-red-200 dark:border-red-800">
          {t('teamMembers.noFiltersSelected')}
        </div>
      )}

      <div
        className={`flex content-start flex-1 ${
          avatarOnly
            ? 'flex-nowrap overflow-x-auto py-1 px-0.5 -mx-0.5 gap-1.5'
            : 'flex-wrap overflow-visible gap-2'
        }`}
      >
        {displayMembers.map(member => {
          const isSelected = selectedMembers.includes(member.id);
          if (avatarOnly) {
            return (
              <button
                key={member.id}
                type="button"
                className={`shrink-0 rounded-full transition-shadow duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected ? 'ring-2 shadow-sm' : 'hover:opacity-90'
                }`}
                style={
                  isSelected
                    ? { ['--tw-ring-color' as string]: member.color }
                    : undefined
                }
                onClick={() => onSelectMember(member.id)}
                title={`${member.name} ${isSelected ? t('teamMembers.selected') : t('teamMembers.clickToSelect')}`}
              >
                {getMemberAvatar(member)}
              </button>
            );
          }
          return (
            <div
              key={member.id}
              className={`flex items-center gap-1 px-2 py-1 rounded-full cursor-pointer transition-all duration-200 shrink-0 ${
                isSelected
                  ? 'ring-2 ring-inset shadow-sm'
                  : 'hover:shadow-sm hover:scale-101'
              }`}
              style={{
                backgroundColor: isSelected ? `${member.color}25` : `${member.color}15`,
                color: member.color,
                ['--tw-ring-color' as string]: member.color,
              }}
              onClick={() => onSelectMember(member.id)}
              title={`${member.name} ${isSelected ? t('teamMembers.selected') : t('teamMembers.clickToSelect')}`}
            >
              {getMemberAvatar(member)}
              <span className={`text-xs font-medium ${isSelected ? 'font-semibold' : ''}`}>
                {truncateDisplayName(member.name)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
