/**
 * Convert avatar / attachment paths to authenticated /api/files/… URLs.
 *
 * Auth is via HttpOnly media cookie (see POST /api/files/media-session).
 * Session JWTs must not be embedded in ?token= (I3).
 */

function stripQuery(url: string): string {
  return url.split('?')[0];
}

function hasSessionToken(): boolean {
  return !!localStorage.getItem('authToken');
}

/**
 * Converts an avatar URL to the authenticated files endpoint (cookie auth).
 */
export function getAuthenticatedAvatarUrl(avatarUrl: string | undefined | null): string | undefined {
  if (!avatarUrl) return undefined;

  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }

  if (!hasSessionToken()) {
    return undefined;
  }

  if (avatarUrl.startsWith('/api/files/avatars/')) {
    return stripQuery(avatarUrl);
  }

  if (avatarUrl.startsWith('/avatars/')) {
    const filename = avatarUrl.replace('/avatars/', '');
    return `/api/files/avatars/${filename}`;
  }

  return `/api/files/avatars/${stripQuery(avatarUrl)}`;
}

/**
 * Converts an attachment URL to the authenticated files endpoint (cookie auth).
 */
export function getAuthenticatedAttachmentUrl(attachmentUrl: string | undefined | null): string | undefined {
  if (!attachmentUrl) return undefined;

  if (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://')) {
    return attachmentUrl;
  }

  if (!hasSessionToken()) {
    return undefined;
  }

  if (attachmentUrl.startsWith('/api/files/attachments/')) {
    return stripQuery(attachmentUrl);
  }

  if (attachmentUrl.startsWith('/attachments/')) {
    const filename = attachmentUrl.replace('/attachments/', '');
    return `/api/files/attachments/${filename}`;
  }

  return `/api/files/attachments/${stripQuery(attachmentUrl)}`;
}

/**
 * Converts any image URL to the appropriate authenticated files endpoint.
 */
export function getAuthenticatedImageUrl(imageUrl: string | undefined | null): string | undefined {
  if (!imageUrl) return undefined;

  if (imageUrl.startsWith('/api/files/')) {
    return stripQuery(imageUrl);
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/avatars/')) {
    return getAuthenticatedAvatarUrl(imageUrl);
  }

  if (imageUrl.startsWith('/attachments/')) {
    return getAuthenticatedAttachmentUrl(imageUrl);
  }

  return getAuthenticatedAttachmentUrl(imageUrl);
}
