/**
 * Automation agent loop: LLM tool calls against Easy Kanban automation API.
 * Phases: discover → dry_run plan → await apply → apply stored plan → finish.
 */

import { chat } from './llmClient.js';
import { stripModelReasoning } from './stripReasoning.js';
import { sendCallback } from './callback.js';
import { updateJob, removeJob } from './jobQueue.js';
import { AUTOMATION_MAX_TOOL_STEPS } from './automationConstants.js';

const MAX_STEPS = AUTOMATION_MAX_TOOL_STEPS || 40;

const TOOLS = [
  {
    name: 'list_capabilities',
    description: 'List allowed and denied automation capabilities',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'list_boards',
    description: 'List boards in scope',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'list_columns',
    description: 'List columns for a board',
    parameters: {
      type: 'object',
      properties: { boardId: { type: 'string' } },
      required: ['boardId']
    }
  },
  {
    name: 'list_sprints',
    description: 'List sprints',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'list_members',
    description: 'List team members',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'list_tags',
    description: 'List tags',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'list_priorities',
    description: 'List priorities',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'search_tasks',
    description:
      'Search tasks in scope (compact summaries). Filter by boardId, sprintId, columnId, text, assigneeId, tagId.',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        sprintId: { type: 'string' },
        columnId: { type: 'string' },
        text: { type: 'string' },
        assigneeId: { type: 'string' },
        tagId: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'get_task',
    description: 'Get full details for one task by id',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId']
    }
  },
  {
    name: 'create_task',
    description: 'Create a task (dry-run first in plan phase)',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        columnId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['boardId', 'columnId', 'title']
    }
  },
  {
    name: 'update_tasks',
    description: 'Bulk update task fields. Use dryRun:true while planning.',
    parameters: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' } },
        fields: { type: 'object' },
        dryRun: { type: 'boolean' }
      },
      required: ['taskIds', 'fields']
    }
  },
  {
    name: 'move_tasks',
    description: 'Move tasks to a column. Use dryRun:true while planning.',
    parameters: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' } },
        columnId: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['taskIds', 'columnId']
    }
  },
  {
    name: 'set_task_sprint',
    description: 'Assign tasks to a sprint. Use dryRun:true while planning.',
    parameters: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' } },
        sprintId: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['taskIds', 'sprintId']
    }
  },
  {
    name: 'create_sprint',
    description: 'Create a sprint',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        description: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['name']
    }
  },
  {
    name: 'update_sprint',
    description: 'Update a sprint',
    parameters: {
      type: 'object',
      properties: {
        sprintId: { type: 'string' },
        name: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        description: { type: 'string' },
        isActive: { type: 'boolean' },
        dryRun: { type: 'boolean' }
      },
      required: ['sprintId']
    }
  },
  {
    name: 'create_column',
    description: 'Create a column on a board',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        title: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['boardId', 'title']
    }
  },
  {
    name: 'rename_column',
    description: 'Rename a column',
    parameters: {
      type: 'object',
      properties: {
        columnId: { type: 'string' },
        title: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['columnId', 'title']
    }
  },
  {
    name: 'create_board',
    description: 'Create a board',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['title']
    }
  },
  {
    name: 'rename_board',
    description: 'Rename a board',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        title: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['boardId', 'title']
    }
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a task',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        text: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['taskId', 'text']
    }
  },
  {
    name: 'export_tasks_xlsx',
    description: 'Export tasks in scope to XLSX attached to the automation task',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        dryRun: { type: 'boolean' }
      }
    }
  },
  {
    name: 'export_tasks_csv',
    description: 'Export tasks in scope to CSV attached to the automation task',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        dryRun: { type: 'boolean' }
      }
    }
  },
  {
    name: 'submit_dry_run_plan',
    description:
      'Submit the planned mutations for admin preview. Call this when discovery is done and before waiting for Apply. operations: [{name, arguments}]',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              arguments: { type: 'object' }
            }
          }
        }
      },
      required: ['summary', 'operations']
    }
  },
  {
    name: 'finish',
    description: 'Finish with a human summary of outcomes',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        matched: { type: 'number' },
        changed: { type: 'number' },
        skipped: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } }
      },
      required: ['summary']
    }
  }
];

async function callToolApi(automation, name, args, dryRun = false) {
  const base = String(automation.apiBaseUrl || '').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/agent/automation/tools`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${automation.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ name, arguments: args || {}, dryRun })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: body.error || `HTTP ${res.status}` };
  }
  return body.result ?? body;
}

async function getStatus(automation) {
  const base = String(automation.apiBaseUrl || '').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/agent/automation/status`, {
    headers: {
      Authorization: `Bearer ${automation.token}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) return { control: 'none', status: 'unknown' };
  return res.json();
}

async function applyPlan(automation) {
  const base = String(automation.apiBaseUrl || '').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/agent/automation/apply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${automation.token}`,
      Accept: 'application/json'
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  return body;
}

function buildContext(payload) {
  return [
    `Task ticket: ${payload.ticket || '(none)'}`,
    `Title: ${payload.title || ''}`,
    `Description:\n${payload.description || '(none)'}`,
    `Scope: ${payload.automation?.scopeType || 'this_board'}`,
    payload.automation?.boardIds?.length
      ? `Board IDs: ${payload.automation.boardIds.join(', ')}`
      : '',
    payload.comments?.length
      ? `Recent comments:\n${payload.comments
          .map((c) => `- ${c.author || 'user'}: ${c.text}`)
          .join('\n')
          .slice(0, 6000)}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * @param {object} job
 */
export async function runAutomationJob(job) {
  const payload = job.payload;
  const automation = payload.automation;
  if (!automation?.apiBaseUrl || !automation?.token) {
    throw new Error('Automation apiBaseUrl and token are required');
  }
  if (!payload.llm?.apiKey) {
    throw new Error('LLM apiKey is required');
  }

  updateJob(job.jobId, { status: 'running', progress: 5 });
  await sendCallback(job, {
    event: 'progress',
    progress: 5,
    log: `[runner] Automation mode — discovering board data`
  });

  const system = [
    'You are the Easy Kanban Automation agent (admin-only board operations).',
    'Discover data with list/search tools, then plan mutations with dryRun:true.',
    'Never delete tasks, boards, or columns — those are denied.',
    'When names are ambiguous, prefer IDs from list tools; refuse to guess.',
    'When the plan is ready, call submit_dry_run_plan with a clear summary and operations array',
    '(operations should use dryRun:false arguments — the server applies them only after admin Apply).',
    'After submit_dry_run_plan you will wait; do not mutate further until told Apply succeeded.',
    'Finally call finish with a human summary.',
    'Reply with tool calls only when acting; keep summaries concise.',
    buildContext(payload)
  ].join('\n\n');

  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content:
        'Execute the automation described in the task. Discover first, then submit_dry_run_plan.'
    }
  ];

  let submittedPlan = false;
  let finished = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (job.cancelRequested) {
      throw Object.assign(new Error('Cancelled by user'), { cancelled: true });
    }

    const progress = Math.min(70, 10 + Math.floor((step / MAX_STEPS) * 60));
    updateJob(job.jobId, { progress });

    const reply = await chat(payload.llm, messages, TOOLS);

    if (!reply.toolCalls.length) {
      messages.push({ role: 'assistant', content: reply.content || '' });
      messages.push({
        role: 'user',
        content: submittedPlan
          ? 'Wait for admin Apply — call finish only after apply is confirmed in the next message.'
          : 'Continue with tools, or submit_dry_run_plan when ready.'
      });
      continue;
    }

    messages.push({
      role: 'assistant',
      content: reply.content || '',
      tool_calls: reply.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) }
      }))
    });

    for (const tc of reply.toolCalls) {
      if (tc.name === 'finish') {
        finished = tc.arguments || {};
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: 'ok'
        });
        break;
      }

      const args = { ...(tc.arguments || {}) };
      // Force dry-run for mutating tools before plan submit
      const mutating = [
        'create_task',
        'update_tasks',
        'move_tasks',
        'set_task_sprint',
        'create_sprint',
        'update_sprint',
        'create_column',
        'rename_column',
        'create_board',
        'rename_board',
        'add_comment',
        'export_tasks_xlsx',
        'export_tasks_csv'
      ];
      let dryRun = Boolean(args.dryRun);
      if (!submittedPlan && mutating.includes(tc.name)) {
        dryRun = true;
        args.dryRun = true;
      }

      let result;
      if (tc.name === 'submit_dry_run_plan') {
        result = await callToolApi(automation, tc.name, args, false);
        if (!result.error) {
          submittedPlan = true;
          await sendCallback(job, {
            event: 'progress',
            progress: 75,
            status: 'waiting',
            log: `[runner] Dry-run plan submitted — awaiting admin Apply`,
            comment: stripModelReasoning(args.summary || 'Automation plan ready for review.')
          });
        }
      } else {
        result = await callToolApi(automation, tc.name, args, dryRun);
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 20000)
      });

      await sendCallback(job, {
        event: 'log',
        log: `[runner] tool ${tc.name}${dryRun ? ' (dry-run)' : ''}: ${
          result.error || result.denied ? 'denied/error' : 'ok'
        }`
      });
    }

    if (finished) break;

    if (submittedPlan) {
      // Poll until apply / stop / pause
      await sendCallback(job, {
        event: 'progress',
        progress: 80,
        log: `[runner] Waiting for admin Apply…`
      });
      let applied = false;
      for (let i = 0; i < 3600; i++) {
        if (job.cancelRequested) {
          throw Object.assign(new Error('Cancelled by user'), { cancelled: true });
        }
        await new Promise((r) => setTimeout(r, 2000));
        const st = await getStatus(automation);
        if (st.control === 'stop' || st.status === 'stopped') {
          throw Object.assign(new Error('Stopped by user'), { cancelled: true });
        }
        if (st.control === 'pause' || st.status === 'paused') {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (st.control === 'apply') {
          const applyResult = await applyPlan(automation);
          await sendCallback(job, {
            event: 'progress',
            progress: 90,
            log: `[runner] Apply ${applyResult.ok ? 'succeeded' : 'failed'}: ${
              applyResult.error || applyResult.idempotent ? 'idempotent' : 'ok'
            }`
          });
          messages.push({
            role: 'user',
            content: `Admin Apply result: ${JSON.stringify(applyResult).slice(0, 8000)}. Call finish with a summary.`
          });
          applied = true;
          break;
        }
      }
      if (!applied && !finished) {
        throw new Error('Timed out waiting for admin Apply');
      }
      submittedPlan = false; // allow finish loop
    }
  }

  const summary =
    stripModelReasoning(finished?.summary || '').trim() ||
    'Automation finished.';

  updateJob(job.jobId, {
    status: 'done',
    progress: 100,
    result: { summary, mode: 'automation', ...(finished || {}) }
  });
  await sendCallback(job, {
    event: 'done',
    progress: 100,
    status: 'done',
    comment: summary,
    log: `[runner] Automation finished`
  });
  removeJob(job.jobId);
}
