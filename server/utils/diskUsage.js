import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Get actual system disk usage
 * Tries multiple methods to get disk space information
 * @param {string} directory - Directory to check (defaults to current working directory)
 * @returns {Object|null} { total: number, used: number, free: number, percent: number } in bytes, or null if unavailable
 */
export const getSystemDiskUsage = (directory = process.cwd()) => {
  try {
    // Method 1: Try using 'df' command (Linux/Mac)
    try {
      // Use a safer approach - check if directory exists first
      const resolvedDir = path.resolve(directory);
      if (!fs.existsSync(resolvedDir)) {
        return null;
      }

      // Use df with error handling
      const dfOutput = execSync(`df -B1 "${resolvedDir}" 2>/dev/null`, { 
        encoding: 'utf8', 
        timeout: 3000,
        maxBuffer: 1024 * 1024, // 1MB buffer
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      });
      
      const lines = dfOutput.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const available = parseInt(parts[3], 10);
          const free = available; // Available space
          
          if (!isNaN(total) && !isNaN(used) && !isNaN(free) && total > 0 && used >= 0 && free >= 0) {
            return {
              total,
              used,
              free,
              percent: Math.round((used / total) * 100)
            };
          }
        }
      }
    } catch (dfError) {
      // df command failed silently - this is expected in some environments
      // Don't log as error, just return null
      if (dfError.code !== 'ENOENT' && dfError.code !== 'EPIPE') {
        console.log('Could not get system disk usage via df command:', dfError.message);
      }
    }

    // If all methods fail, return null to indicate we couldn't get disk info
    return null;
  } catch (error) {
    // Silently fail - this is expected in some environments (containers, restricted permissions, etc.)
    // Only log if it's an unexpected error type
    if (error.code !== 'ENOENT' && error.code !== 'EPIPE' && error.code !== 'ETIMEDOUT') {
      console.log('Error getting system disk usage:', error.message);
    }
    return null;
  }
};

/**
 * Get disk usage for a specific path
 * This is a wrapper that tries to get the filesystem stats
 * @param {string} filePath - Path to check
 * @returns {Object|null} Disk usage info or null if unavailable
 */
export const getDiskUsageForPath = (filePath) => {
  try {
    const resolvedPath = path.resolve(filePath);
    const dirPath = fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
    return getSystemDiskUsage(dirPath);
  } catch (error) {
    console.error('Error getting disk usage for path:', error);
    return null;
  }
};

