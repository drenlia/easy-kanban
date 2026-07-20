export type PerfScenarioId = 'generate' | 'move' | 'cleanup';

export interface PerfOpSample {
  ms: number;
  ok: boolean;
  error?: string;
}

export interface PerfRunRecord {
  id: string;
  scenario: PerfScenarioId;
  boardId: string;
  params: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  latencyMs: {
    min: number;
    mean: number;
    p50: number;
    p95: number;
    max: number;
  } | null;
  opsPerSec: number | null;
  errors: string[];
}

const HISTORY_KEY = 'perfTests.history';
const MAX_HISTORY = 20;

let activeSamples: PerfOpSample[] = [];
let lastRun: PerfRunRecord | null = null;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarizeLatencies(samples: PerfOpSample[]): PerfRunRecord['latencyMs'] {
  const ok = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
  if (ok.length === 0) return null;
  const sum = ok.reduce((a, b) => a + b, 0);
  return {
    min: ok[0],
    mean: Math.round(sum / ok.length),
    p50: percentile(ok, 50),
    p95: percentile(ok, 95),
    max: ok[ok.length - 1],
  };
}

export function beginRun(): void {
  activeSamples = [];
}

export function recordOp(sample: PerfOpSample): void {
  activeSamples.push(sample);
}

export function finishRun(input: {
  scenario: PerfScenarioId;
  boardId: string;
  params: Record<string, unknown>;
  startedAt: string;
  cancelled: boolean;
}): PerfRunRecord {
  const endedAt = new Date().toISOString();
  const attempted = activeSamples.length;
  const succeeded = activeSamples.filter((s) => s.ok).length;
  const failed = attempted - succeeded;
  const latencyMs = summarizeLatencies(activeSamples);
  const durationSec =
    (new Date(endedAt).getTime() - new Date(input.startedAt).getTime()) / 1000;
  const opsPerSec =
    durationSec > 0 && succeeded > 0 ? Math.round((succeeded / durationSec) * 100) / 100 : null;

  const record: PerfRunRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scenario: input.scenario,
    boardId: input.boardId,
    params: input.params,
    startedAt: input.startedAt,
    endedAt,
    attempted,
    succeeded,
    failed,
    cancelled: input.cancelled,
    latencyMs,
    opsPerSec,
    errors: activeSamples
      .filter((s) => !s.ok && s.error)
      .slice(-8)
      .map((s) => s.error as string),
  };

  lastRun = record;
  pushHistory(record);
  activeSamples = [];
  return record;
}

export function getLastRun(): PerfRunRecord | null {
  return lastRun;
}

export function getHistory(): PerfRunRecord[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushHistory(record: PerfRunRecord): void {
  try {
    const prev = getHistory();
    const next = [record, ...prev].slice(0, MAX_HISTORY);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export async function timeOp<T>(fn: () => Promise<T>): Promise<{ result?: T; sample: PerfOpSample }> {
  const t0 = performance.now();
  try {
    const result = await fn();
    return { result, sample: { ms: Math.round(performance.now() - t0), ok: true } };
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { error?: string }; status?: number } }).response?.data?.error
            || (err as { response?: { status?: number } }).response?.status
            || (err as Error).message)
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      sample: {
        ms: Math.round(performance.now() - t0),
        ok: false,
        error: message,
      },
    };
  }
}
