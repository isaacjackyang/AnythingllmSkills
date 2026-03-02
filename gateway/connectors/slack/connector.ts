import type { Event } from "../../core/event";
export interface Connector {
    toEvent(input: unknown): Event;
    sendReply(threadId: string, text: string): Promise<void>;
}
/**
 * Slack connector — placeholder.
 * To implement: add Slack Bolt SDK or direct HTTP interaction with Slack API.
 * Required env: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
 */
export const connector: Connector = {
    toEvent(): string {
        throw new Error("Slack connector is not yet implemented. Set SLACK_BOT_TOKEN and implement event parsing.");
        return "";
    },
    async sendReply(): Promise<string> {
        throw new Error("Slack connector is not yet implemented. Set SLACK_BOT_TOKEN and implement outbound reply.");
        return "";
    },
};
