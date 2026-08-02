import { getUserSettings, updateUserSetting } from '../api';
import type { Board, SiteSettings } from '../types';

export const OWNER_SETUP_STEP_IDS = [
  'welcome',
  'siteIdentity',
  'language',
  'mail',
  'users',
  'boards',
  'tagsPriorities',
  'sprints',
  'sso',
  'licensing',
  'reporting',
  'finish',
] as const;

export type OwnerSetupStepId = (typeof OWNER_SETUP_STEP_IDS)[number];

export type OwnerSetupManualStatus = 'todo' | 'done' | 'skipped';

export interface OwnerSetupGuideField {
  /** CSS selector for the control to highlight during Guide me */
  selector: string;
  /** i18n key under ownerSetup.steps.<stepId>.fields.<fieldKey> */
  fieldKey: string;
  /** Optional group header: ownerSetup.steps.<stepId>.sections.<sectionKey> */
  sectionKey?: string;
  /** Optional admin tab associated with this field */
  adminTab?: string;
  /** Switch to kanban for this field */
  goKanban?: boolean;
}

export interface OwnerSetupStepDef {
  id: OwnerSetupStepId;
  optional: boolean;
  /** Admin hash tab to open, e.g. site-settings */
  adminTab?: string;
  /** Switch to kanban before spotlight */
  goKanban?: boolean;
  /** Fallback single target (tab / button) when no guideFields */
  tourTarget?: string;
  /** Fields for Guide me: one instruction list + simultaneous highlights */
  guideFields?: OwnerSetupGuideField[];
}

const OWNER_SETUP_HIGHLIGHT_CLASS = 'owner-setup-field-highlight';

/** Remove Guide me field highlights from the DOM. */
export function clearOwnerSetupFieldHighlights(): void {
  document.querySelectorAll(`.${OWNER_SETUP_HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(OWNER_SETUP_HIGHLIGHT_CLASS);
  });
}

function stickyChromeBottom(): number {
  const adminTabs = document.querySelector('[data-tour-id="admin-tabs"]') as HTMLElement | null;
  if (adminTabs) {
    return adminTabs.getBoundingClientRect().bottom + 12;
  }
  const header = document.querySelector('header') as HTMLElement | null;
  return (header?.getBoundingClientRect().bottom ?? 56) + 12;
}

/** Scroll so the element sits just below sticky Admin / app chrome. */
export function scrollOwnerSetupTargetIntoView(el: HTMLElement): void {
  const top = el.getBoundingClientRect().top + window.scrollY - stickyChromeBottom();
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/**
 * Highlight all Guide me targets that are currently mounted.
 * Retries briefly so Admin tab content can mount after navigation.
 * Returns a cancel function.
 */
export function applyOwnerSetupFieldHighlights(
  selectors: string[],
  options?: { attempts?: number; intervalMs?: number }
): () => void {
  const attempts = options?.attempts ?? 20;
  const intervalMs = options?.intervalMs ?? 75;
  let cancelled = false;
  let tries = 0;

  const run = () => {
    if (cancelled) return;
    clearOwnerSetupFieldHighlights();

    const found: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    for (const selector of selectors) {
      if (!selector) continue;
      try {
        // querySelectorAll: some controls exist twice (e.g. header Invite desktop/mobile)
        document.querySelectorAll(selector).forEach((node) => {
          const el = node as HTMLElement;
          if (seen.has(el)) return;
          // Skip hidden duplicates so highlight/scroll targets visible UI
          if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
          seen.add(el);
          found.push(el);
        });
      } catch {
        // ignore invalid selectors
      }
    }

    if (found.length > 0) {
      found.forEach((el) => el.classList.add(OWNER_SETUP_HIGHLIGHT_CLASS));
      scrollOwnerSetupTargetIntoView(found[0]);
      return;
    }

    tries += 1;
    if (tries < attempts) {
      window.setTimeout(run, intervalMs);
    }
  };

  requestAnimationFrame(run);
  return () => {
    cancelled = true;
  };
}

export const OWNER_SETUP_STEPS: OwnerSetupStepDef[] = [
  { id: 'welcome', optional: false },
  {
    id: 'siteIdentity',
    optional: false,
    adminTab: 'site-settings',
    tourTarget: '[data-tour-id="admin-site-settings"]',
    guideFields: [
      { selector: '[data-setting-key="SITE_NAME"]', fieldKey: 'SITE_NAME' },
      { selector: '[data-setting-key="SITE_URL"]', fieldKey: 'SITE_URL' },
      { selector: '[data-setting-key="SITE_LOGO"]', fieldKey: 'SITE_LOGO' },
    ],
  },
  {
    id: 'language',
    optional: false,
    adminTab: 'app-settings',
    tourTarget: '[data-tour-id="admin-app-settings"]',
    guideFields: [
      { selector: '[data-setting-key="APP_LANGUAGE"]', fieldKey: 'APP_LANGUAGE' },
    ],
  },
  {
    id: 'mail',
    optional: true,
    adminTab: 'mail-server',
    tourTarget: '[data-tour-id="admin-mail-server"]',
    guideFields: [
      { selector: '[data-setting-key="SMTP_HOST"]', fieldKey: 'SMTP_HOST' },
      { selector: '[data-setting-key="SMTP_PORT"]', fieldKey: 'SMTP_PORT' },
      { selector: '[data-setting-key="SMTP_USERNAME"]', fieldKey: 'SMTP_USERNAME' },
      { selector: '[data-setting-key="SMTP_PASSWORD"]', fieldKey: 'SMTP_PASSWORD' },
      { selector: '[data-setting-key="SMTP_FROM_EMAIL"]', fieldKey: 'SMTP_FROM_EMAIL' },
      { selector: '[data-setting-key="MAIL_TEST_EMAIL"]', fieldKey: 'MAIL_TEST_EMAIL' },
      { selector: '[data-setting-key="MAIL_ENABLED"]', fieldKey: 'MAIL_ENABLED' },
    ],
  },
  {
    id: 'users',
    optional: false,
    adminTab: 'users',
    tourTarget: '[data-tour-id="admin-users"]',
    guideFields: [
      // Add User first so scroll lands on Admin → Users; header Invite is also highlighted
      { selector: '[data-owner-setup="add-user"]', fieldKey: 'addUser' },
      { selector: '[data-tour-id="invite-user-button"]', fieldKey: 'headerInvite' },
    ],
  },
  {
    id: 'boards',
    optional: false,
    goKanban: true,
    tourTarget: '[data-tour-id="add-board-button"]',
    guideFields: [
      {
        selector: '[data-tour-id="add-board-button"]',
        fieldKey: 'addBoard',
        sectionKey: 'topOfScreen',
        goKanban: true,
      },
      {
        selector: '[data-tour-id="board-tabs"]',
        fieldKey: 'boardTitle',
        sectionKey: 'topOfScreen',
        goKanban: true,
      },
      {
        selector: '[data-column-title]',
        fieldKey: 'columnTitle',
        sectionKey: 'tasksBoard',
        goKanban: true,
      },
      {
        selector: '[data-tour-id="column-management-menu"]',
        fieldKey: 'columnMenu',
        sectionKey: 'tasksBoard',
        goKanban: true,
      },
    ],
  },
  {
    id: 'tagsPriorities',
    optional: false,
    adminTab: 'tags',
    tourTarget: '[data-tour-id="admin-tags"]',
    guideFields: [
      { selector: '[data-owner-setup="add-tag"]', fieldKey: 'addTag', adminTab: 'tags' },
      { selector: '[data-tour-id="admin-priorities"]', fieldKey: 'prioritiesTab', adminTab: 'tags' },
      { selector: '[data-owner-setup="add-priority"]', fieldKey: 'addPriority', adminTab: 'priorities' },
    ],
  },
  {
    id: 'sprints',
    optional: true,
    adminTab: 'sprint-settings',
    tourTarget: '[data-tour-id="admin-sprint-settings"]',
    guideFields: [
      { selector: '[data-owner-setup="create-sprint"]', fieldKey: 'createSprint' },
    ],
  },
  {
    id: 'sso',
    optional: true,
    adminTab: 'sso',
    tourTarget: '[data-tour-id="admin-sso"]',
    guideFields: [
      { selector: '[data-setting-key="GOOGLE_CLIENT_ID"]', fieldKey: 'GOOGLE_CLIENT_ID' },
      { selector: '[data-setting-key="GOOGLE_CLIENT_SECRET"]', fieldKey: 'GOOGLE_CLIENT_SECRET' },
      { selector: '[data-setting-key="GOOGLE_CALLBACK_URL"]', fieldKey: 'GOOGLE_CALLBACK_URL' },
    ],
  },
  {
    id: 'licensing',
    optional: true,
    adminTab: 'licensing',
    tourTarget: '[data-tour-id="admin-licensing"]',
    guideFields: [
      { selector: '[data-owner-setup="licensing-panel"]', fieldKey: 'panel' },
    ],
  },
  {
    id: 'reporting',
    optional: true,
    adminTab: 'reporting',
    tourTarget: '[data-tour-id="admin-reporting"]',
    guideFields: [
      { selector: '[data-setting-key="REPORTS_ENABLED"]', fieldKey: 'REPORTS_ENABLED' },
    ],
  },
  { id: 'finish', optional: false },
];

export interface OwnerSetupProgress {
  version: 1;
  /** Checklist visible (false after dismiss until Help recall) */
  visible: boolean;
  minimized: boolean;
  activeStepId: OwnerSetupStepId;
  steps: Partial<Record<OwnerSetupStepId, OwnerSetupManualStatus>>;
  /**
   * Horizontal position as CSS `left` in px.
   * `null` = default docked to the bottom-right with 1rem margin.
   */
  positionX: number | null;
}

export const DEFAULT_OWNER_SETUP_PROGRESS: OwnerSetupProgress = {
  version: 1,
  visible: true,
  minimized: false,
  activeStepId: 'welcome',
  steps: {},
  positionX: null,
};

export interface OwnerSetupHints {
  siteIdentity: boolean;
  language: boolean;
  mail: boolean;
  users: boolean;
  boards: boolean;
  tagsPriorities: boolean;
  sprints: boolean;
  sso: boolean;
  licensing: boolean;
  reporting: boolean;
}

export const EMPTY_OWNER_SETUP_HINTS: OwnerSetupHints = {
  siteIdentity: false,
  language: false,
  mail: false,
  users: false,
  boards: false,
  tagsPriorities: false,
  sprints: false,
  sso: false,
  licensing: false,
  reporting: false,
};

const storageKey = (userId: string) => `easy-kanban-owner-setup-${userId}`;

function normalizeProgress(raw: unknown): OwnerSetupProgress {
  const base = { ...DEFAULT_OWNER_SETUP_PROGRESS, steps: {} as OwnerSetupProgress['steps'] };
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<OwnerSetupProgress>;
  const active =
    p.activeStepId && OWNER_SETUP_STEP_IDS.includes(p.activeStepId)
      ? p.activeStepId
      : base.activeStepId;
  const steps: OwnerSetupProgress['steps'] = {};
  if (p.steps && typeof p.steps === 'object') {
    for (const id of OWNER_SETUP_STEP_IDS) {
      const status = p.steps[id];
      if (status === 'done' || status === 'skipped' || status === 'todo') {
        steps[id] = status;
      }
    }
  }
  return {
    version: 1,
    visible: p.visible !== false,
    minimized: Boolean(p.minimized),
    activeStepId: active,
    steps,
    positionX:
      typeof p.positionX === 'number' && Number.isFinite(p.positionX) ? p.positionX : null,
  };
}

export function loadOwnerSetupProgressLocal(userId: string): OwnerSetupProgress {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_OWNER_SETUP_PROGRESS, steps: {} };
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OWNER_SETUP_PROGRESS, steps: {} };
  }
}

export function saveOwnerSetupProgressLocal(userId: string, progress: OwnerSetupProgress): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    // ignore quota / private mode
  }
}

export async function persistOwnerSetupProgress(
  userId: string,
  progress: OwnerSetupProgress
): Promise<void> {
  saveOwnerSetupProgressLocal(userId, progress);
  try {
    await updateUserSetting('ownerSetup', JSON.stringify(progress));
  } catch (err) {
    console.warn('Failed to persist owner setup progress to server:', err);
  }
}

export async function loadOwnerSetupProgress(userId: string): Promise<OwnerSetupProgress> {
  const local = loadOwnerSetupProgressLocal(userId);
  try {
    const settings = await getUserSettings();
    const raw = settings?.ownerSetup;
    if (!raw) return local;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const fromDb = normalizeProgress(parsed);
    // Prefer whichever has more completed steps; otherwise prefer DB if local is default-ish
    const localDone = countResolved(local);
    const dbDone = countResolved(fromDb);
    if (dbDone > localDone) {
      saveOwnerSetupProgressLocal(userId, fromDb);
      return fromDb;
    }
    if (localDone > 0) return local;
    saveOwnerSetupProgressLocal(userId, fromDb);
    return fromDb;
  } catch {
    return local;
  }
}

function countResolved(progress: OwnerSetupProgress): number {
  return OWNER_SETUP_STEP_IDS.filter((id) => {
    const s = progress.steps[id];
    return s === 'done' || s === 'skipped';
  }).length;
}

export function getStepManualStatus(
  progress: OwnerSetupProgress,
  stepId: OwnerSetupStepId
): OwnerSetupManualStatus {
  return progress.steps[stepId] || 'todo';
}

export function isStepResolved(
  progress: OwnerSetupProgress,
  stepId: OwnerSetupStepId
): boolean {
  const s = getStepManualStatus(progress, stepId);
  return s === 'done' || s === 'skipped';
}

export function getEffectiveDisplayStatus(
  progress: OwnerSetupProgress,
  stepId: OwnerSetupStepId,
  hints: OwnerSetupHints
): 'todo' | 'done' | 'skipped' | 'suggested' {
  const manual = getStepManualStatus(progress, stepId);
  if (manual === 'done' || manual === 'skipped') return manual;
  if (stepId === 'welcome' || stepId === 'finish') return 'todo';
  if (stepId in hints && hints[stepId as keyof OwnerSetupHints]) return 'suggested';
  return 'todo';
}

export function computeOwnerSetupHints(input: {
  siteSettings: SiteSettings | Record<string, string>;
  memberCount: number;
  boards: Board[];
  sprintCount: number;
  tagCount: number;
  priorityCount: number;
}): OwnerSetupHints {
  const s = input.siteSettings || {};
  const siteName = String(s.SITE_NAME || '').trim();
  // "/" is a valid relative site URL for most deployments — hint on renamed site
  const siteIdentity = siteName.length > 0 && siteName !== 'Easy Kanban';

  const mailEnabled = String(s.MAIL_ENABLED || '').toLowerCase() === 'true';
  const smtpHost = String(s.SMTP_HOST || '').trim();
  const mail = mailEnabled && smtpHost.length > 0;

  // Language always has a default — never auto-suggest; owner marks done after visiting
  const language = false;

  const users = input.memberCount > 1;

  const boards =
    input.boards.length > 1 ||
    input.boards.some((b) => {
      const title = (b.title || '').trim().toLowerCase();
      return title.length > 0 && title !== 'new board' && !title.startsWith('board ');
    });

  const tagsPriorities = false; // personal taxonomy — owner marks done

  const sprints = input.sprintCount > 0;

  const sso = String(s.GOOGLE_CLIENT_ID || '').trim().length > 0;

  const licensing =
    String(s.LICENSE_KEY || s.LICENSE || '').trim().length > 0 ||
    String(s.LICENSE_STATUS || '').toLowerCase() === 'valid';

  const reporting = String(s.REPORTS_ENABLED || '').toLowerCase() === 'true';

  return {
    siteIdentity,
    language,
    mail,
    users,
    boards,
    tagsPriorities,
    sprints,
    sso,
    licensing,
    reporting,
  };
}

export function firstIncompleteStepId(progress: OwnerSetupProgress): OwnerSetupStepId {
  for (const id of OWNER_SETUP_STEP_IDS) {
    if (!isStepResolved(progress, id)) return id;
  }
  return 'finish';
}

export function coreStepsComplete(progress: OwnerSetupProgress): boolean {
  return OWNER_SETUP_STEPS.filter((s) => !s.optional).every((s) => isStepResolved(progress, s.id));
}

export function getStepDef(stepId: OwnerSetupStepId): OwnerSetupStepDef {
  return OWNER_SETUP_STEPS.find((s) => s.id === stepId) || OWNER_SETUP_STEPS[0];
}

/** Wait until a selector exists in the DOM (after admin tab navigation). */
export async function waitForOwnerSetupTarget(
  selector: string,
  timeoutMs = 4000
): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) {
      try {
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
      } catch {
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      return el;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

/** Default left offset so the panel sits on the bottom-right with margin. */
export function defaultOwnerSetupPositionX(panelWidth: number, margin = 16): number {
  if (typeof window === 'undefined') return margin;
  return Math.max(margin, window.innerWidth - panelWidth - margin);
}

export function constrainOwnerSetupPositionX(
  x: number,
  panelWidth: number,
  margin = 16
): number {
  if (typeof window === 'undefined') return x;
  const maxX = Math.max(margin, window.innerWidth - panelWidth - margin);
  return Math.min(maxX, Math.max(margin, x));
}
