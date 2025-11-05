import fs from 'fs';

// Helper function to get app version (from version.json or ENV or database)
export const getAppVersion = (db) => {
  // Try version.json first (build-time, works in K8s)
  try {
    const versionPath = new URL('../version.json', import.meta.url);
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    return versionData.version;
  } catch (error) {
    // Fallback to ENV variable or database
    return process.env.APP_VERSION || 
      db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_VERSION')?.value || 
      '0';
  }
};

