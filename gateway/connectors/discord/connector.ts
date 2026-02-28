import type { Event } from "../../core/event";

export interface Connector {
  toEvent(input: unknown): Event;
  sendReply(threadId: string, text: string): Promise<void>;
}

/**
 * Discord connector — placeholder.
 * To implement: add discord.js or direct HTTP interaction with Discord API.
 * Required env: DISCORD_BOT_TOKEN
 */
export const connector: Connector = {
  toEvent() {
    throw new Error("Discord connector is not yet implemented. Set DISCORD_BOT_TOKEN and implement event parsing.");
  },
  async sendReply() {
    throw new Error("Discord connector is not yet implemented. Set DISCORD_BOT_TOKEN and implement outbound reply.");
  },
};
