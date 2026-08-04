/**
 * Purpose-scoped tokens for media file access (I3).
 * Used in an HttpOnly cookie so <img> / attachment URLs need not embed the session JWT.
 */
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.js';

export const MEDIA_TOKEN_PURPOSE = 'media';
export const MEDIA_COOKIE_NAME = 'ek_media';

/** Default 8h (tighter than session 24h); override with MEDIA_TOKEN_EXPIRES_IN (e.g. 2h, 15m). */
export const MEDIA_TOKEN_EXPIRES_IN = process.env.MEDIA_TOKEN_EXPIRES_IN || '8h';

export function signMediaAccessToken(userId) {
  return jwt.sign(
    { id: userId, purpose: MEDIA_TOKEN_PURPOSE },
    JWT_SECRET,
    { expiresIn: MEDIA_TOKEN_EXPIRES_IN }
  );
}

export function isMediaPurposeToken(decoded) {
  return decoded && decoded.purpose === MEDIA_TOKEN_PURPOSE;
}

/**
 * Cookie options for /api/files only — not sent to other API routes.
 */
export function mediaCookieOptions(req) {
  const secure =
    req.secure === true ||
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/api/files',
    maxAge: mediaCookieMaxAgeMs()
  };
}

function mediaCookieMaxAgeMs() {
  const raw = String(MEDIA_TOKEN_EXPIRES_IN || '24h').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) {
    return 24 * 60 * 60 * 1000;
  }
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

export function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

/**
 * Resolve credential for file GET.
 * Prefer cookie, then Bearer, then query (media-purpose only — enforced by caller).
 * @returns {{ token: string, via: 'cookie'|'bearer'|'query' } | null}
 */
export function resolveFileAccessCredential(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies[MEDIA_COOKIE_NAME]) {
    return { token: cookies[MEDIA_COOKIE_NAME], via: 'cookie' };
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return { token, via: 'bearer' };
  }
  if (req.query?.token) {
    return { token: String(req.query.token), via: 'query' };
  }
  return null;
}
