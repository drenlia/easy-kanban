/**
 * Version Detection Utility
 *
 * Tracks app version changes and notifies listeners when a new version is detected.
 * The initial version is stored in-memory when the app first loads, and subsequent
 * API responses are checked for version changes via the X-App-Version header.
 *
 * During K8s rolling updates, clients may briefly hit old + new pods. We must not
 * treat a temporary "downgrade" (seeing an older X-App-Version) as a new update,
 * or clear a dismissed target version when an old pod answers.
 */

type VersionChangeCallback = (oldVersion: string, newVersion: string) => void;

const DISMISSED_KEY = 'dismissedVersion';

function readDismissedVersion(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISSED_KEY) : null;
  } catch {
    return null;
  }
}

class VersionDetectionService {
  private initialVersion: string | null = null;
  private listeners: VersionChangeCallback[] = [];
  private isInitialized = false;
  private lastNotifiedVersion: string | null = null;

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
    if (!newVersion) return false;

    const dismissedVersion = readDismissedVersion();

    // Already adopted / dismissed this build — ignore, including mid-rollout flip-flops
    if (dismissedVersion === newVersion) {
      if (!this.isInitialized) {
        this.setInitialVersion(newVersion);
      } else if (this.initialVersion !== newVersion) {
        // Sticky: once user refreshed for V, don't let an old pod reset baseline to V-1
        this.initialVersion = newVersion;
      }
      return false;
    }

    if (!this.isInitialized || !this.initialVersion) {
      if (isFromWebSocket) {
        console.log(`🔄 New version detected on fresh session: ${newVersion} (not dismissed)`);
        this.setInitialVersion(newVersion);
        this.notifyListeners('unknown', newVersion);
        this.lastNotifiedVersion = newVersion;
        return true;
      }
      this.setInitialVersion(newVersion);
      this.lastNotifiedVersion = null;
      return false;
    }

    if (newVersion === this.initialVersion) {
      return false;
    }

    // Once we're already prompting for a target build, ignore other builds (old pods mid-rollout)
    if (this.lastNotifiedVersion && newVersion !== this.lastNotifiedVersion) {
      console.log(
        `⏭️ Ignoring version ${newVersion}; already notifying for ${this.lastNotifiedVersion}`
      );
      return false;
    }

    // Mid-rollout: old pod after we already saw / dismissed the new build — do not "update" to older
    if (dismissedVersion && newVersion !== dismissedVersion) {
      console.log(
        `⏭️ Ignoring version ${newVersion} during rollout (target/dismissed: ${dismissedVersion}, baseline: ${this.initialVersion})`
      );
      return false;
    }

    if (newVersion !== this.lastNotifiedVersion) {
      console.log(`🔄 Version change detected: ${this.initialVersion} → ${newVersion}`);
      this.notifyListeners(this.initialVersion, newVersion);
      this.lastNotifiedVersion = newVersion;
      return true;
    }

    return false;
  }

  onVersionChange(callback: VersionChangeCallback) {
    this.listeners.push(callback);
  }

  offVersionChange(callback: VersionChangeCallback) {
    this.listeners = this.listeners.filter((cb) => cb !== callback);
  }

  private notifyListeners(oldVersion: string, newVersion: string) {
    this.listeners.forEach((callback) => {
      try {
        callback(oldVersion, newVersion);
      } catch (error) {
        console.error('Error in version change callback:', error);
      }
    });
  }

  getInitialVersion(): string | null {
    return this.initialVersion;
  }

  reset() {
    this.initialVersion = null;
    this.isInitialized = false;
    this.lastNotifiedVersion = null;
    this.listeners = [];
  }
}

export const versionDetection = new VersionDetectionService();
