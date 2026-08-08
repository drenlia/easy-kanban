import {
  DEFAULT_SITE_LOGO,
  DEFAULT_SITE_LOGO_DARK,
  isPublicBrandAssetPath,
} from '../constants';

type BrandLogoSettings = {
  SITE_LOGO?: string;
  SITE_LOGO_DARK?: string;
  HIDE_SITE_LOGO?: string;
};

/**
 * Resolve a brand logo URL safe for unauthenticated pages (login, activate, etc.).
 * Custom uploads go through the public `/api/settings/site-logo` endpoint
 * (avatar paths are auth-gated and would 404 before login).
 */
export function resolvePublicBrandLogoSrc(
  settings: BrandLogoSettings | null | undefined,
  theme: 'light' | 'dark' = 'light'
): string | undefined {
  if (settings?.HIDE_SITE_LOGO === 'true') {
    return undefined;
  }

  const light = String(settings?.SITE_LOGO || '').trim();
  const dark = String(settings?.SITE_LOGO_DARK || '').trim();
  const configured = theme === 'dark' ? dark || light : light;

  if (!configured) {
    return theme === 'dark' ? DEFAULT_SITE_LOGO_DARK : DEFAULT_SITE_LOGO;
  }

  if (
    configured.startsWith('http://') ||
    configured.startsWith('https://') ||
    isPublicBrandAssetPath(configured)
  ) {
    return configured;
  }

  const variant = theme === 'dark' && dark ? 'dark' : 'light';
  const cacheKey = configured.includes('/avatars/')
    ? configured.split('/avatars/').pop()?.split('?')[0] || ''
    : configured;
  const qs = new URLSearchParams({ variant });
  if (cacheKey) qs.set('v', cacheKey);
  return `/api/settings/site-logo?${qs.toString()}`;
}
