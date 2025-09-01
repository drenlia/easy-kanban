import { PAGE_IDENTIFIERS, ADMIN_TABS } from '../constants';

/**
 * Parse the URL hash to determine the current page and sub-route
 */
export const parseUrlHash = (hash: string) => {
  const cleanHash = hash.replace('#', '');
  const routeParts = cleanHash.split('#');
  const mainRoute = routeParts[0];
  const subRoute = routeParts[1];
  
  return { mainRoute, subRoute };
};

/**
 * Check if a hash represents a page identifier or admin tab
 */
export const isPageOrAdminTab = (hash: string): boolean => {
  const cleanHash = hash.replace('#', '');
  return PAGE_IDENTIFIERS.includes(cleanHash) || ADMIN_TABS.includes(cleanHash);
};

/**
 * Get the initial selected board from URL hash
 */
export const getInitialSelectedBoard = (): string | null => {
  const hash = window.location.hash.replace('#', '');
  return hash && !isPageOrAdminTab(hash) ? hash : null;
};

/**
 * Get the initial page from URL hash
 */
export const getInitialPage = (): 'kanban' | 'admin' => {
  const hash = window.location.hash.replace('#', '');
  return (['kanban', 'admin'] as const).includes(hash as 'kanban' | 'admin') 
    ? (hash as 'kanban' | 'admin') 
    : 'kanban';
};

/**
 * Check if a route is a valid admin tab
 */
export const isValidAdminTab = (tab: string): boolean => {
  const validAdminTabs = ['users', 'site-settings', 'sso'];
  return validAdminTabs.includes(tab);
};
