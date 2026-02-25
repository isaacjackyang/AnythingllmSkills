export type ChannelKey = "telegram" | "line" | "web_ui";

export type ChannelState = {
  enabled: boolean;
  updated_at: string;
};

export type ChannelSnapshot = Record<ChannelKey, ChannelState>;

const defaultSnapshot = (): ChannelSnapshot => {
  const now = new Date().toISOString();
  return {
    telegram: { enabled: true, updated_at: now },
    line: { enabled: true, updated_at: now },
    web_ui: { enabled: true, updated_at: now },
  };
};

let channels: ChannelSnapshot = defaultSnapshot();

export function getChannelSnapshot(): ChannelSnapshot {
  return {
    telegram: { ...channels.telegram },
    line: { ...channels.line },
    web_ui: { ...channels.web_ui },
  };
}

export function setChannelEnabled(channel: ChannelKey, enabled: boolean): ChannelSnapshot {
  channels[channel] = {
    enabled,
    updated_at: new Date().toISOString(),
  };
  return getChannelSnapshot();
}

export function isChannelEnabled(channel: ChannelKey): boolean {
  return channels[channel].enabled;
}

export function __resetChannelControlForTest(): void {
  channels = defaultSnapshot();
}
