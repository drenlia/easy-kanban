import crypto from 'crypto';
import path from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if multi-tenant mode is enabled
const isMultiTenant = () => {
  return process.env.MULTI_TENANT === 'true';
};

// Curated color palette for avatars and member colors
const COLOR_PALETTE = [
  '#EF4444', // Red-500
  '#F97316', // Orange-500
  '#F59E0B', // Amber-500
  '#EAB308', // Yellow-500
  '#84CC16', // Lime-500
  '#22C55E', // Green-500
  '#10B981', // Emerald-500
  '#14B8A6', // Teal-500
  '#06B6D4', // Cyan-500
  '#0EA5E9', // Sky-500
  '#3B82F6', // Blue-500
  '#6366F1', // Indigo-500
  '#8B5CF6', // Violet-500
  '#A855F7', // Purple-500
  '#D946EF', // Fuchsia-500
  '#EC4899', // Pink-500
  '#F43F5E', // Rose-500
];

// Generate a random color from the palette
export function getRandomColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// Function to generate default avatar SVG
export function generateDefaultAvatarSVG(name, size = 100, backgroundColor = null) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const bgColor = backgroundColor || getRandomColor();
  
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${bgColor}"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" 
          text-anchor="middle" dominant-baseline="middle" fill="white">${initials}</text>
  </svg>`;
}

// Function to create and save default avatar file
// tenantId: optional tenant identifier (for multi-tenant mode)
export function createDefaultAvatar(name, userId, backgroundColor = null, tenantId = null) {
  const svg = generateDefaultAvatarSVG(name, 100, backgroundColor);
  const filename = `default-user-${Date.now()}-${userId.slice(0, 9)}.svg`;
  
  // Get tenant-specific avatar directory if in multi-tenant mode
  let avatarsDir;
  if (tenantId && isMultiTenant()) {
    const basePath = process.env.DOCKER_ENV === 'true'
      ? '/app/server'
      : join(dirname(__dirname), '..');
    avatarsDir = join(basePath, 'avatars', 'tenants', tenantId);
  } else {
    // Single-tenant: backward compatible path
    avatarsDir = path.join(dirname(__dirname), 'avatars');
  }
  
  // Ensure directory exists
  try {
    if (!existsSync(avatarsDir)) {
      mkdirSync(avatarsDir, { recursive: true });
      if (tenantId) {
        console.log(`📁 Created tenant avatar directory: ${avatarsDir}`);
      }
    }
  } catch (error) {
    console.error('Error creating avatar directory:', error);
  }
  
  const filePath = path.join(avatarsDir, filename);
  
  try {
    writeFileSync(filePath, svg);
    console.log(`✅ Created default avatar: ${filename}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error('Error creating default avatar:', error);
    return null;
  }
}
