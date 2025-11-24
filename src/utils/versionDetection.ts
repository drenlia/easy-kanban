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

  /**
   * Set the initial app version (called on first API response)
   * Can also be called to update the version after a refresh
   */
  setInitialVersion(version: string) {
    const wasInitialized = this.isInitialized;
    this.initialVersion = version;
    this.isInitialized = true;
    if (!wasInitialized) {
      console.log(`📦 Initial app version: ${version}`);
    } else {
      console.log(`📦 Updated app version: ${version}`);
    }
  }

  /**
   * Check if a new version has been detected
   */
  checkVersion(newVersion: string): boolean {
    if (!this.isInitialized || !this.initialVersion) {
      // First response, store as initial version
      this.setInitialVersion(newVersion);
      return false;
    }

    if (newVersion !== this.initialVersion) {
      console.log(`🔄 Version change detected: ${this.initialVersion} → ${newVersion}`);
      this.notifyListeners(this.initialVersion, newVersion);
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
    this.listeners = [];
  }
}

export const versionDetection = new VersionDetectionService();
