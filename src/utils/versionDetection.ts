/**
 * Version Detection Utility
 * 
 * Tracks app version changes and notifies listeners when a new version is detected.
 * The initial version is stored in-memory when the app first loads, and subsequent
 * API responses are checked for version changes via the X-App-Version header.
 */

type VersionChangeCallback = (oldVersion: string, newVersion: string) => void;

class VersionDetectionService {
  private initialVersion: string | null = null;
  private listeners: VersionChangeCallback[] = [];
  private isInitialized = false;
  private lastNotifiedVersion: string | null = null; // Track last version we notified about

  /**
   * Set the initial app version (called on first API response)
   * Can also be called to update the version after a refresh
   */
  setInitialVersion(version: string) {
    const wasInitialized = this.isInitialized;
    this.initialVersion = version;
    this.isInitialized = true;
    // Reset notification tracking when version is explicitly set (e.g., after refresh)
    this.lastNotifiedVersion = null;
    if (!wasInitialized) {
      console.log(`📦 Initial app version: ${version}`);
    } else {
      console.log(`📦 Updated app version: ${version}`);
    }
  }

  /**
   * Check if a new version has been detected
   * @param newVersion - The new version to check
   * @param isFromWebSocket - Whether this version came from WebSocket (vs API header)
   */
  checkVersion(newVersion: string, isFromWebSocket: boolean = false): boolean {
    if (!this.isInitialized || !this.initialVersion) {
      // First response - check if this version should trigger a notification
      // For WebSocket updates on fresh sessions, we need to check if this version
      // was already dismissed. If not, we should notify even though it's the "initial" version.
      if (isFromWebSocket) {
        // Check localStorage to see if this version was dismissed
        const dismissedVersion = typeof localStorage !== 'undefined' 
          ? localStorage.getItem('dismissedVersion') 
          : null;
        
        if (dismissedVersion !== newVersion) {
          // This is a new version that hasn't been dismissed
          // For new sessions, we'll use a placeholder "unknown" as the old version
          // since we don't know what version they had before
          console.log(`🔄 New version detected on fresh session: ${newVersion} (not dismissed)`);
          this.setInitialVersion(newVersion);
          this.notifyListeners('unknown', newVersion);
          this.lastNotifiedVersion = newVersion;
          return true;
        } else {
          // Version was already dismissed, just set it as initial
          console.log(`📦 Initial app version: ${newVersion} (already dismissed)`);
          this.setInitialVersion(newVersion);
          return false;
        }
      } else {
        // From API header - just set as initial version (normal flow)
        this.setInitialVersion(newVersion);
        this.lastNotifiedVersion = null;
        return false;
      }
    }

    // Only notify if:
    // 1. Version is different from initial version
    // 2. We haven't already notified about this specific version change
    if (newVersion !== this.initialVersion && newVersion !== this.lastNotifiedVersion) {
      console.log(`🔄 Version change detected: ${this.initialVersion} → ${newVersion}`);
      this.notifyListeners(this.initialVersion, newVersion);
      this.lastNotifiedVersion = newVersion; // Track that we've notified about this version
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
   * Get the current initial version
   */
  getInitialVersion(): string | null {
    return this.initialVersion;
  }

  /**
   * Reset the version detection (useful for testing)
   */
  reset() {
    this.initialVersion = null;
    this.isInitialized = false;
    this.lastNotifiedVersion = null;
    this.listeners = [];
  }
}

export const versionDetection = new VersionDetectionService();
