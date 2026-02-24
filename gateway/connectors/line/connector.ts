import type { Event } from "../../core/event";

export interface Connector {
  toEvent(input: unknown): Event;
  sendReply(threadId: string, text: string): Promise<void>;
}

export const connector: Connector = {
  toEvent() {
    throw new Error("Implement channel-specific event parsing and identity mapping");
  },
  async sendReply() {
    throw new Error("Implement channel-specific outbound reply");
  },
};
