import { ADMIN_TABS } from '../constants';

/** Dispatched when Configuration guide / search needs a reliable Admin tab switch. */
export const ADMIN_NAVIGATE_EVENT = 'easy-kanban:admin-navigate';

export type AdminNavigateDetail = {
  /** Hash without leading #, e.g. admin#mail-server or admin#app-settings#user-interface */
  hash: string;
};

/** Resolve main Admin tab id from a compound admin hash. */
export function adminTabFromHash(hash: string): string | null {
  const full = hash.startsWith('#') ? hash : `#${hash}`;
  if (full.startsWith('#admin#app-settings')) return 'app-settings';
  if (full.startsWith('#admin#licensing')) return 'licensing';
  const parts = full.replace(/^#/, '').split('#');
  // admin#mail-server → ['admin', 'mail-server']
  const tab = parts.length >= 2 ? parts[1] : parts[0];
  if (tab && ADMIN_TABS.includes(tab)) return tab;
  return null;
}

/**
 * Set the Admin deep-link hash and notify Admin to switch tabs immediately.
 * Avoids races where hashchange is missed or App Settings fights the URL.
 */
export function requestAdminNavigation(hash: string): void {
  const normalized = hash.replace(/^#/, '');
  const detail: AdminNavigateDetail = { hash: normalized };
  window.location.hash = normalized;
  window.dispatchEvent(new CustomEvent(ADMIN_NAVIGATE_EVENT, { detail }));
}
