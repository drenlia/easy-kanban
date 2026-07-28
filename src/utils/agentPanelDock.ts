/**
 * Shared bottom-right dock for minimized Agent panel chips (stacks instead of overlapping).
 */
const DOCK_ID = 'easy-kanban-agent-chip-dock';

export function ensureAgentChipDock(): HTMLElement {
  let el = document.getElementById(DOCK_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = DOCK_ID;
    el.setAttribute('data-agent-chip-dock', 'true');
    el.className =
      'fixed bottom-4 right-4 z-[100050] flex flex-col-reverse gap-2 items-end max-h-[min(70vh,calc(100vh-2rem))] overflow-y-auto pointer-events-none';
    document.body.appendChild(el);
  }
  return el;
}

type PanelHandlers = { minimize: () => void };

const expandedPanels = new Map<string, PanelHandlers>();

/** Only one Agent panel overlay at a time — others auto-minimize. */
export function claimAgentPanelExpanded(panelId: string, handlers: PanelHandlers) {
  for (const [id, h] of expandedPanels) {
    if (id !== panelId) {
      try {
        h.minimize();
      } catch {
        /* ignore */
      }
    }
  }
  expandedPanels.set(panelId, handlers);
}

export function releaseAgentPanel(panelId: string) {
  expandedPanels.delete(panelId);
}
