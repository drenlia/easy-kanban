/**
 * Version Detection Utility
 * 
 * Tracks app version changes and notifies listeners when a new version is detected.
 * The initial version is stored per-session (in sessionStorage) when the app first loads,
 * and subsequent API responses are checked for version changes via the X-App-Version header.
 * 
 * IMPORTANT: Version tracking is per-session, not per-tenant. Each user session must
 * independently refresh when a new version is deployed, regardless of which tenant
 * they belong to or what other users have done.
 */

type VersionChangeCallback = (oldVersion: string, newVersion: string) => void;

class VersionDetectionService {
  private listeners: VersionChangeCallback[] = [];
  private readonly SESSION_STORAGE_KEY = 'app_initial_version';
  
  /**
   * Get the initial version for this session from sessionStorage
   */
  private getInitialVersionFromStorage(): string | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return sessionStorage.getItem(this.SESSION_STORAGE_KEY);
  }
  
  /**
   * Store the initial version for this session in sessionStorage
   */
  private setInitialVersionInStorage(version: string): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    sessionStorage.setItem(this.SESSION_STORAGE_KEY, version);
  }

  /**
   * Set the initial app version for this session (called on first API response)
   * Can also be called to update the version after a refresh
   */
  setInitialVersion(version: string) {
    const storedVersion = this.getInitialVersionFromStorage();
    const wasInitialized = storedVersion !== null;
    
    this.setInitialVersionInStorage(version);
    
    if (!wasInitialized) {
      console.log(`📦 Initial app version for this session: ${version}`);
    } else {
      console.log(`📦 Updated app version for this session: ${version}`);
    }
  }

  /**
   * Check if a new version has been detected for this session
   * Each user session tracks its own version independently
   */
  checkVersion(newVersion: string): boolean {
    const initialVersion = this.getInitialVersionFromStorage();
    
    if (!initialVersion) {
      // First response for this session, store as initial version
      this.setInitialVersion(newVersion);
      return false;
    }

    // Only trigger version change if the new version is actually different
    // This ensures each user session sees the banner when their version differs
    if (newVersion !== initialVersion) {
      console.log(`🔄 Version change detected for this session: ${initialVersion} → ${newVersion}`);
      // Don't update the stored version yet - let the user dismiss/refresh first
      // This ensures the banner persists until the user takes action
      this.notifyListeners(initialVersion, newVersion);
      return true;
    }

    return false;
  }

  /**
   * Register a callback to be notified when version changes
   */
  onVersionChange(callback: VersionChangeCallback) {
    this.listeners.push(callback);
  }

  /**
   * Remove a version change callback
   */
  offVersionChange(callback: VersionChangeCallback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }

  /**
   * Notify all listeners of a version change
   */
  private notifyListeners(oldVersion: string, newVersion: string) {
    this.listeners.forEach(callback => {
      try {
        callback(oldVersion, newVersion);
      } catch (error) {
        console.error('Error in version change callback:', error);
      }
    });
  }

  /**
   * Get the current initial version for this session
   */
  getInitialVersion(): string | null {
    return this.getInitialVersionFromStorage();
  }

  /**
   * Reset the version detection for this session (useful for testing)
   */
  reset() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(this.SESSION_STORAGE_KEY);
    }
    this.listeners = [];
  }
}

export const versionDetection = new VersionDetectionService();

