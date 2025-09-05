import { PAGE_IDENTIFIERS, ADMIN_TABS, ROUTES } from '../constants';

export interface ParsedRoute {
  mainRoute: string;
  subRoute: string | null;
  queryParams: URLSearchParams;
  isPage: boolean;
  isAdminTab: boolean;
  isBoardId: boolean;
}

/**
 * CENTRALIZED ROUTE PARSING - Single source of truth
 */
export const parseUrlHash = (hash: string): ParsedRoute => {
  const cleanHash = hash.replace(/^#/, ''); // Remove leading #
  
  // Split by # for route hierarchy  
  const routeParts = cleanHash.split('#');
  const mainPart = routeParts[0] || '';
  const subRoute = routeParts[1] || null;
  
  // Split main part by ? for query parameters
  const [mainRoute, queryString] = mainPart.split('?');
  const queryParams = new URLSearchParams(queryString || '');
  
  // Determine route type
  const isPage = PAGE_IDENTIFIERS.includes(mainRoute);
  const isAdminTab = ADMIN_TABS.includes(mainRoute);
  const isBoardId = !isPage && !isAdminTab && mainRoute.length > 0;
  
  return {
    mainRoute,
    subRoute,
    queryParams,
    isPage,
    isAdminTab,
    isBoardId
  };
};

/**
 * Check if a hash represents a page identifier or admin tab
 */
export const isPageOrAdminTab = (hash: string): boolean => {
  const parsed = parseUrlHash(hash);
  return parsed.isPage || parsed.isAdminTab;
};

/**
 * Get the initial selected board from URL hash
 * Note: This only checks URL hash. For user preference fallback, use getInitialSelectedBoardWithPreferences in App.tsx
 */
export const getInitialSelectedBoard = (): string | null => {
  const hash = window.location.hash;
  const parsed = parseUrlHash(hash);
  
  // Return board ID if:
  // 1. Main route is a board ID, OR
  // 2. Main route is 'kanban' and subRoute is a board ID
  if (parsed.isBoardId) {
    return parsed.mainRoute;
  } else if (parsed.mainRoute === 'kanban' && parsed.subRoute) {
    return parsed.subRoute;
  }
  
  return null;
};

/**
 * Get the initial page from URL hash
 */
export const getInitialPage = (): 'kanban' | 'admin' | 'forgot-password' | 'reset-password' | 'reset-success' => {
  const hash = window.location.hash;
  const parsed = parseUrlHash(hash);
  
  if (parsed.isPage) {
    return parsed.mainRoute as 'kanban' | 'admin' | 'forgot-password' | 'reset-password' | 'reset-success';
  }
  
  // If it's a board ID, default to kanban page
  if (parsed.isBoardId || (parsed.mainRoute === 'kanban')) {
    return 'kanban';
  }
  
  return ROUTES.DEFAULT_PAGE as 'kanban';
};

/**
 * Check if a route is a valid admin tab
 */
export const isValidAdminTab = (tab: string): boolean => {
  return ADMIN_TABS.includes(tab);
};

/**
 * Check if current page should skip auto-board-selection
 */
export const shouldSkipAutoBoardSelection = (currentPage: string): boolean => {
  return ROUTES.NO_AUTO_BOARD.includes(currentPage as any);
};

/**
 * Build URL hash from components
 */
export const buildHash = (mainRoute: string, subRoute?: string, queryParams?: Record<string, string>): string => {
  let hash = `#${mainRoute}`;
  
  if (subRoute) {
    hash += `#${subRoute}`;
  }
  
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams(queryParams);
    hash += `?${params.toString()}`;
  }
  
  return hash;
};
