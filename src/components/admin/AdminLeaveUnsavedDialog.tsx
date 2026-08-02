import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export type AdminDraftGate = {
  hasSharedDirty: boolean;
  hasLocalDirty: boolean;
  /** Persist shared editingSettings; resolves with whether tab-local drafts remain. */
  saveShared: () => Promise<{ hasLocalDirtyStill: boolean }>;
  discardAll: () => void;
};

interface AdminLeaveUnsavedDialogProps {
  open: boolean;
  gate: AdminDraftGate;
  onStay: () => void;
  /** Called after discard (and optional shared save) when it is safe to leave Admin. */
  onLeave: () => void;
}

/**
 * Prompt when leaving Admin with unsaved drafts.
 * Stay / Discard & leave / Save & leave (shared settings).
 * Local-only drafts (AI, Reporting, Lifecycle) must be saved on their tabs or discarded here.
 */
export const AdminLeaveUnsavedDialog: React.FC<AdminLeaveUnsavedDialogProps> = ({
  open,
  gate,
  onStay,
  onLeave,
}) => {
  const { t } = useTranslation('admin');
  const [saving, setSaving] = useState(false);
  const [localRemaining, setLocalRemaining] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setLocalRemaining(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onStay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onStay]);

  useEffect(() => {
    if (!open) return;
    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onPointerDown = (e: PointerEvent) => {
        if (saving) return;
        const target = e.target as Node | null;
        if (panelRef.current && target && !panelRef.current.contains(target)) {
          onStay();
        }
      };
      document.addEventListener('pointerdown', onPointerDown);
      remove = () => document.removeEventListener('pointerdown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      remove?.();
    };
  }, [open, saving, onStay]);

  if (!open) return null;

  const onlyLocal = !gate.hasSharedDirty && gate.hasLocalDirty;
  const showSave = gate.hasSharedDirty && !localRemaining;

  const message = localRemaining
    ? t('leaveUnsavedSharedSavedLocalHint')
    : onlyLocal
      ? t('leaveUnsavedLocalOnlyHint')
      : t('leaveUnsavedMessage');

  const handleDiscard = () => {
    gate.discardAll();
    onLeave();
  };

  const handleSave = async () => {
    if (!gate.hasSharedDirty) return;
    setSaving(true);
    try {
      const { hasLocalDirtyStill } = await gate.saveShared();
      if (hasLocalDirtyStill) {
        setLocalRemaining(true);
        return;
      }
      onLeave();
    } catch {
      // saveShared should toast; keep dialog open
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-leave-unsaved-title"
      >
        <div className="mb-4 flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3
              id="admin-leave-unsaved-title"
              className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100"
            >
              {t('leaveUnsavedTitle')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onStay}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            {t('leaveStay')}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950"
          >
            {t('leaveDiscard')}
          </button>
          {showSave && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {saving ? t('users.saving') : t('leaveSave')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminLeaveUnsavedDialog;
