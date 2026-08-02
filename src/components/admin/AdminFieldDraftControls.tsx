import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import {
  formatSavedSettingDisplay,
  isAdminSettingFieldDirty,
} from '../../utils/adminSettingsDirty';

interface AdminFieldDraftControlsProps {
  /** Settings key — used with saved/draft maps when provided */
  settingKey?: string;
  saved?: Record<string, string | undefined>;
  draft?: Record<string, string | undefined>;
  /** Explicit dirty override (local AI / reporting state) */
  dirty?: boolean;
  /** Explicit previous value for “Was: …” (local drafts) */
  savedValue?: string;
  onRevert: () => void;
  /** Hide “Was: …” helper */
  hideWas?: boolean;
  className?: string;
}

/**
 * Amber dirty mark + Revert for manual-save Admin fields.
 * Pass either (settingKey + saved + draft) or (dirty + savedValue).
 */
export const AdminFieldDraftControls: React.FC<AdminFieldDraftControlsProps> = ({
  settingKey,
  saved,
  draft,
  dirty: dirtyProp,
  savedValue,
  onRevert,
  hideWas = false,
  className = '',
}) => {
  const { t } = useTranslation('admin');

  const dirty =
    dirtyProp ??
    (settingKey && saved && draft
      ? isAdminSettingFieldDirty(settingKey, saved, draft)
      : false);

  if (!dirty) return null;

  const was =
    savedValue !== undefined
      ? formatSavedSettingDisplay(savedValue)
      : settingKey && saved
        ? formatSavedSettingDisplay(saved[settingKey])
        : '';

  return (
    <span
      className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}
      role="status"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
        title={t('unsavedChanges')}
        aria-label={t('unsavedChanges')}
      />
      <button
        type="button"
        onClick={onRevert}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
      >
        <RotateCcw size={11} aria-hidden />
        {t('revertField')}
      </button>
      {!hideWas && was !== '' && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[12rem]" title={was}>
          {t('wasValue', { value: was })}
        </span>
      )}
    </span>
  );
};

/** Tiny amber dot for tab / subtab labels. */
export const AdminDirtyDot: React.FC<{ show: boolean; className?: string }> = ({
  show,
  className = '',
}) => {
  const { t } = useTranslation('admin');
  if (!show) return null;
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 ${className}`}
      title={t('unsavedChanges')}
      aria-label={t('unsavedChanges')}
    />
  );
};
