import i18n from 'i18next';
import {
  ADMIN_SEARCH_INDEX,
  type AdminSearchEntry,
} from '../constants/adminSearchIndex';

export function normalizeSearchText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function labelIn(lang: 'en' | 'fr', labelKey: string): string {
  try {
    const t = i18n.getFixedT(lang, 'admin');
    const v = t(labelKey);
    // Missing keys often return the key itself
    if (!v || v === labelKey) return '';
    return String(v);
  } catch {
    return '';
  }
}

/** Haystack used for matching (EN + FR labels + aliases). */
export function buildSearchHaystack(entry: AdminSearchEntry): string {
  const parts = [
    labelIn('en', entry.labelKey),
    labelIn('fr', entry.labelKey),
    ...(entry.aliases || []),
    entry.settingKey || '',
    entry.tab,
  ];
  return normalizeSearchText(parts.filter(Boolean).join(' '));
}

export type AdminSearchHit = AdminSearchEntry & {
  score: number;
  displayLabel: string;
};

/**
 * Match query against EN+FR labels/aliases. Higher score = better.
 */
export function searchAdminIndex(
  query: string,
  displayT: (key: string) => string,
  limit = 12
): AdminSearchHit[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const hits: AdminSearchHit[] = [];

  for (const entry of ADMIN_SEARCH_INDEX) {
    const hay = buildSearchHaystack(entry);
    if (!hay) continue;

    let score = 0;
    if (hay === q) score = 100;
    else if (hay.startsWith(q)) score = 80;
    else if (hay.includes(` ${q}`) || hay.includes(q)) score = 50;
    else continue;

    // Prefer settings slightly when query looks like a field token
    if (entry.kind === 'setting' && entry.settingKey) {
      const keyNorm = normalizeSearchText(entry.settingKey.replace(/_/g, ' '));
      if (keyNorm.includes(q) || normalizeSearchText(entry.settingKey).includes(q)) {
        score += 10;
      }
    }

    hits.push({
      ...entry,
      score,
      displayLabel: displayT(entry.labelKey),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.displayLabel.localeCompare(b.displayLabel));
  return hits.slice(0, limit);
}

const HIGHLIGHT_CLASS = 'admin-setting-search-highlight';
const HIGHLIGHT_MS = 2000;

/** Scroll to [data-setting-key] after the target tab has mounted. */
export function scrollToAdminSetting(settingKey: string, attempts = 12): void {
  const tryScroll = (left: number) => {
    const safeKey = String(settingKey).replace(/\\/g, '').replace(/"/g, '');
    const el = document.querySelector(
      `[data-setting-key="${safeKey}"]`
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add(HIGHLIGHT_CLASS);
      window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
      return;
    }
    if (left > 0) {
      window.setTimeout(() => tryScroll(left - 1), 50);
    }
  };
  requestAnimationFrame(() => tryScroll(attempts));
}
