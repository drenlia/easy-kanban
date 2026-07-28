/**
 * UI helpers for the AI Agent pseudo-member (ordering, avatar, stubs).
 */

import type { TeamMember } from '../types';
import {
  AGENT_DEFAULT_COLOR,
  AGENT_DEFAULT_NAME,
  AGENT_MEMBER_ID,
} from '../constants/appConstants';

/** Static product asset (served from /public). Prefer this over letter avatars. */
export const AGENT_BOT_AVATAR_SRC = '/agent-bot.jpg';

export function isAgentMemberId(id: string | null | undefined): boolean {
  return Boolean(id && String(id) === AGENT_MEMBER_ID);
}

/** People first (API order), Agent pinned last. System stays where the API put it. */
export function sortMembersAgentLast<T extends { id: string }>(members: T[]): T[] {
  if (!members?.length) return members || [];
  const people: T[] = [];
  const agents: T[] = [];
  for (const m of members) {
    if (isAgentMemberId(m.id)) agents.push(m);
    else people.push(m);
  }
  return agents.length ? [...people, ...agents] : members;
}

/** Always use the shipped bot art in UI (auth-free, consistent). */
export function getAgentAvatarSrc(_member?: Pick<TeamMember, 'avatarUrl' | 'googleAvatarUrl'> | null): string {
  return AGENT_BOT_AVATAR_SRC;
}

/** When AI is off, members API omits Agent — keep agent-assigned cards visible. */
export function getAgentMemberStub(overrides?: Partial<TeamMember>): TeamMember {
  return {
    id: AGENT_MEMBER_ID,
    name: AGENT_DEFAULT_NAME,
    color: AGENT_DEFAULT_COLOR,
    avatarUrl: AGENT_BOT_AVATAR_SRC,
    ...overrides,
  };
}

/** Placeholder while members are still loading (or assignee missing from the list). */
export function getUnknownMemberStub(memberId: string, overrides?: Partial<TeamMember>): TeamMember {
  return {
    id: memberId,
    name: '…',
    color: '#9CA3AF',
    ...overrides,
  };
}

export function resolveTaskMember(
  members: TeamMember[] | undefined,
  memberId: string | null | undefined
): TeamMember | undefined {
  if (!memberId) return undefined;
  const list = Array.isArray(members) ? members : [];
  const found = list.find((m) => m.id === memberId);
  if (found) {
    if (isAgentMemberId(found.id)) {
      return { ...found, avatarUrl: getAgentAvatarSrc(found) };
    }
    return found;
  }
  if (isAgentMemberId(memberId)) return getAgentMemberStub();
  // Do not hide cards when members[] is empty/stale (board can hydrate before members).
  return getUnknownMemberStub(memberId);
}
