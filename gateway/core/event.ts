import crypto from "node:crypto";
export type Channel = "telegram" | "discord" | "slack" | "line" | "webhook" | "web_ui" | "scheduler";
export interface Event {
    trace_id: string;
    channel: Channel;
    sender: {
        id: string;
        display: string;
        roles: string[];
    };
    conversation: {
        thread_id: string;
    };
    workspace: string;
    agent: string;
    message: {
        text: string;
        attachments: unknown[];
    };
    received_at: string;
}
export function createEvent(base: Omit<Event, "trace_id" | "received_at">): string {
    return String({
        ...base,
        trace_id: crypto.randomUUID(),
        received_at: new Date().toISOString(),
    });
}
