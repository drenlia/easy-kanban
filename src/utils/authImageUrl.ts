/**
 * Utility function to convert image URLs to token-based authenticated URLs
 * This ensures that avatar and attachment images are loaded with proper authentication
 */

/**
 * Converts an avatar URL to use the token-based authenticated endpoint
 * @param avatarUrl - The original avatar URL (e.g., "/avatars/filename.png")
 * @returns The authenticated URL with token (e.g., "/api/files/avatars/filename.png?token=...")
 */
export function getAuthenticatedAvatarUrl(avatarUrl: string | undefined | null): string | undefined {
  if (!avatarUrl) return undefined;
  
  // If it's already a token-based URL, return as-is
  if (avatarUrl.startsWith('/api/files/avatars/')) {
    return avatarUrl;
  }
  
  // If it's a Google avatar URL (external), return as-is
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  
  // Get the authentication token
  const token = localStorage.getItem('authToken');
  if (!token) {
    // Return undefined to let the component handle the fallback (initials)
    return undefined;
  }
  
  // Convert local avatar URL to token-based URL
  if (avatarUrl.startsWith('/avatars/')) {
    const filename = avatarUrl.replace('/avatars/', '');
    return `/api/files/avatars/${filename}?token=${encodeURIComponent(token)}`;
  }
  
  // If it doesn't start with /avatars/, assume it's a filename and add the path
  return `/api/files/avatars/${avatarUrl}?token=${encodeURIComponent(token)}`;
}

/**
 * Converts an attachment URL to use the token-based authenticated endpoint
 * @param attachmentUrl - The original attachment URL (e.g., "/attachments/filename.png")
 * @returns The authenticated URL with token (e.g., "/api/files/attachments/filename.png?token=...")
 */
export function getAuthenticatedAttachmentUrl(attachmentUrl: string | undefined | null): string | undefined {
  if (!attachmentUrl) return undefined;
  
  // If it's already a token-based URL, return as-is
  if (attachmentUrl.startsWith('/api/files/attachments/')) {
    return attachmentUrl;
  }
  
  // If it's an external URL, return as-is
  if (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://')) {
    return attachmentUrl;
  }
  
  // Get the authentication token
  const token = localStorage.getItem('authToken');
  if (!token) {
    // Return undefined to let the component handle the fallback
    return undefined;
  }
  
  // Convert local attachment URL to token-based URL
  if (attachmentUrl.startsWith('/attachments/')) {
    const filename = attachmentUrl.replace('/attachments/', '');
    return `/api/files/attachments/${filename}?token=${encodeURIComponent(token)}`;
  }
  
  // If it doesn't start with /attachments/, assume it's a filename and add the path
  return `/api/files/attachments/${attachmentUrl}?token=${encodeURIComponent(token)}`;
}

/**
 * Converts any image URL to use the appropriate token-based authenticated endpoint
 * @param imageUrl - The original image URL
 * @returns The authenticated URL with token
 */
export function getAuthenticatedImageUrl(imageUrl: string | undefined | null): string | undefined {
  if (!imageUrl) return undefined;
  
  // If it's already a token-based URL, return as-is
  if (imageUrl.startsWith('/api/files/')) {
    return imageUrl;
  }
  
  // If it's an external URL, return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Determine the type and convert accordingly
  if (imageUrl.startsWith('/avatars/')) {
    return getAuthenticatedAvatarUrl(imageUrl);
  }
  
  if (imageUrl.startsWith('/attachments/')) {
    return getAuthenticatedAttachmentUrl(imageUrl);
  }
  
  // Default to attachment endpoint if we can't determine the type
  return getAuthenticatedAttachmentUrl(imageUrl);
}
