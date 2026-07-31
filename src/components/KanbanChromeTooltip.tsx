import React, { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shared inverted chrome surface — high contrast in both themes:
 * light UI → dark bubble; dark UI → light bubble.
 */
export const CHROME_TOOLTIP_COLORS =
  'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900';

/** Subtle edge so the bubble stays crisp on matching backgrounds. */
export const CHROME_TOOLTIP_RING =
  'ring-1 ring-white/10 dark:ring-black/10';

/** Visual chrome only (positioning applied separately: absolute in-list or fixed + portal). */
export const CHROME_TOOLTIP_SURFACE_CLASS =
  `px-2 py-1 text-xs font-normal normal-case tracking-normal whitespace-nowrap rounded shadow-lg ${CHROME_TOOLTIP_COLORS} ${CHROME_TOOLTIP_RING} pointer-events-none`;

/** Same surface as {@link CHROME_TOOLTIP_SURFACE_CLASS} but vertical list / wrapped text (e.g. watchers & collaborators). */
export const CHROME_TOOLTIP_MULTILINE_SURFACE_CLASS =
  `px-2 py-1.5 text-xs font-normal normal-case tracking-normal whitespace-pre-line text-left max-w-[min(18rem,calc(100vw-2rem))] break-words leading-snug rounded shadow-lg ${CHROME_TOOLTIP_COLORS} ${CHROME_TOOLTIP_RING} pointer-events-none`;

/** Rich / multi-block hover content (Gantt bars, activity details). */
export const CHROME_TOOLTIP_RICH_SURFACE_CLASS =
  `px-3 py-2 text-xs font-normal normal-case tracking-normal text-left max-w-sm rounded-lg shadow-lg ${CHROME_TOOLTIP_COLORS} ${CHROME_TOOLTIP_RING} pointer-events-none`;

/**
 * Interactive preview panels (comment hover). Keep pointer events so users can scroll/click inside.
 * Pair with `.comment-tooltip` / `.comment-tooltip-active` DnD lock in index.css when needed.
 */
export const CHROME_TOOLTIP_PANEL_SURFACE_CLASS =
  `w-80 max-h-64 flex flex-col text-xs rounded-md shadow-lg border border-gray-700 dark:border-gray-300 ${CHROME_TOOLTIP_COLORS}`;

/** Muted secondary text inside rich/panel tooltips. */
export const CHROME_TOOLTIP_MUTED_TEXT_CLASS =
  'text-gray-300 dark:text-gray-600';

/** Divider inside rich/panel tooltips. */
export const CHROME_TOOLTIP_DIVIDER_CLASS =
  'border-gray-700 dark:border-gray-300';

/** In-flow / list-view: positioned under anchor */
export const CHROME_TOOLTIP_POPOVER_CLASS =
  `absolute left-0 z-[70] ${CHROME_TOOLTIP_SURFACE_CLASS}`;

/** Below portaled dropdowns (9999), above task chrome (DONE/LATE ~30, toolbar stacking). */
const CHROME_TOOLTIP_PORTAL_Z = 9980;

/** ~native `title` delay */
export const CHROME_TOOLTIP_DELAY_MS = 650;

type KanbanChromeTooltipProps = {
  /** No tooltip when empty */
  label: string;
  children: ReactNode;
  /** `0` = show immediately (e.g. sprint). Default = delayed like browser `title`. */
  delayMs?: number;
  wrapperClassName?: string;
  /** `bottom` = below anchor (default), `top` = above */
  placement?: 'bottom' | 'top';
};

/**
 * App-wide chrome tooltips: inverted light/dark surface; optional delay (default ~native title).
 * Bubble is portaled to `document.body` so it is not trapped under sibling z-index.
 */
export function KanbanChromeTooltip({
  label,
  children,
  delayMs = CHROME_TOOLTIP_DELAY_MS,
  wrapperClassName = 'relative inline-flex',
  placement = 'bottom',
}: KanbanChromeTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    clearTimer();
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    timerRef.current = setTimeout(() => setVisible(true), delayMs);
  };

  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  /** mouseleave on the wrapper can miss when crossing a pointer-events-none popover; mouseout/pointerout bubble and relatedTarget reflects the real exit. */
  const hideIfExitedContainer = (
    e: React.MouseEvent<HTMLSpanElement> | React.PointerEvent<HTMLSpanElement>
  ) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) {
      return;
    }
    hide();
  };

  useLayoutEffect(() => {
    if (!visible) {
      setPortalStyle(null);
      return;
    }

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (placement === 'bottom') {
        setPortalStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          zIndex: CHROME_TOOLTIP_PORTAL_Z,
        });
      } else {
        setPortalStyle({
          position: 'fixed',
          top: rect.top - 4,
          left: rect.left,
          zIndex: CHROME_TOOLTIP_PORTAL_Z,
          transform: 'translateY(-100%)',
        });
      }
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, placement]);

  useEffect(() => () => clearTimer(), []);

  if (!label) {
    return <>{children}</>;
  }

  const tooltipClassName = label.includes('\n')
    ? CHROME_TOOLTIP_MULTILINE_SURFACE_CLASS
    : CHROME_TOOLTIP_SURFACE_CLASS;

  const portal =
    visible && portalStyle && typeof document !== 'undefined'
      ? createPortal(
          <span role="tooltip" className={tooltipClassName} style={portalStyle}>
            {label}
          </span>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={wrapperClassName}
        onMouseEnter={show}
        onMouseOut={hideIfExitedContainer}
        onPointerOut={hideIfExitedContainer}
      >
        {children}
      </span>
      {portal}
    </>
  );
}
