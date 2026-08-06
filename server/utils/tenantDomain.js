/**
 * Shared tenant base domain for multi-tenant host routing and URL builders.
 * Override with TENANT_DOMAIN; default is the public SaaS domain.
 */

export const DEFAULT_TENANT_DOMAIN = 'docru.app';

export function getTenantDomain() {
  const fromEnv = String(process.env.TENANT_DOMAIN || '').trim();
  return fromEnv || DEFAULT_TENANT_DOMAIN;
}

/** Defaults for new licensed-tenant managed SMTP seeds (never hardcode a legacy domain). */
export function getManagedSmtpSeedDefaults() {
  const domain = getTenantDomain();
  return {
    host: String(process.env.MANAGED_SMTP_HOST || '').trim() || `smtp.${domain}`,
    username: String(process.env.MANAGED_SMTP_USERNAME || '').trim() || `noreply@${domain}`,
    fromEmail: String(process.env.MANAGED_SMTP_FROM_EMAIL || '').trim() || `noreply@${domain}`,
    fromName: String(process.env.MANAGED_SMTP_FROM_NAME || '').trim() || 'Docru',
  };
}
