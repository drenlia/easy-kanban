/**
 * UI helpers for the AI Agent pseudo-member (ordering, avatar, stubs).
 */

import type { TeamMember } from '../types';
import {
  AGENT_DEFAULT_COLOR,
  AGENT_DEFAULT_NAME,
  AGENT_MEMBER_ID,
  SYSTEM_MEMBER_ID,
} from '../constants/appConstants';

/** Static product asset (served from /public). Prefer this over letter avatars. */
export const AGENT_BOT_AVATAR_SRC = '/agent-bot.jpg';

export function isAgentMemberId(id: string | null | undefined): boolean {
  return Boolean(id && String(id) === AGENT_MEMBER_ID);
}

export function isSystemMemberId(id: string | null | undefined): boolean {
  return Boolean(id && String(id) === SYSTEM_MEMBER_ID);
}

/**
 * People: current user first (when known), then A→Z; then Agent, then System.
 * Optional `preferredOrder` (people ids) overrides the default people order for known members;
 * unknown / new people append A→Z (still after preferred, before Agent/System).
 */
export function sortMembersAgentLast<
  T extends { id: string; name?: string; user_id?: string }
>(
  members: T[],
  preferredOrder?: string[] | null,
  currentUserId?: string | null
): T[] {
  if (!members?.length) return members || [];
  const people: T[] = [];
  const systems: T[] = [];
  const agents: T[] = [];
  for (const m of members) {
    if (isAgentMemberId(m.id)) agents.push(m);
    else if (isSystemMemberId(m.id)) systems.push(m);
    else people.push(m);
  }
  const byDisplayName = (a: T, b: T) =>
    (a.name || '').localeCompare(b.name || '', undefined, {
      sensitivity: 'base',
      numeric: true,
    });

  let orderedPeople: T[];
  if (preferredOrder?.length) {
    const byId = new Map(people.map((p) => [p.id, p]));
    const seen = new Set<string>();
    orderedPeople = [];
    for (const id of preferredOrder) {
      const hit = byId.get(id);
      if (hit && !seen.has(id)) {
        orderedPeople.push(hit);
        seen.add(id);
      }
    }
    const rest = people.filter((p) => !seen.has(p.id)).sort(byDisplayName);
    orderedPeople = [...orderedPeople, ...rest];
  } else {
    const selfId = currentUserId ? String(currentUserId) : null;
    const self = selfId
      ? people.filter((p) => p.user_id && String(p.user_id) === selfId)
      : [];
    const selfIds = new Set(self.map((p) => p.id));
    const others = people.filter((p) => !selfIds.has(p.id)).sort(byDisplayName);
    orderedPeople = [...self, ...others];
  }

  // Agent before System (special accounts stay after people)
  return [...orderedPeople, ...agents, ...systems];
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
