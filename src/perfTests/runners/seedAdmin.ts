import {
  createSprint,
  createTag,
  createUser,
  deleteSprint,
  deleteTag,
  deleteUser,
  getAllSprints,
  getTags,
  getUsers,
} from '../../api';
import { beginRun, finishRun, recordOp, timeOp, type PerfRunRecord } from '../metrics';
import { isAbortError, pickRandom, sleep } from '../lorem';

/** Fixed password for seeded active local users (no invite). */
export const PERF_SEED_USER_PASSWORD = 'PerfTest1!';

const TAG_COLORS = [
  '#4ECDC4',
  '#FF6B6B',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
];

const FIRST_NAMES = [
  'Alex', 'Blair', 'Casey', 'Dana', 'Eden', 'Finn', 'Gray', 'Harper',
  'Indie', 'Jules', 'Kai', 'Lane', 'Morgan', 'Noa', 'Oak', 'Quinn',
  'Remy', 'Sage', 'Tate', 'Uma', 'Val', 'Wren', 'Yael', 'Zion',
];

const LAST_NAMES = [
  'Adams', 'Brooks', 'Chen', 'Diaz', 'Evans', 'Frost', 'Garcia', 'Hayes',
  'Ito', 'Jones', 'Khan', 'Lee', 'Martinez', 'Nguyen', 'Ortiz', 'Patel',
  'Quinn', 'Reyes', 'Singh', 'Turner', 'Underwood', 'Vargas', 'Walsh', 'Young',
];

const TAG_WORDS = [
  'alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'indigo', 'jade', 'kite', 'lunar', 'maple', 'nova', 'orbit', 'pulse',
  'quartz', 'river', 'solar', 'tide', 'ultra', 'vortex', 'wave', 'xenon',
];

export function isPerfSeedUserEmail(email: string): boolean {
  return /^perf\.user\..+@local$/i.test(String(email || '').trim());
}

export function isPerfSeedTagName(name: string): boolean {
  return /^perf-tag-/i.test(String(name || '').trim());
}

export function isPerfSeedSprintName(name: string): boolean {
  return /^Perf Sprint /i.test(String(name || '').trim());
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export interface SeedCountOptions {
  count: number;
  concurrency?: number;
  signal: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

async function runPool(
  count: number,
  concurrency: number,
  signal: AbortSignal,
  workerFn: (index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<{ cancelled: boolean }> {
  const workers = Math.max(1, Math.min(20, Math.floor(concurrency) || 1));
  let nextIndex = 1;
  let completed = 0;
  let cancelled = false;

  const worker = async () => {
    while (!signal.aborted) {
      const i = nextIndex;
      nextIndex += 1;
      if (i > count) return;
      try {
        await workerFn(i);
      } catch (err) {
        if (isAbortError(err)) {
          cancelled = true;
          return;
        }
        throw err;
      }
      completed += 1;
      onProgress?.(completed, count);
      try {
        await sleep(0, signal);
      } catch (err) {
        if (isAbortError(err)) {
          cancelled = true;
          return;
        }
        throw err;
      }
    }
    cancelled = true;
  };

  await Promise.all(
    Array.from({ length: Math.min(workers, count) }, () => worker())
  );
  if (signal.aborted) cancelled = true;
  return { cancelled };
}

export async function runSeedUsers(opts: SeedCountOptions): Promise<PerfRunRecord> {
  const concurrency = Math.max(1, Math.min(20, opts.concurrency ?? 1));
  const startedAt = new Date().toISOString();
  beginRun();

  const batchId = Date.now();
  const { cancelled } = await runPool(
    opts.count,
    concurrency,
    opts.signal,
    async (i) => {
      const firstName = pickRandom(FIRST_NAMES) || 'Perf';
      const lastName = pickRandom(LAST_NAMES) || 'User';
      const email = `perf.user.${batchId}.${i}@local`;
      const { sample } = await timeOp(() =>
        createUser({
          email,
          password: PERF_SEED_USER_PASSWORD,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.slice(0, 30),
          role: 'user',
          isActive: true, // active local account — no invite email
        })
      );
      recordOp(sample);
    },
    opts.onProgress
  );

  return finishRun({
    scenario: 'seed-users',
    boardId: 'admin',
    params: {
      count: opts.count,
      concurrency,
      emailPattern: 'perf.user.<batch>.N@local',
    },
    startedAt,
    cancelled,
  });
}

export async function runSeedTags(opts: SeedCountOptions): Promise<PerfRunRecord> {
  const concurrency = Math.max(1, Math.min(20, opts.concurrency ?? 1));
  const startedAt = new Date().toISOString();
  beginRun();

  const batchId = Date.now();
  const { cancelled } = await runPool(
    opts.count,
    concurrency,
    opts.signal,
    async (i) => {
      const word = pickRandom(TAG_WORDS) || 'seed';
      const tag = `perf-tag-${word}-${batchId}-${i}`;
      const { sample } = await timeOp(() =>
        createTag({
          tag,
          description: `Perf seed tag #${i}`,
          color: pickRandom(TAG_COLORS) || '#4ECDC4',
        })
      );
      recordOp(sample);
    },
    opts.onProgress
  );

  return finishRun({
    scenario: 'seed-tags',
    boardId: 'admin',
    params: { count: opts.count, concurrency },
    startedAt,
    cancelled,
  });
}

export async function runSeedSprints(opts: SeedCountOptions): Promise<PerfRunRecord> {
  const concurrency = 1; // date windows are sequential — keep order stable
  const startedAt = new Date().toISOString();
  beginRun();

  const batchId = Date.now();
  // Anchor windows on the upcoming Monday so ranges don't collide oddly
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const day = today.getDay();
  const toMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  let cursor = addDays(today, toMonday + opts.count * 14); // start ahead to reduce overlap with real sprints

  const { cancelled } = await runPool(
    opts.count,
    concurrency,
    opts.signal,
    async (i) => {
      const start = cursor;
      const end = addDays(start, 13); // 2-week sprint
      cursor = addDays(end, 1);
      const { sample } = await timeOp(() =>
        createSprint({
          name: `Perf Sprint ${batchId}-${i}`,
          start_date: toDateInput(start),
          end_date: toDateInput(end),
          is_active: false,
          description: `Perf seed sprint #${i}`,
        })
      );
      recordOp(sample);
    },
    opts.onProgress
  );

  return finishRun({
    scenario: 'seed-sprints',
    boardId: 'admin',
    params: { count: opts.count },
    startedAt,
    cancelled,
  });
}

export interface SeedAllOptions {
  users: number;
  tags: number;
  sprints: number;
  concurrency?: number;
  signal: AbortSignal;
  onStatus?: (message: string) => void;
}

export async function runSeedAll(opts: SeedAllOptions): Promise<PerfRunRecord[]> {
  const concurrency = opts.concurrency ?? 3;
  const runs: PerfRunRecord[] = [];

  if (opts.users > 0 && !opts.signal.aborted) {
    opts.onStatus?.(`Seeding ${opts.users} users…`);
    runs.push(
      await runSeedUsers({
        count: opts.users,
        concurrency,
        signal: opts.signal,
        onProgress: (d, t) => opts.onStatus?.(`Users ${d}/${t}…`),
      })
    );
  }
  if (opts.tags > 0 && !opts.signal.aborted) {
    opts.onStatus?.(`Seeding ${opts.tags} tags…`);
    runs.push(
      await runSeedTags({
        count: opts.tags,
        concurrency,
        signal: opts.signal,
        onProgress: (d, t) => opts.onStatus?.(`Tags ${d}/${t}…`),
      })
    );
  }
  if (opts.sprints > 0 && !opts.signal.aborted) {
    opts.onStatus?.(`Seeding ${opts.sprints} sprints…`);
    runs.push(
      await runSeedSprints({
        count: opts.sprints,
        signal: opts.signal,
        onProgress: (d, t) => opts.onStatus?.(`Sprints ${d}/${t}…`),
      })
    );
  }

  return runs;
}

export async function runSeedCleanup(opts: {
  signal: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<PerfRunRecord> {
  const startedAt = new Date().toISOString();
  beginRun();
  let cancelled = false;

  // Users
  opts.onProgress?.('Finding seed users…');
  let users: any[] = [];
  try {
    users = await getUsers();
  } catch {
    users = [];
  }
  const seedUsers = (Array.isArray(users) ? users : []).filter((u) =>
    isPerfSeedUserEmail(u.email || '')
  );
  for (const u of seedUsers) {
    if (opts.signal.aborted) {
      cancelled = true;
      break;
    }
    opts.onProgress?.(`Deleting user ${u.email}…`);
    const { sample } = await timeOp(() => deleteUser(u.id));
    recordOp(sample);
  }

  // Tags
  if (!opts.signal.aborted) {
    opts.onProgress?.('Finding seed tags…');
    let tags: any[] = [];
    try {
      tags = await getTags();
    } catch {
      tags = [];
    }
    const seedTags = (Array.isArray(tags) ? tags : []).filter((t) =>
      isPerfSeedTagName(t.tag || t.name || '')
    );
    for (const t of seedTags) {
      if (opts.signal.aborted) {
        cancelled = true;
        break;
      }
      opts.onProgress?.(`Deleting tag ${t.tag || t.id}…`);
      const { sample } = await timeOp(() => deleteTag(Number(t.id)));
      recordOp(sample);
    }
  }

  // Sprints
  if (!opts.signal.aborted) {
    opts.onProgress?.('Finding seed sprints…');
    let sprints: any[] = [];
    try {
      sprints = await getAllSprints();
    } catch {
      sprints = [];
    }
    const seedSprints = (Array.isArray(sprints) ? sprints : []).filter((s) =>
      isPerfSeedSprintName(s.name || '')
    );
    for (const s of seedSprints) {
      if (opts.signal.aborted) {
        cancelled = true;
        break;
      }
      opts.onProgress?.(`Deleting sprint ${s.name}…`);
      const { sample } = await timeOp(() => deleteSprint(s.id));
      recordOp(sample);
    }
  }

  if (opts.signal.aborted) cancelled = true;

  return finishRun({
    scenario: 'seed-cleanup',
    boardId: 'admin',
    params: {
      usersMatched: seedUsers.length,
    },
    startedAt,
    cancelled,
  });
}
