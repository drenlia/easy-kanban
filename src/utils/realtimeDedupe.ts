/**
 * Client-side dedupe for Socket.IO events that may be emitted once per K8s replica
 * (PostgreSQL NOTIFY delivered to every pod, each runs io.to(...).emit with Redis adapter).
 *
 * Server adds `_rtId` (UUID) on object payloads via `notificationService.publish`.
 * `_notifyTenantId` is server-only routing metadata and is stripped here if present.
 * Events without `_rtId` are always delivered (backwards compatible).
 */

const MAX_KEYS = 600;
const TTL_MS = 45_000;

/** eventName + _rtId -> expiry time */
const seen = new Map<string, number>();

function prune(now: number): void {
  for (const [key, exp] of seen) {
    if (exp <= now) seen.delete(key);
  }
}

function evictOldestBeyondCap(): void {
  while (seen.size > MAX_KEYS) {
    const oldest = seen.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

/**
 * Filter duplicate realtime deliveries. Strips `_rtId` from the first argument when present.
 */
export function prepareRealtimeSocketArgs(eventName: string, args: unknown[]): { deliver: boolean; args: unknown[] } {
  if (args.length === 0) {
    return { deliver: true, args };
  }

  const first = args[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    return { deliver: true, args };
  }

  const rec = first as Record<string, unknown>;
  const rtId = rec._rtId;
  if (typeof rtId !== 'string' || rtId.length < 8) {
    if (typeof rec._notifyTenantId === 'string') {
      const rest = { ...rec };
      delete rest._notifyTenantId;
      return { deliver: true, args: [rest, ...args.slice(1)] };
    }
    return { deliver: true, args };
  }

  const now = Date.now();
  prune(now);

  const key = `${eventName}:${rtId}`;
  if (seen.has(key)) {
    return { deliver: false, args };
  }

  seen.set(key, now + TTL_MS);
  evictOldestBeyondCap();

  const rest = { ...rec };
  delete rest._rtId;
  delete rest._notifyTenantId;
  return { deliver: true, args: [rest, ...args.slice(1)] };
}
