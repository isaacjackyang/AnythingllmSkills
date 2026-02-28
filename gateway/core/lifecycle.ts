import os from "node:os";
import crypto from "node:crypto";

type HeartbeatState = {
  sequence: number;
  interval_ms: number;
  last_beat_at: string;
  last_beat_epoch_ms: number;
};

type SoulState = {
  instance_id: string;
  node_env: string;
  hostname: string;
  pid: number;
  started_at: string;
  started_at_epoch_ms: number;
  role: string;
  thinking_strategy: string;
  revision: number;
  last_updated_at: string;
  last_updated_epoch_ms: number;
};

export type SoulUpdateInput = {
  role?: string;
  node_env?: string;
  thinking_strategy?: string;
};

const defaultHeartbeatMs = parseHeartbeatInterval(process.env.HEARTBEAT_INTERVAL_MS, 10_000);
const startedAtEpochMs = Date.now();

const soulState: SoulState = {
  instance_id: process.env.INSTANCE_ID ?? crypto.randomUUID(),
  node_env: process.env.NODE_ENV ?? "development",
  hostname: os.hostname(),
  pid: process.pid,
  started_at: new Date(startedAtEpochMs).toISOString(),
  started_at_epoch_ms: startedAtEpochMs,
  role: process.env.SOUL_ROLE ?? "gateway",
  thinking_strategy: process.env.SOUL_THINKING_STRATEGY ?? "compositional_generalization",
  revision: 1,
  last_updated_at: new Date(startedAtEpochMs).toISOString(),
  last_updated_epoch_ms: startedAtEpochMs,
};

const heartbeatState: HeartbeatState = {
  sequence: 0,
  interval_ms: defaultHeartbeatMs,
  last_beat_at: new Date(startedAtEpochMs).toISOString(),
  last_beat_epoch_ms: startedAtEpochMs,
};

let heartbeatTimer: NodeJS.Timeout | null = null;

/* ── Heartbeat Hooks (autonomy engine) ─────────────────── */

export type HeartbeatHook = (snapshot: ReturnType<typeof getLifecycleSnapshot>) => void | Promise<void>;

const heartbeatHooks: Array<{ name: string; hook: HeartbeatHook; intervalBeats: number; lastRanAt: number }> = [];

/**
 * Register a hook that runs every N heartbeats.
 * This is the extension point for autonomy features:
 * - Pending message checks
 * - Expired approval cleanup
 * - Memory sync triggers
 * - Stale task cleanup
 * - Self-health monitoring
 */
export function registerHeartbeatHook(name: string, hook: HeartbeatHook, intervalBeats = 1): void {
  heartbeatHooks.push({ name, hook, intervalBeats, lastRanAt: 0 });
}

async function runHeartbeatHooks(): Promise<void> {
  const snapshot = getLifecycleSnapshot();
  for (const entry of heartbeatHooks) {
    if (heartbeatState.sequence - entry.lastRanAt >= entry.intervalBeats) {
      entry.lastRanAt = heartbeatState.sequence;
      try {
        await entry.hook(snapshot);
      } catch (error) {
        console.warn(`[heartbeat] hook "${entry.name}" failed:`, (error as Error).message);
      }
    }
  }
}

/* ── Core heartbeat ────────────────────────────────── */

function beat(): void {
  const now = Date.now();
  heartbeatState.sequence += 1;
  heartbeatState.last_beat_epoch_ms = now;
  heartbeatState.last_beat_at = new Date(now).toISOString();
  // Fire hooks asynchronously — don't block the timer
  void runHeartbeatHooks();
}

export function parseHeartbeatInterval(raw: string | number | undefined, fallbackMs = 10_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return Math.floor(n);
}

export function startHeartbeat(intervalMs = defaultHeartbeatMs): void {
  if (heartbeatTimer) return;
  const normalized = parseHeartbeatInterval(intervalMs, defaultHeartbeatMs);
  heartbeatState.interval_ms = normalized;
  beat();
  heartbeatTimer = setInterval(beat, normalized);
  heartbeatTimer.unref();
}

export function stopHeartbeat(): void {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export function updateSoul(input: SoulUpdateInput): SoulState {
  const now = Date.now();
  if (typeof input.role === "string" && input.role.trim()) {
    soulState.role = input.role.trim();
  }
  if (typeof input.node_env === "string" && input.node_env.trim()) {
    soulState.node_env = input.node_env.trim();
  }
  if (typeof input.thinking_strategy === "string" && input.thinking_strategy.trim()) {
    soulState.thinking_strategy = input.thinking_strategy.trim();
  }
  soulState.revision += 1;
  soulState.last_updated_epoch_ms = now;
  soulState.last_updated_at = new Date(now).toISOString();
  return { ...soulState };
}

export function getLifecycleSnapshot(): {
  status: "ok" | "stale";
  heartbeat: HeartbeatState & { stale_threshold_ms: number; age_ms: number; hooks_registered: number };
  soul: SoulState & { uptime_ms: number };
} {
  const now = Date.now();
  const ageMs = now - heartbeatState.last_beat_epoch_ms;
  const staleThresholdMs = heartbeatState.interval_ms * 3;

  return {
    status: ageMs > staleThresholdMs ? "stale" : "ok",
    heartbeat: {
      ...heartbeatState,
      stale_threshold_ms: staleThresholdMs,
      age_ms: ageMs,
      hooks_registered: heartbeatHooks.length,
    },
    soul: {
      ...soulState,
      uptime_ms: now - soulState.started_at_epoch_ms,
    },
  };
}

export function __setLastBeatEpochMsForTest(epochMs: number): void {
  heartbeatState.last_beat_epoch_ms = epochMs;
  heartbeatState.last_beat_at = new Date(epochMs).toISOString();
}

export function __clearHeartbeatHooksForTest(): void {
  heartbeatHooks.length = 0;
}
