import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Minus, Bot, Loader2, Settings2, Activity } from 'lucide-react';
import type { TaskWorkMap } from '../api';
import type { Comment, TeamMember } from '../types';
import AgentWorkingModal from './AgentWorkingModal';
import AssignToAgentModal, {
  type AgentJobMode,
  type AutomationScope,
} from './AssignToAgentModal';
import {
  canStartOrRestartAgent,
  isAgentIdleStatus,
} from '../constants/appConstants';
import {
  claimAgentPanelExpanded,
  ensureAgentChipDock,
  releaseAgentPanel,
} from '../utils/agentPanelDock';

export type AgentPanelView = 'activity' | 'configure';

interface AgentPanelProps {
  panelId: string;
  taskTitle: string;
  taskTicket?: string | null;
  taskDescription?: string;
  work: TaskWorkMap;
  comments?: Comment[];
  members?: TeamMember[];
  isAdmin?: boolean;
  busy?: boolean;
  boards?: { id: string; title: string }[];
  initialView?: AgentPanelView;
  view?: AgentPanelView;
  onViewChange?: (view: AgentPanelView) => void;
  /** Bump to force-restore when reopening from the card/details while minimized. */
  restoreToken?: number;
  onClose: () => void;
  onControl: (control: 'pause' | 'stop' | 'resume' | 'apply') => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
  onRefine?: (text: string, options: { restart: boolean }) => void | Promise<void>;
  onSaveConfig: (
    repoUrl: string,
    repoBranch: string,
    options?: {
      restart?: boolean;
      llmModel?: string;
      launch?: boolean;
      agentMode?: AgentJobMode;
      automationScope?: AutomationScope;
      automationBoardIds?: string[];
      description?: string;
    }
  ) => void | Promise<void>;
}

/**
 * Single Agent shell: Activity and Configuration as tabs.
 * Minimize collapses to a chip in a shared stacked dock.
 */
const AgentPanel: React.FC<AgentPanelProps> = ({
  panelId,
  taskTitle,
  taskTicket,
  taskDescription = '',
  work,
  comments,
  members,
  isAdmin = false,
  busy,
  boards = [],
  initialView = 'activity',
  view: controlledView,
  onViewChange,
  restoreToken = 0,
  onClose,
  onControl,
  onUndo,
  onRefine,
  onSaveConfig,
}) => {
  const { t } = useTranslation('common');
  const [internalView, setInternalView] = useState<AgentPanelView>(initialView);
  const [minimized, setMinimized] = useState(false);

  const view = controlledView ?? internalView;
  const setView = (next: AgentPanelView) => {
    onViewChange?.(next);
    if (controlledView === undefined) setInternalView(next);
  };

  useEffect(() => {
    if (controlledView !== undefined) return;
    setInternalView(initialView);
  }, [initialView, controlledView]);

  useEffect(() => {
    if (restoreToken > 0) {
      setMinimized(false);
    }
  }, [restoreToken]);

  useEffect(() => {
    if (minimized) {
      releaseAgentPanel(panelId);
      return;
    }
    claimAgentPanelExpanded(panelId, {
      minimize: () => setMinimized(true),
    });
    return () => releaseAgentPanel(panelId);
  }, [panelId, minimized]);

  const agentStatus = work.status || null;
  const statusLabel = isAgentIdleStatus(agentStatus)
    ? t('agent.statusIdle')
    : t(`agent.status_${agentStatus}`, {
        defaultValue: String(agentStatus || t('agent.status')),
      });

  const label = taskTicket || taskTitle;
  const chipTitle = `${label} — ${statusLabel}`;

  const restore = () => setMinimized(false);
  const minimize = () => setMinimized(true);

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
      active
        ? 'border-teal-600 text-teal-800 dark:text-teal-200'
        : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
    }`;

  if (minimized) {
    return createPortal(
      <div className="pointer-events-auto flex items-center gap-1" data-agent-chip={panelId}>
        <button
          type="button"
          onClick={restore}
          className="inline-flex items-center gap-2 max-w-[min(18rem,calc(100vw-5rem))] rounded-full border border-teal-200 dark:border-teal-800 bg-white dark:bg-gray-800 shadow-lg px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
          title={t('agent.restorePanel')}
        >
          {agentStatus === 'running' || agentStatus === 'queued' ? (
            <Loader2 size={16} className="text-teal-600 animate-spin shrink-0" />
          ) : (
            <Bot size={16} className="text-teal-700 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
              {label}
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
              {statusLabel}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-100"
          title={t('agent.closePanel')}
          aria-label={t('agent.closePanel')}
        >
          <X size={16} />
        </button>
      </div>,
      ensureAgentChipDock()
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={minimize}
      onKeyDown={(e) => {
        if (e.key === 'Escape') minimize();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl h-[min(80vh,720px)] flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={chipTitle}
      >
        <div className="flex items-start gap-2 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 pt-2.5 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 truncate mb-1">
              {taskTicket ? `${taskTicket} · ${taskTitle}` : taskTitle}
            </p>
            <div className="flex items-center gap-1" role="tablist" aria-label={t('agent.panelTabs')}>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'activity'}
                className={tabClass(view === 'activity')}
                onClick={() => setView('activity')}
              >
                <Activity size={14} />
                {t('agent.workingTitle')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'configure'}
                className={tabClass(view === 'configure')}
                onClick={() => setView('configure')}
              >
                <Settings2 size={14} />
                {t('agent.configuration')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={minimize}
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              title={t('agent.minimizePanel')}
              aria-label={t('agent.minimizePanel')}
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              title={t('agent.closePanel')}
              aria-label={t('agent.closePanel')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {view === 'activity' ? (
            <AgentWorkingModal
              embedded
              taskTitle={taskTitle}
              work={work}
              comments={comments}
              members={members}
              busy={busy}
              isAdmin={isAdmin}
              onClose={onClose}
              onControl={onControl}
              onUndo={onUndo}
              onRefine={onRefine}
              onOpenConfig={() => setView('configure')}
            />
          ) : (
            <AssignToAgentModal
              embedded
              mode="configure"
              taskTitle={taskTitle}
              taskDescription={taskDescription}
              isAdmin={isAdmin}
              boards={boards}
              initialAgentMode={
                (String(work.agent_mode || '') as AgentJobMode) || undefined
              }
              initialAutomationScope={String(work.automation_scope || 'this_board')}
              initialAutomationBoardIds={(() => {
                try {
                  return JSON.parse(String(work.automation_board_ids || '[]'));
                } catch {
                  return [];
                }
              })()}
              initialLlmModel={String(work.llm_model || '')}
              initialRepoUrl={String(work.repo_url || '')}
              initialRepoBranch={String(work.repo_branch || '')}
              canRestart={canStartOrRestartAgent(agentStatus)}
              isFirstStart={isAgentIdleStatus(agentStatus)}
              appliesNextRun={
                !!agentStatus &&
                !isAgentIdleStatus(agentStatus) &&
                ['queued', 'running', 'paused', 'waiting'].includes(
                  String(agentStatus)
                )
              }
              descriptionLocked={
                !!agentStatus &&
                !isAgentIdleStatus(agentStatus) &&
                ['queued', 'running', 'paused', 'waiting'].includes(
                  String(agentStatus)
                )
              }
              onCancel={() => setView('activity')}
              onConfirm={async (repoUrl, repoBranch, options) => {
                await onSaveConfig(repoUrl, repoBranch, options);
                setView('activity');
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AgentPanel;
