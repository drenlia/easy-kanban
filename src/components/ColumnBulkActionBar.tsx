import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Copy,
  Layers,
  Square,
  Tag as TagIcon,
  Trash2,
  Calendar,
  Flag,
} from 'lucide-react';
import { Board, PriorityOption, Tag } from '../types';
import { KanbanChromeTooltip } from './KanbanChromeTooltip';
import { getTagDisplayStyle } from '../utils/tagUtils';

export type ColumnBulkActionBarProps = {
  columnId: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  selectedCount: number;
  showUnselectAll?: boolean;
  isAdmin?: boolean;
  hasArchiveColumn?: boolean;
  availableTags?: Tag[];
  availablePriorities?: PriorityOption[];
  availableSprints?: Array<{ id: string; name: string }>;
  boards?: Board[];
  currentBoardId?: string | null;
  busy?: boolean;
  onUnselectAll: () => void;
  onAddTag: (tagId: string) => void;
  onCopy: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSprint: (sprintId: string | null) => void;
  onPriority: (priorityId: string) => void;
  onMoveToBoard: (boardId: string) => void;
};

type MenuKind = 'tag' | 'sprint' | 'priority' | 'board' | null;

const btnClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';

export default function ColumnBulkActionBar({
  columnId,
  anchorRef,
  selectedCount,
  showUnselectAll = false,
  isAdmin = false,
  hasArchiveColumn = false,
  availableTags = [],
  availablePriorities = [],
  availableSprints = [],
  boards = [],
  currentBoardId = null,
  busy = false,
  onUnselectAll,
  onAddTag,
  onCopy,
  onArchive,
  onDelete,
  onSprint,
  onPriority,
  onMoveToBoard,
}: ColumnBulkActionBarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [boardConfirm, setBoardConfirm] = useState<{ id: string; name: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const [rootPos, setRootPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });

  useEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      const column = anchor?.closest('.column-container') as HTMLElement | null;
      if (!anchor || !column) {
        setRootPos((prev) => ({ ...prev, visible: false }));
        return;
      }

      const columnRect = column.getBoundingClientRect();
      const headerRect = anchor.getBoundingClientRect();
      const visible =
        columnRect.right > 0 &&
        columnRect.left < window.innerWidth &&
        columnRect.bottom > 0 &&
        columnRect.top < window.innerHeight;

      setRootPos({
        // Keep the controls below the column header while the board scrolls vertically.
        top: Math.max(96, headerRect.bottom + 4),
        // Half-in / half-out of the column edge, but never clipped by the viewport.
        left: Math.max(16, columnRect.left + 2),
        visible,
      });
    };

    update();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener('resize', update);
    // Capture scrolls from the horizontal board scroller as well as the page.
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  const openMenu = (kind: MenuKind, el: HTMLElement | null) => {
    if (!el) return;
    // Same button again closes the submenu.
    if (menu === kind) {
      setMenu(null);
      setMenuPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 256;
    const preferredLeft = rect.right + 6;
    setMenuPos({
      top: Math.max(8, Math.min(rect.top, window.innerHeight - menuHeight - 8)),
      left:
        preferredLeft + menuWidth <= window.innerWidth - 8
          ? preferredLeft
          : Math.max(8, rect.left - menuWidth - 6),
    });
    setMenu(kind);
    setDeleteConfirm(false);
    setBoardConfirm(null);
  };

  const overlayOpen = !!menu || deleteConfirm || !!boardConfirm;

  useEffect(() => {
    if (!menu && !deleteConfirm && !boardConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        setDeleteConfirm(false);
        setBoardConfirm(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (confirmRef.current?.contains(target)) return;
      const portal = document.getElementById(`column-bulk-menu-${columnId}`);
      if (portal?.contains(target)) return;
      setMenu(null);
      setDeleteConfirm(false);
      setBoardConfirm(null);
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menu, deleteConfirm, boardConfirm, columnId]);

  const otherBoards = boards.filter((b) => b.id !== currentBoardId && !(b as any).deletedAt);

  const menuPortal =
    menu && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={`column-bulk-menu-${columnId}`}
            className="fixed z-[9990] max-h-64 w-48 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            {menu === 'tag' &&
              availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    onAddTag(String(tag.id));
                    setMenu(null);
                  }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                    style={{ backgroundColor: getTagDisplayStyle(tag).backgroundColor }}
                  />
                  <span
                    className="min-w-0 truncate rounded px-1.5 py-0.5 font-medium"
                    style={getTagDisplayStyle(tag)}
                  >
                    {tag.tag}
                  </span>
                </button>
              ))}
            {menu === 'sprint' && (
              <>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    onSprint(null);
                    setMenu(null);
                  }}
                >
                  {t('kanbanSelect.noSprint')}
                </button>
                {availableSprints.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => {
                      onSprint(s.id);
                      setMenu(null);
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </>
            )}
            {menu === 'priority' &&
              availablePriorities.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    onPriority(p.id);
                    setMenu(null);
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.priority}
                </button>
              ))}
            {menu === 'board' &&
              otherBoards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    setMenu(null);
                    setBoardConfirm({ id: b.id, name: b.title || b.id });
                  }}
                >
                  {b.title || b.id}
                </button>
              ))}
            {menu === 'tag' && availableTags.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">{t('labels.noTagsAvailable')}</div>
            )}
            {menu === 'board' && otherBoards.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">—</div>
            )}
          </div>,
          document.body
        )
      : null;

  const confirmPortal =
    (deleteConfirm || boardConfirm) && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={confirmRef}
            role="dialog"
            aria-modal="true"
            className="fixed z-[9991] w-72 rounded-lg border border-red-200 bg-white p-3 shadow-lg dark:border-red-800 dark:bg-gray-900"
            style={{
              top: menuPos?.top ?? 120,
              left: menuPos?.left ?? 80,
            }}
          >
            <p className="mb-2 text-xs text-gray-700 dark:text-gray-200">
              {deleteConfirm
                ? t('kanbanSelect.deleteConfirm', { count: selectedCount })
                : t('kanbanSelect.moveToBoardConfirm', {
                    count: selectedCount,
                    board: boardConfirm?.name,
                  })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => {
                  setDeleteConfirm(false);
                  setBoardConfirm(null);
                }}
              >
                {t('buttons.cancel', { ns: 'common' })}
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                onClick={() => {
                  if (deleteConfirm) onDelete();
                  if (boardConfirm) onMoveToBoard(boardConfirm.id);
                  setDeleteConfirm(false);
                  setBoardConfirm(null);
                }}
              >
                {deleteConfirm ? t('kanbanSelect.delete') : t('kanbanSelect.moveToBoard')}
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  const actionBarPortal =
    typeof document !== 'undefined'
      ? createPortal(
      <div
        ref={rootRef}
        className={`pointer-events-auto fixed z-[9980] flex -translate-x-1/2 flex-col gap-1 ${
          rootPos.visible ? '' : 'invisible'
        }`}
        style={{ top: rootPos.top, left: rootPos.left }}
        data-testid={`column-bulk-fab-${columnId}`}
      >
        <div className="flex flex-col gap-1">
          {showUnselectAll && (
            <KanbanChromeTooltip
              label={overlayOpen ? '' : t('kanbanSelect.unselectAll')}
              delayMs={0}
              placement="top"
            >
              <button
                type="button"
                disabled={busy}
                className={btnClass}
                onClick={onUnselectAll}
                aria-label={t('kanbanSelect.unselectAll')}
              >
                <Square size={14} />
              </button>
            </KanbanChromeTooltip>
          )}
          <KanbanChromeTooltip
            label={overlayOpen ? '' : t('kanbanSelect.addTag')}
            delayMs={0}
            placement="top"
          >
            <button
              type="button"
              disabled={busy}
              className={btnClass}
              onClick={(e) => openMenu('tag', e.currentTarget)}
              aria-label={t('kanbanSelect.addTag')}
            >
              <TagIcon size={14} />
            </button>
          </KanbanChromeTooltip>
          <KanbanChromeTooltip
            label={overlayOpen ? '' : t('kanbanSelect.copy')}
            delayMs={0}
            placement="top"
          >
            <button
              type="button"
              disabled={busy}
              className={btnClass}
              onClick={onCopy}
              aria-label={t('kanbanSelect.copy')}
            >
              <Copy size={14} />
            </button>
          </KanbanChromeTooltip>
          {hasArchiveColumn && (
            <KanbanChromeTooltip
              label={overlayOpen ? '' : t('kanbanSelect.archive')}
              delayMs={0}
              placement="top"
            >
              <button
                type="button"
                disabled={busy}
                className={btnClass}
                onClick={onArchive}
                aria-label={t('kanbanSelect.archive')}
              >
                <Archive size={14} />
              </button>
            </KanbanChromeTooltip>
          )}
          <KanbanChromeTooltip
            label={overlayOpen ? '' : t('kanbanSelect.delete')}
            delayMs={0}
            placement="top"
          >
            <button
              type="button"
              disabled={busy}
              className={`${btnClass} text-red-600 hover:text-red-700`}
              onClick={(e) => {
                if (deleteConfirm) {
                  setDeleteConfirm(false);
                  setMenuPos(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const popupWidth = 288;
                setMenuPos({
                  top: Math.max(8, Math.min(rect.top, window.innerHeight - 160)),
                  left:
                    rect.right + 6 + popupWidth <= window.innerWidth - 8
                      ? rect.right + 6
                      : Math.max(8, rect.left - popupWidth - 6),
                });
                setDeleteConfirm(true);
                setMenu(null);
                setBoardConfirm(null);
              }}
              aria-label={t('kanbanSelect.delete')}
            >
              <Trash2 size={14} />
            </button>
          </KanbanChromeTooltip>
          <KanbanChromeTooltip
            label={overlayOpen ? '' : t('kanbanSelect.sprint')}
            delayMs={0}
            placement="top"
          >
            <button
              type="button"
              disabled={busy}
              className={btnClass}
              onClick={(e) => openMenu('sprint', e.currentTarget)}
              aria-label={t('kanbanSelect.sprint')}
            >
              <Calendar size={14} />
            </button>
          </KanbanChromeTooltip>
          <KanbanChromeTooltip
            label={overlayOpen ? '' : t('kanbanSelect.priority')}
            delayMs={0}
            placement="top"
          >
            <button
              type="button"
              disabled={busy}
              className={btnClass}
              onClick={(e) => openMenu('priority', e.currentTarget)}
              aria-label={t('kanbanSelect.priority')}
            >
              <Flag size={14} />
            </button>
          </KanbanChromeTooltip>
          {isAdmin && otherBoards.length > 0 && (
            <KanbanChromeTooltip
              label={overlayOpen ? '' : t('kanbanSelect.moveToBoard')}
              delayMs={0}
              placement="top"
            >
              <button
                type="button"
                disabled={busy}
                className={btnClass}
                onClick={(e) => openMenu('board', e.currentTarget)}
                aria-label={t('kanbanSelect.moveToBoard')}
              >
                <Layers size={14} />
              </button>
            </KanbanChromeTooltip>
          )}
        </div>
      </div>,
      document.body
        )
      : null;

  return (
    <>
      {actionBarPortal}
      {menuPortal}
      {confirmPortal}
    </>
  );
}
