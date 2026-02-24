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
  revision: number;
  last_updated_at: string;
  last_updated_epoch_ms: number;
};

export type SoulUpdateInput = {
  role?: string;
  node_env?: string;
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

function beat(): void {
  const now = Date.now();
  heartbeatState.sequence += 1;
  heartbeatState.last_beat_epoch_ms = now;
  heartbeatState.last_beat_at = new Date(now).toISOString();
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
  soulState.revision += 1;
  soulState.last_updated_epoch_ms = now;
  soulState.last_updated_at = new Date(now).toISOString();
  return { ...soulState };
}

export function getLifecycleSnapshot(): {
  status: "ok" | "stale";
  heartbeat: HeartbeatState & { stale_threshold_ms: number; age_ms: number };
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
