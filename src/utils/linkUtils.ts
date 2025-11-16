/**
 * Utility functions for handling links based on site settings
 */

/**
 * Check if links should open in a new tab based on SITE_OPENS_NEW_TAB setting
 * Defaults to true (open in new tab) if setting is not defined
 * 
 * @param siteSettings - Site settings object containing SITE_OPENS_NEW_TAB
 * @returns true if links should open in new tab, false otherwise
 */
export const shouldOpenLinkInNewTab = (siteSettings?: { SITE_OPENS_NEW_TAB?: string }): boolean => {
  // Default to true (open in new tab) if setting is not defined (matches current behavior)
  if (!siteSettings || siteSettings.SITE_OPENS_NEW_TAB === undefined) {
    return true;
  }
  return siteSettings.SITE_OPENS_NEW_TAB === 'true';
};

/**
 * Get the target attribute value for a link based on site settings
 * 
 * @param siteSettings - Site settings object containing SITE_OPENS_NEW_TAB
 * @returns '_blank' if links should open in new tab, undefined otherwise
 */
export const getLinkTarget = (siteSettings?: { SITE_OPENS_NEW_TAB?: string }): string | undefined => {
  return shouldOpenLinkInNewTab(siteSettings) ? '_blank' : undefined;
};

/**
 * Open a link respecting the SITE_OPENS_NEW_TAB setting
 * 
 * @param url - The URL to open
 * @param siteSettings - Site settings object containing SITE_OPENS_NEW_TAB
 */
export const openLink = (url: string, siteSettings?: { SITE_OPENS_NEW_TAB?: string }): void => {
  if (shouldOpenLinkInNewTab(siteSettings)) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
};

