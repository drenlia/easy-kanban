import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import AdminFileUploadsTab from './AdminFileUploadsTab';
import AdminNotificationQueueTab from './AdminNotificationQueueTab';
import AdminTroubleshootingTab from './AdminTroubleshootingTab';
import AdminAISettingsTab from './AdminAISettingsTab';
import api from '../../api';
import { ALL_TROUBLESHOOTING_SETTING_KEYS } from '../../constants/clientDebugKeys';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from '../../utils/toast';
import {
  adminSettingsHaveChanges,
  getDirtyAppSettingsSubTabs,
  revertAdminSettingField,
} from '../../utils/adminSettingsDirty';
import {
  ACTIVITY_FEED_HEIGHT,
  ACTIVITY_FEED_POS_X,
  ACTIVITY_FEED_POS_Y,
  ACTIVITY_FEED_WIDTH,
  ADMIN_NUMERIC_INPUT_CLASS,
  clampActivityFeedInSettings,
  clampIntToString,
  parseActivityFeedPosition,
  readActivityFeedPositionRaw,
  stringifyActivityFeedPosition,
} from '../../utils/adminFieldLimits';
import { normalizeTaskViewMode } from '../../utils/userPreferences';
import { AdminDirtyDot, AdminFieldDraftControls } from './AdminFieldDraftControls';
import { AdminUnsavedHint } from './AdminUnsavedChanges';

interface AdminAppSettingsTabProps {
  settings: { [key: string]: string | undefined };
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onSave: (settings?: { [key: string]: string | undefined }) => Promise<void>;
  onCancel: () => void;
  onAutoSave?: (key: string, value: string) => Promise<void>;
  /** Local drafts (AI / file uploads) that are not yet in shared editingSettings */
  onLocalDirtyChange?: (dirty: boolean) => void;
  /** Incremented when admin Discard runs — re-hydrate local subtab drafts */
  discardNonce?: number;
}

type AppSettingsSubTab = 'ui' | 'uploads' | 'notifications' | 'notification-queue' | 'troubleshooting' | 'ai';

/** sessionStorage key: troubleshooting tab visible after secret sequence on gated deployments */
const TROUBLESHOOTING_UNLOCK_KEY = 'adminTroubleshootingUnlocked';

/** Type this in ALL CAPS while Admin → App Settings is focused (not in an input). */
const TROUBLESHOOTING_UNLOCK_SEQUENCE = 'TROUBLE';

/**
 * Hidden unlock for Troubleshooting when MULTI_TENANT or DEMO_ENABLED:
 * Type TROUBLE (all caps) while on Admin → App Settings. Works on any OS/keyboard.
 * Ignored while focus is in an input/textarea. Session-only (sessionStorage).
 */
function isTroubleshootingGatedDeployment(): boolean {
  return (
    process.env.MULTI_TENANT === 'true' || process.env.DEMO_ENABLED === 'true'
  );
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function readTroubleshootingUnlocked(): boolean {
  try {
    return sessionStorage.getItem(TROUBLESHOOTING_UNLOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

function subTabFromHash(hash: string): AppSettingsSubTab {
  if (hash === '#admin#app-settings#file-uploads') return 'uploads';
  if (hash === '#admin#app-settings#notifications') return 'notifications';
  if (hash === '#admin#app-settings#notification-queue') return 'notification-queue';
  if (hash === '#admin#app-settings#troubleshooting') return 'troubleshooting';
  if (hash === '#admin#app-settings#ai') return 'ai';
  return 'ui';
}

const AdminAppSettingsTab: React.FC<AdminAppSettingsTabProps> = ({
  settings,
  editingSettings,
  onSettingsChange,
  onSave,
  onCancel,
  onAutoSave,
  onLocalDirtyChange,
  discardNonce = 0,
}) => {
  const { t } = useTranslation('admin');
  const { updateSiteSettings } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<AppSettingsSubTab>(() =>
    typeof window !== 'undefined' ? subTabFromHash(window.location.hash) : 'ui'
  );
  const [visitedSubTabs, setVisitedSubTabs] = useState<Set<AppSettingsSubTab>>(
    () =>
      new Set<AppSettingsSubTab>([
        typeof window !== 'undefined' ? subTabFromHash(window.location.hash) : 'ui',
      ])
  );
  const [notificationDefaults, setNotificationDefaults] = useState<{ [key: string]: boolean }>({});
  const [autosaveSuccess, setAutosaveSuccess] = useState<string | null>(null);
  const [aiLocalDirty, setAiLocalDirty] = useState(false);

  useEffect(() => {
    setVisitedSubTabs((prev) => {
      if (prev.has(activeSubTab)) return prev;
      const next = new Set(prev);
      next.add(activeSubTab);
      return next;
    });
  }, [activeSubTab]);

  useEffect(() => {
    onLocalDirtyChange?.(aiLocalDirty);
    // Do not clear on unmount — parent Admin tab stay-mounted; clearing would drop the tab dot
  }, [aiLocalDirty, onLocalDirtyChange]);
  const troubleshootingGated = isTroubleshootingGatedDeployment();
  const [troubleshootingUnlocked, setTroubleshootingUnlocked] = useState(
    () => !troubleshootingGated || readTroubleshootingUnlocked()
  );
  const showTroubleshootingTab = !troubleshootingGated || troubleshootingUnlocked;
  const troubleshootingUnlockedRef = useRef(troubleshootingUnlocked);
  troubleshootingUnlockedRef.current = troubleshootingUnlocked;
  const editingSettingsRef = useRef(editingSettings);
  editingSettingsRef.current = editingSettings;
  const lockInProgressRef = useRef(false);

  const disableAllTroubleshootingSettings = useCallback(async () => {
    const settings: Record<string, string> = {};
    for (const key of ALL_TROUBLESHOOTING_SETTING_KEYS) {
      settings[key] = 'false';
    }
    await api.put('/admin/settings/bulk', { settings });
    return settings;
  }, []);

  // Keep notification defaults in sync with draft (and re-hydrate on Discard)
  useEffect(() => {
    const raw =
      editingSettings.NOTIFICATION_DEFAULTS ?? settings.NOTIFICATION_DEFAULTS;
    if (raw) {
      try {
        setNotificationDefaults(JSON.parse(raw));
        return;
      } catch (error) {
        console.error('Failed to parse notification defaults:', error);
      }
    }
    setNotificationDefaults({
      newTaskAssigned: true,
      myTaskUpdated: true,
      watchedTaskUpdated: true,
      addedAsCollaborator: true,
      collaboratingTaskUpdated: true,
      commentAdded: true,
      requesterTaskCreated: true,
      requesterTaskUpdated: true,
    });
  }, [editingSettings.NOTIFICATION_DEFAULTS, settings.NOTIFICATION_DEFAULTS, discardNonce]);

  // Sync activeSubTab from URL hash (fall back if troubleshooting is gated/locked)
  useEffect(() => {
    const tab = subTabFromHash(window.location.hash);
    if (tab === 'troubleshooting' && !showTroubleshootingTab) {
      setActiveSubTab('ui');
      window.location.hash = '#admin#app-settings#user-interface';
      return;
    }
    setActiveSubTab(tab);
  }, [showTroubleshootingTab]);

  // Hidden sequence: type TROUBLE (caps) to toggle Troubleshooting on MULTI_TENANT / DEMO
  useEffect(() => {
    if (!troubleshootingGated) return;

    let buffer = '';
    let lastKeyAt = 0;
    const RESET_MS = 2500;

    const applyUnlocked = (next: boolean) => {
      troubleshootingUnlockedRef.current = next;
      try {
        if (next) {
          sessionStorage.setItem(TROUBLESHOOTING_UNLOCK_KEY, 'true');
        } else {
          sessionStorage.removeItem(TROUBLESHOOTING_UNLOCK_KEY);
        }
      } catch {
        /* ignore */
      }
      setTroubleshootingUnlocked(next);
      if (next) {
        toast.success(t('appSettings.troubleshootingUnlocked'), '');
      } else {
        toast.success(t('appSettings.troubleshootingLocked'), '');
        setActiveSubTab((cur) => {
          if (cur === 'troubleshooting') {
            window.location.hash = '#admin#app-settings#user-interface';
            return 'ui';
          }
          return cur;
        });
      }
    };

    const toggleTroubleshooting = async () => {
      if (lockInProgressRef.current) return;

      if (!troubleshootingUnlockedRef.current) {
        applyUnlocked(true);
        return;
      }

      // Locking: one bulk save, then hide — no per-toggle UI updates.
      lockInProgressRef.current = true;
      try {
        const cleared = await disableAllTroubleshootingSettings();
        applyUnlocked(false);
        updateSiteSettings(cleared);
        onSettingsChange({ ...editingSettingsRef.current, ...cleared });
      } catch {
        toast.error(t('failedToSaveSettings'), '');
      } finally {
        lockInProgressRef.current = false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal browser shortcuts or interfere with form fields (AI URL, etc.).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableKeyTarget(e.target)) return;
      if (e.key.length !== 1) return;

      const now = Date.now();
      if (now - lastKeyAt > RESET_MS) buffer = '';
      lastKeyAt = now;

      // All caps only — lowercase or other characters reset the sequence.
      if (e.key < 'A' || e.key > 'Z') {
        buffer = '';
        return;
      }

      buffer = (buffer + e.key).slice(-TROUBLESHOOTING_UNLOCK_SEQUENCE.length);
      if (buffer === TROUBLESHOOTING_UNLOCK_SEQUENCE) {
        buffer = '';
        e.preventDefault();
        void toggleTroubleshooting();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [troubleshootingGated, t, disableAllTroubleshootingSettings, updateSiteSettings, onSettingsChange]);

  // Update URL hash when activeSubTab changes
  const handleSubTabChange = (tab: AppSettingsSubTab) => {
    if (tab === 'troubleshooting' && !showTroubleshootingTab) return;
    setActiveSubTab(tab);
    const hashByTab: Record<AppSettingsSubTab, string> = {
      ui: '#admin#app-settings#user-interface',
      uploads: '#admin#app-settings#file-uploads',
      notifications: '#admin#app-settings#notifications',
      'notification-queue': '#admin#app-settings#notification-queue',
      troubleshooting: '#admin#app-settings#troubleshooting',
      ai: '#admin#app-settings#ai',
    };
    window.location.hash = hashByTab[tab];
  };

  // Listen for hash changes (back/forward navigation within App Settings only)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      // Ignore Admin tab switches (e.g. → mail-server) so we don't fight navigation
      if (!hash.startsWith('#admin#app-settings')) {
        return;
      }
      const tab = subTabFromHash(hash);
      if (tab === 'troubleshooting' && !showTroubleshootingTab) {
        setActiveSubTab('ui');
        window.location.hash = '#admin#app-settings#user-interface';
        return;
      }
      setActiveSubTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [showTroubleshootingTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const clamped = clampActivityFeedInSettings(editingSettings);
      if (clamped !== editingSettings) {
        onSettingsChange(clamped);
      }
      await onSave(clamped);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = useMemo(
    () => adminSettingsHaveChanges(settings, editingSettings),
    [settings, editingSettings]
  );

  const dirtySubTabs = useMemo(
    () =>
      getDirtyAppSettingsSubTabs(settings, editingSettings, {
        aiLocalDirty,
      }),
    [settings, editingSettings, aiLocalDirty]
  );

  const activityFeedPos = useMemo(
    () => readActivityFeedPositionRaw(editingSettings.DEFAULT_ACTIVITY_FEED_POSITION),
    [editingSettings.DEFAULT_ACTIVITY_FEED_POSITION]
  );

  const revertField = (key: string) => {
    onSettingsChange(revertAdminSettingField(key, settings, editingSettings));
  };

  const handleAppLanguageChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      APP_LANGUAGE: value
    });
    
    // Auto-save the app language change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          APP_LANGUAGE: value
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save app language:', error);
      }
    }, 100);
  };

  const handleTaskDeleteConfirmChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      TASK_DELETE_CONFIRM: value
    });
    
    // Auto-save the task delete confirm change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          TASK_DELETE_CONFIRM: value
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save task delete confirm:', error);
      }
    }, 100);
  };

  const handleShowActivityFeedChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      SHOW_ACTIVITY_FEED: value
    });
    
    // Auto-save the activity feed visibility change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          SHOW_ACTIVITY_FEED: value
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save activity feed visibility:', error);
      }
    }, 100);
  };

  const handleDefaultViewModeChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_VIEW_MODE: value
    });
    
    // Auto-save the default view mode change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          DEFAULT_VIEW_MODE: value
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save default view mode:', error);
      }
    }, 100);
  };

  const handleDefaultTaskViewModeChange = (value: string) => {
    const mode = normalizeTaskViewMode(value);
    onSettingsChange({
      ...editingSettings,
      DEFAULT_TASK_VIEW_MODE: mode
    });
    
    // Auto-save the default task view mode change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          DEFAULT_TASK_VIEW_MODE: mode
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save default task view mode:', error);
      }
    }, 100);
  };

  // Manual save fields (no auto-save) - position, width, height
  const handleActivityFeedPosChange = (axis: 'x' | 'y', value: string) => {
    const current = readActivityFeedPositionRaw(editingSettings.DEFAULT_ACTIVITY_FEED_POSITION);
    const next = {
      x: axis === 'x' ? (value === '' ? '' : Number(value)) : current.x,
      y: axis === 'y' ? (value === '' ? '' : Number(value)) : current.y,
    };
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_POSITION: JSON.stringify(next),
    });
  };

  const clampActivityFeedPosOnBlur = () => {
    const pos = parseActivityFeedPosition(editingSettings.DEFAULT_ACTIVITY_FEED_POSITION);
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_POSITION: stringifyActivityFeedPosition(pos),
    });
  };

  const handleDefaultActivityFeedWidthChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_WIDTH: value,
    });
  };

  const handleDefaultActivityFeedHeightChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      DEFAULT_ACTIVITY_FEED_HEIGHT: value,
    });
  };

  const handleNotificationDelayChange = (value: string) => {
    onSettingsChange({
      ...editingSettings,
      NOTIFICATION_DELAY: value
    });
    
    // Auto-save the notification delay change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          NOTIFICATION_DELAY: value
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save notification delay:', error);
      }
    }, 100);
  };

  // Helper function to get notification default value
  const getNotificationDefault = (key: string): boolean => {
    return notificationDefaults[key] ?? true;
  };

  // Helper function to show autosave success message
  const showAutosaveSuccess = (message: string) => {
    // Show toast instead of inline message
    toast.success(message, '');
    // Keep the state for backward compatibility but clear it immediately
    setAutosaveSuccess(null);
  };

  // Handler for notification default changes
  const handleNotificationDefaultChange = (key: string, value: boolean) => {
    const newDefaults = { ...notificationDefaults, [key]: value };
    setNotificationDefaults(newDefaults);
    
    // Auto-save the changes
    onSettingsChange({
      ...editingSettings,
      NOTIFICATION_DEFAULTS: JSON.stringify(newDefaults)
    });
    
    // Auto-save the notification defaults change (silent - no toast, parent will show one)
    setTimeout(async () => {
      try {
        await onSave({
          ...editingSettings,
          NOTIFICATION_DEFAULTS: JSON.stringify(newDefaults)
        });
        // Don't show toast here - parent handleSaveSettings will show one
      } catch (error) {
        console.error('Failed to save notification defaults:', error);
      }
    }, 100);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('appSettings.title')}</h2>
      </div>

      {/* Sub-tab Navigation */}
      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => handleSubTabChange('ui')}
            className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5 ${
              activeSubTab === 'ui'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.userInterface')}
            <AdminDirtyDot show={dirtySubTabs.has('ui')} />
          </button>
          <button
            onClick={() => handleSubTabChange('uploads')}
            className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5 ${
              activeSubTab === 'uploads'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.fileUploads')}
            <AdminDirtyDot show={dirtySubTabs.has('uploads')} />
          </button>
          <button
            onClick={() => handleSubTabChange('notifications')}
            className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5 ${
              activeSubTab === 'notifications'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.notifications')}
            <AdminDirtyDot show={dirtySubTabs.has('notifications')} />
          </button>
          <button
            onClick={() => handleSubTabChange('notification-queue')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === 'notification-queue'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {t('appSettings.notificationQueue')}
          </button>
          <button
            onClick={() => handleSubTabChange('ai')}
            className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5 ${
              activeSubTab === 'ai'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Sparkles
              size={14}
              className={
                activeSubTab === 'ai'
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-teal-500/80 dark:text-teal-400/80'
              }
              aria-hidden
            />
            {t('appSettings.ai')}
            <AdminDirtyDot show={dirtySubTabs.has('ai')} />
          </button>
          {showTroubleshootingTab && (
            <button
              onClick={() => handleSubTabChange('troubleshooting')}
              className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-1.5 ${
                activeSubTab === 'troubleshooting'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {t('appSettings.troubleshooting')}
              <AdminDirtyDot show={dirtySubTabs.has('troubleshooting')} />
            </button>
          )}
        </nav>
      </div>

      {/* Sub-tab panels: keep visited mounted (hidden) so drafts survive switches */}
      {visitedSubTabs.has('ai') && onAutoSave && (
        <div
          className={activeSubTab === 'ai' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'ai'}
        >
          <AdminAISettingsTab
            editingSettings={editingSettings}
            onSettingsChange={onSettingsChange}
            onAutoSave={onAutoSave}
            onLocalDirtyChange={setAiLocalDirty}
            discardNonce={discardNonce}
          />
        </div>
      )}

      {visitedSubTabs.has('troubleshooting') && showTroubleshootingTab && onAutoSave && (
        <div
          className={activeSubTab === 'troubleshooting' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'troubleshooting'}
        >
          <AdminTroubleshootingTab
            editingSettings={editingSettings}
            onSettingsChange={onSettingsChange}
            onAutoSave={onAutoSave}
          />
        </div>
      )}

      {visitedSubTabs.has('ui') && (
        <div
          className={activeSubTab === 'ui' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'ui'}
        >
          {/* Settings Form */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('appSettings.userInterfaceSettings')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('appSettings.userInterfaceSettingsDescription')}
              </p>
                </div>

            <div className="px-6 py-4 space-y-6">
              {/* Default Application Language Setting */}
              <div className="flex items-start justify-between" data-setting-key="APP_LANGUAGE">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultApplicationLanguage')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                    {t('appSettings.defaultApplicationLanguageDescription')}
                  </p>
                </div>
                <div className="ml-6 flex-shrink-0">
                  <select
                    value={editingSettings.APP_LANGUAGE || 'EN'}
                    onChange={(e) => handleAppLanguageChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="EN">English</option>
                    <option value="FR">Français</option>
                  </select>
                </div>
              </div>

              {/* Task Delete Confirmation Setting */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.taskDeleteConfirmation')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.taskDeleteConfirmationDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.TASK_DELETE_CONFIRM || 'true'}
                    onChange={(e) => handleTaskDeleteConfirmChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">{t('appSettings.enabled')}</option>
                    <option value="false">{t('appSettings.disabled')}</option>
                  </select>
                  </div>
                  </div>
                </div>

            {/* New User Defaults Section */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.newUserDefaults')}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('appSettings.newUserDefaultsDescription')}
              </p>
              
              <div className="space-y-6">
                {/* Default View Mode */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      {t('appSettings.defaultViewMode')}
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('appSettings.defaultViewModeDescription')}
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={editingSettings.DEFAULT_VIEW_MODE || 'kanban'}
                      onChange={(e) => handleDefaultViewModeChange(e.target.value)}
                      className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="kanban">Kanban</option>
                      <option value="list">List</option>
                    </select>
                  </div>
                </div>

            {/* Default Task View Mode */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('appSettings.defaultTaskViewMode')}
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('appSettings.defaultTaskViewModeDescription')}
                    </p>
                  </div>
                  <div className="ml-6 flex-shrink-0">
                    <select
                      value={normalizeTaskViewMode(editingSettings.DEFAULT_TASK_VIEW_MODE)}
                      onChange={(e) => handleDefaultTaskViewModeChange(e.target.value)}
                      className="block w-36 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="expand">{t('appSettings.taskViewExpand')}</option>
                      <option value="shrink">{t('appSettings.taskViewShrink')}</option>
                      <option value="compact">{t('appSettings.taskViewCompact')}</option>
                    </select>
                  </div>
                </div>

            {/* Activity Feed Defaults */}
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <h5 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">{t('appSettings.activityFeedDefaults')}</h5>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                {t('appSettings.activityFeedDefaultsDescription')}
              </p>
              
              {/* Activity Feed Visibility */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('appSettings.defaultVisibility')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultVisibilityDescription')}
                  </p>
                  </div>
                <div className="ml-6 flex-shrink-0">
                    <select
                    value={editingSettings.SHOW_ACTIVITY_FEED || 'true'}
                    onChange={(e) => handleShowActivityFeedChange(e.target.value)}
                    className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="true">{t('appSettings.enabled')}</option>
                    <option value="false">{t('appSettings.disabled')}</option>
                  </select>
                  </div>
                  </div>
              
              {/* Activity Feed Position */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <span>{t('appSettings.defaultPosition')}</span>
                    <AdminFieldDraftControls
                      settingKey="DEFAULT_ACTIVITY_FEED_POSITION"
                      saved={settings}
                      draft={editingSettings}
                      onRevert={() => revertField('DEFAULT_ACTIVITY_FEED_POSITION')}
                    />
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultPositionDescription')}
                  </p>
                </div>
                <div className="ml-6 flex-shrink-0 flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    X
                    <input
                      type="number"
                      inputMode="numeric"
                      value={activityFeedPos.x}
                      onChange={(e) => handleActivityFeedPosChange('x', e.target.value)}
                      onBlur={clampActivityFeedPosOnBlur}
                      className={`block w-16 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${ADMIN_NUMERIC_INPUT_CLASS}`}
                      aria-label={`${t('appSettings.defaultPosition')} X (${ACTIVITY_FEED_POS_X.min}–${ACTIVITY_FEED_POS_X.max})`}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    Y
                    <input
                      type="number"
                      inputMode="numeric"
                      value={activityFeedPos.y}
                      onChange={(e) => handleActivityFeedPosChange('y', e.target.value)}
                      onBlur={clampActivityFeedPosOnBlur}
                      className={`block w-16 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${ADMIN_NUMERIC_INPUT_CLASS}`}
                      aria-label={`${t('appSettings.defaultPosition')} Y (${ACTIVITY_FEED_POS_Y.min}–${ACTIVITY_FEED_POS_Y.max})`}
                    />
                  </label>
                </div>
              </div>

              {/* Activity Feed Width */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <span>{t('appSettings.defaultWidth')}</span>
                    <AdminFieldDraftControls
                      settingKey="DEFAULT_ACTIVITY_FEED_WIDTH"
                      saved={settings}
                      draft={editingSettings}
                      onRevert={() => revertField('DEFAULT_ACTIVITY_FEED_WIDTH')}
                    />
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultWidthDescription', {
                      min: ACTIVITY_FEED_WIDTH.min,
                      max: ACTIVITY_FEED_WIDTH.max,
                    })}
                  </p>
                </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_WIDTH || '160'}
                    onChange={(e) => handleDefaultActivityFeedWidthChange(e.target.value)}
                    onBlur={() =>
                      onSettingsChange({
                        ...editingSettings,
                        DEFAULT_ACTIVITY_FEED_WIDTH: clampIntToString(
                          editingSettings.DEFAULT_ACTIVITY_FEED_WIDTH,
                          ACTIVITY_FEED_WIDTH.min,
                          ACTIVITY_FEED_WIDTH.max,
                          160
                        ),
                      })
                    }
                    className={`block w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${ADMIN_NUMERIC_INPUT_CLASS}`}
                  />
                </div>
              </div>

              {/* Activity Feed Height */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <span>{t('appSettings.defaultHeight')}</span>
                    <AdminFieldDraftControls
                      settingKey="DEFAULT_ACTIVITY_FEED_HEIGHT"
                      saved={settings}
                      draft={editingSettings}
                      onRevert={() => revertField('DEFAULT_ACTIVITY_FEED_HEIGHT')}
                    />
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('appSettings.defaultHeightDescription', {
                      min: ACTIVITY_FEED_HEIGHT.min,
                      max: ACTIVITY_FEED_HEIGHT.max,
                    })}
                  </p>
                </div>
                <div className="ml-6 flex-shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editingSettings.DEFAULT_ACTIVITY_FEED_HEIGHT || '400'}
                    onChange={(e) => handleDefaultActivityFeedHeightChange(e.target.value)}
                    onBlur={() =>
                      onSettingsChange({
                        ...editingSettings,
                        DEFAULT_ACTIVITY_FEED_HEIGHT: clampIntToString(
                          editingSettings.DEFAULT_ACTIVITY_FEED_HEIGHT,
                          ACTIVITY_FEED_HEIGHT.min,
                          ACTIVITY_FEED_HEIGHT.max,
                          400
                        ),
                      })
                    }
                    className={`block w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${ADMIN_NUMERIC_INPUT_CLASS}`}
                  />
                </div>
              </div>
                </div>
          </div>
        </div>

            {/* Action Buttons - Always show for manual save fields (position, width, height) */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex flex-wrap items-center justify-between gap-3">
              <AdminUnsavedHint show={hasChanges} />
              <div className="flex space-x-3 ml-auto">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSaving || !hasChanges}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('appSettings.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasChanges
                      ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-amber-400 ring-offset-2'
                      : 'bg-blue-600'
                  }`}
                >
                  {isSaving ? t('appSettings.saving') : t('appSettings.saveChanges')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {visitedSubTabs.has('notification-queue') && (
        <div
          className={activeSubTab === 'notification-queue' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'notification-queue'}
        >
          <AdminNotificationQueueTab />
        </div>
      )}

      {visitedSubTabs.has('notifications') && (
        <div
          className={activeSubTab === 'notifications' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'notifications'}
        >
          <div className="space-y-6" data-setting-key="NOTIFICATIONS_SECTION">
            {/* Notification Delay Setting */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.emailThrottling')}</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="notification-delay" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('appSettings.notificationDelay')}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {t('appSettings.notificationDelayDescription')}
                  </p>
                  <select
                    id="notification-delay"
                    value={editingSettings.NOTIFICATION_DELAY || '30'}
                    onChange={(e) => handleNotificationDelayChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="0">{t('appSettings.immediate')}</option>
                    <option value="5">{t('appSettings.minutes5')}</option>
                    <option value="15">{t('appSettings.minutes15')}</option>
                    <option value="30">{t('appSettings.minutes30')}</option>
                    <option value="60">{t('appSettings.hour1')}</option>
                    <option value="120">{t('appSettings.hours2')}</option>
                    <option value="240">{t('appSettings.hours4')}</option>
                    <option value="480">{t('appSettings.hours8')}</option>
                    <option value="1440">{t('appSettings.hours24')}</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('appSettings.notificationDelayHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Global Notification Defaults */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.globalNotificationDefaults')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('appSettings.globalNotificationDefaultsDescription')}
              </p>
              <div className="space-y-4">
                {[
                  { key: 'newTaskAssigned', label: t('appSettings.notificationTypes.newTaskAssigned'), description: t('appSettings.notificationTypes.newTaskAssignedDescription') },
                  { key: 'myTaskUpdated', label: t('appSettings.notificationTypes.myTaskUpdated'), description: t('appSettings.notificationTypes.myTaskUpdatedDescription') },
                  { key: 'watchedTaskUpdated', label: t('appSettings.notificationTypes.watchedTaskUpdated'), description: t('appSettings.notificationTypes.watchedTaskUpdatedDescription') },
                  { key: 'addedAsCollaborator', label: t('appSettings.notificationTypes.addedAsCollaborator'), description: t('appSettings.notificationTypes.addedAsCollaboratorDescription') },
                  { key: 'collaboratingTaskUpdated', label: t('appSettings.notificationTypes.collaboratingTaskUpdated'), description: t('appSettings.notificationTypes.collaboratingTaskUpdatedDescription') },
                  { key: 'commentAdded', label: t('appSettings.notificationTypes.commentAdded'), description: t('appSettings.notificationTypes.commentAddedDescription') },
                  { key: 'requesterTaskCreated', label: t('appSettings.notificationTypes.requesterTaskCreated'), description: t('appSettings.notificationTypes.requesterTaskCreatedDescription') },
                  { key: 'requesterTaskUpdated', label: t('appSettings.notificationTypes.requesterTaskUpdated'), description: t('appSettings.notificationTypes.requesterTaskUpdatedDescription') }
                ].map((notification) => (
                  <div key={notification.key} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full ${
                            notification.key === 'newTaskAssigned' ? 'bg-blue-500' :
                            notification.key === 'myTaskUpdated' ? 'bg-green-500' :
                            notification.key === 'watchedTaskUpdated' ? 'bg-purple-500' :
                            notification.key === 'addedAsCollaborator' ? 'bg-yellow-500' :
                            notification.key === 'collaboratingTaskUpdated' ? 'bg-orange-500' :
                            notification.key === 'commentAdded' ? 'bg-red-500' :
                            notification.key === 'requesterTaskCreated' ? 'bg-indigo-500' :
                            'bg-teal-500'
                          }`}></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{notification.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{notification.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={getNotificationDefault(notification.key)}
                          onChange={(e) => handleNotificationDefaultChange(notification.key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email System Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">{t('appSettings.emailSystemStatus')}</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${settings.SMTP_HOST ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {settings.SMTP_HOST ? t('appSettings.emailSystemConfigured') : t('appSettings.emailSystemNotConfigured')}
                </span>
              </div>
              {!settings.SMTP_HOST && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('appSettings.emailSystemNotConfiguredHint')}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons - Notifications tab doesn't need manual save buttons (all auto-save) */}
        </div>
      )}

      {visitedSubTabs.has('uploads') && (
        <div
          className={activeSubTab === 'uploads' ? undefined : 'hidden'}
          aria-hidden={activeSubTab !== 'uploads'}
        >
          <AdminFileUploadsTab
            settings={settings}
            editingSettings={editingSettings}
            onSettingsChange={onSettingsChange}
            onSave={onSave}
            onCancel={onCancel}
            discardNonce={discardNonce}
          />
        </div>
      )}
    </div>
  );
};

export default AdminAppSettingsTab;
