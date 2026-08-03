import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { TeamMember } from '../../types';
import { SYSTEM_MEMBER_ID } from '../../constants/appConstants';
import {
  isAgentMemberId,
  sortMembersAgentLast,
} from '../../utils/agentMemberUi';
import { truncateMemberName } from '../../utils/memberUtils';
import MemberAvatar from './MemberAvatar';

export interface MemberPickerProps {
  members: TeamMember[];
  /** Selected member id (single mode) */
  value?: string | null;
  onChange: (memberId: string) => void;
  /** Exclude members from the list (e.g. already watchers) */
  excludeIds?: string[];
  /**
   * single — trigger shows current member (assignee/requester)
   * add — trigger is a placeholder; selecting fires onChange (watchers/collaborators)
   */
  mode?: 'single' | 'add';
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Highlight agent in its own section (default true for single) */
  showAgentSection?: boolean;
}

function memberMatchesQuery(member: TeamMember, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = (member.name || '').toLowerCase();
  const email = (member.email || '').toLowerCase();
  return name.includes(q) || email.includes(q);
}

/**
 * Dropdown member picker with avatars + type-to-search (Task Page / shared UX).
 */
export default function MemberPicker({
  members,
  value = null,
  onChange,
  excludeIds = [],
  mode = 'single',
  placeholder,
  label,
  disabled = false,
  className = '',
  showAgentSection,
}: MemberPickerProps) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const preferAgentSection = showAgentSection ?? mode === 'single';

  const exclude = new Set(excludeIds);
  const ordered = useMemo(
    () => sortMembersAgentLast(members.filter((m) => !exclude.has(m.id))),
    // excludeIds identity: recompute when members or exclude list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, excludeIds.join('|')]
  );

  const filtered = useMemo(
    () => ordered.filter((m) => memberMatchesQuery(m, searchTerm.trim())),
    [ordered, searchTerm]
  );

  const people = filtered.filter((m) => !isAgentMemberId(m.id));
  const agent = filtered.find((m) => isAgentMemberId(m.id));
  const selected = value ? members.find((m) => m.id === value) : undefined;

  const close = () => {
    setOpen(false);
    setSearchTerm('');
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus search after open so typing filters immediately
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    close();
  };

  const renderRow = (m: TeamMember) => {
    const isSelected = mode === 'single' && m.id === value;
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => pick(m.id)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors ${
          m.id === SYSTEM_MEMBER_ID ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
        } ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-700'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        <MemberAvatar member={m} size="sm" />
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0">
          <span className="block truncate">{truncateMemberName(m.name)}</span>
          {m.email && searchTerm.trim() && (
            <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500">
              {m.email}
            </span>
          )}
        </span>
        {isSelected && (
          <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        )}
      </button>
    );
  };

  const triggerLabel =
    mode === 'add'
      ? placeholder || t('taskPage.addWatcher', { defaultValue: 'Add…' })
      : selected
        ? truncateMemberName(selected.name)
        : placeholder || t('labels.selectMember', { defaultValue: 'Select member' });

  const hasAnyResults = people.length > 0 || Boolean(agent);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label && (
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else setOpen(true);
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
          open ? 'ring-2 ring-blue-500 border-blue-500' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {mode === 'single' && (
          <MemberAvatar member={selected} memberId={value} members={members} size="sm" />
        )}
        <span
          className={`flex-1 text-left truncate ${
            mode === 'add' || !selected ? 'text-gray-500 dark:text-gray-400' : ''
          }`}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col max-h-80"
          role="listbox"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = people[0] || agent;
                    if (first) pick(first.id);
                  }
                }}
                placeholder={t('taskPage.searchMembers', {
                  defaultValue: 'Search by name…',
                })}
                className="w-full pl-8 pr-8 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                aria-label={t('taskPage.searchMembers', {
                  defaultValue: 'Search by name…',
                })}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full"
                  aria-label={t('common.clear', { defaultValue: 'Clear' })}
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-1.5">
            {!hasAnyResults ? (
              <div className="px-3 py-3 text-sm text-gray-500 text-center">
                {searchTerm.trim()
                  ? t('taskPage.noMembersFound', {
                      defaultValue: 'No matching people',
                    })
                  : t('taskPage.noMembersAvailable', {
                      defaultValue: 'No members available',
                    })}
              </div>
            ) : (
              <>
                {people.map(renderRow)}
                {preferAgentSection && agent && (
                  <>
                    <div className="my-1.5 border-t border-gray-200 dark:border-gray-600" />
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 px-2 mb-1">
                      {t('toolbar.assignToAgentSection')}
                    </div>
                    {renderRow(agent)}
                  </>
                )}
                {!preferAgentSection && agent && renderRow(agent)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
