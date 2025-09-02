import crypto from 'crypto';
import path from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Function to generate default avatar SVG
export function generateDefaultAvatarSVG(name, size = 100) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const backgroundColor = `hsl(${Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 360}, 70%, 50%)`;
  
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${backgroundColor}"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" 
          text-anchor="middle" dominant-baseline="middle" fill="white">${initials}</text>
  </svg>`;
}

// Function to create and save default avatar file
export function createDefaultAvatar(name, userId) {
  const svg = generateDefaultAvatarSVG(name);
  const filename = `default-user-${Date.now()}-${userId.slice(0, 9)}.svg`;
  const avatarsDir = path.join(dirname(__dirname), 'avatars');
  const filePath = path.join(avatarsDir, filename);
  
  try {
    writeFileSync(filePath, svg);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error('Error creating default avatar:', error);
    return null;
  }
}
