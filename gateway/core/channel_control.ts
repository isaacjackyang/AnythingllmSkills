export type ChannelKey = "telegram" | "line" | "web_ui";

export type ChannelState = {
  enabled: boolean;
  connected: boolean;
  updated_at: string;
  last_activity_at: string | null;
};

export type ChannelSnapshot = Record<ChannelKey, ChannelState>;

const defaultSnapshot = (): ChannelSnapshot => {
  const now = new Date().toISOString();
  return {
    telegram: { enabled: true, connected: false, updated_at: now, last_activity_at: null },
    line: { enabled: true, connected: false, updated_at: now, last_activity_at: null },
    web_ui: { enabled: true, connected: false, updated_at: now, last_activity_at: null },
  };
};

let channels: ChannelSnapshot = defaultSnapshot();
const CHANNEL_ACTIVITY_TTL_MS = Number(process.env.CHANNEL_ACTIVITY_TTL_MS ?? 60_000);

function isRecentlyActive(lastActivityAt: string | null, nowMs = Date.now()): boolean {
  if (!lastActivityAt) return false;
  const activityMs = Date.parse(lastActivityAt);
  if (Number.isNaN(activityMs)) return false;
  return nowMs - activityMs <= CHANNEL_ACTIVITY_TTL_MS;
}

function normalizeChannelState(state: ChannelState, nowMs = Date.now()): ChannelState {
  const connected = state.enabled && isRecentlyActive(state.last_activity_at, nowMs);
  return { ...state, connected };
}

export function getChannelSnapshot(): ChannelSnapshot {
  const nowMs = Date.now();
  return {
    telegram: normalizeChannelState(channels.telegram, nowMs),
    line: normalizeChannelState(channels.line, nowMs),
    web_ui: normalizeChannelState(channels.web_ui, nowMs),
  };
}

export function setChannelEnabled(channel: ChannelKey, enabled: boolean): ChannelSnapshot {
  const current = channels[channel];
  channels[channel] = {
    ...current,
    enabled,
    connected: enabled ? isRecentlyActive(current.last_activity_at) : false,
    updated_at: new Date().toISOString(),
  };
  return getChannelSnapshot();
}

export function markChannelActivity(channel: ChannelKey): ChannelSnapshot {
  const now = new Date().toISOString();
  channels[channel] = {
    ...channels[channel],
    connected: true,
    last_activity_at: now,
    updated_at: now,
  };
  return getChannelSnapshot();
}

export function isChannelEnabled(channel: ChannelKey): boolean {
  return channels[channel].enabled;
}

export function __resetChannelControlForTest(): void {
  channels = defaultSnapshot();
}


export function __setChannelLastActivityForTest(channel: ChannelKey, lastActivityAt: string | null): void {
  channels[channel] = {
    ...channels[channel],
    last_activity_at: lastActivityAt,
    updated_at: new Date().toISOString(),
  };
}
