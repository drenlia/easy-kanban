import { useEffect } from 'react';
import type { ViewMode } from '../utils/userPreferences';
import {
  focusHeaderTaskSearch,
  isTypingTarget,
  shouldIgnoreBoardShortcut,
} from '../utils/keyboardShortcutUtils';

export type KeyboardShortcutHandlers = {
  onHelp: () => void;
  /** Focus board header search (/ and Ctrl/Cmd+K). Only used when boardShortcutsEnabled. */
  onFocusSearch?: () => void;
  /** Create a task on the first column (N). */
  onNewTask?: () => void;
  /** Switch Kanban / List / Gantt (1 / 2 / 3). */
  onViewMode?: (mode: ViewMode) => void;
  /** When true, N, 1–3, /, Ctrl+K board search are active. */
  boardShortcutsEnabled?: boolean;
};

/**
 * Global keyboard shortcuts.
 * Character shortcuts never fire while typing in inputs / TipTap / overlays.
 * F1 always opens Help; ? opens Help when not typing.
 */
export const useKeyboardShortcuts = ({
  onHelp,
  onFocusSearch,
  onNewTask,
  onViewMode,
  boardShortcutsEnabled = false,
}: KeyboardShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F1 — always available (does not insert text)
      if (event.key === 'F1') {
        event.preventDefault();
        onHelp();
        return;
      }

      // ? — help when not typing (Shift+/ on US layouts)
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        onHelp();
        return;
      }

      if (!boardShortcutsEnabled) return;
      if (shouldIgnoreBoardShortcut(event)) return;
      if (event.repeat) return;

      const mod = event.metaKey || event.ctrlKey;

      // Ctrl/Cmd+K — focus search
      if (mod && !event.altKey && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        if (onFocusSearch) onFocusSearch();
        else focusHeaderTaskSearch();
        return;
      }

      // Plain / — focus search (Admin page keeps its own / handler when boardShortcutsEnabled is false)
      if (event.key === '/' && !mod && !event.altKey) {
        event.preventDefault();
        if (onFocusSearch) onFocusSearch();
        else focusHeaderTaskSearch();
        return;
      }

      // N — new task
      if ((event.key === 'n' || event.key === 'N') && !mod && !event.altKey) {
        if (!onNewTask) return;
        event.preventDefault();
        onNewTask();
        return;
      }

      // 1 / 2 / 3 — view modes (key value so AZERTY Shift+digit still works)
      if (!mod && !event.altKey && onViewMode) {
        if (event.key === '1') {
          event.preventDefault();
          onViewMode('kanban');
          return;
        }
        if (event.key === '2') {
          event.preventDefault();
          onViewMode('list');
          return;
        }
        if (event.key === '3') {
          event.preventDefault();
          onViewMode('gantt');
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onHelp, onFocusSearch, onNewTask, onViewMode, boardShortcutsEnabled]);
};
