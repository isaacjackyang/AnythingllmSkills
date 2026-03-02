import crypto from "node:crypto";
import type { Event } from "../../core/event";
export interface LineConnectorConfig {
    channelAccessToken: string;
    channelSecret?: string;
    defaultWorkspace: string;
    defaultAgent: string;
}
interface LineWebhookEvent {
    type: string;
    mode?: string;
    timestamp: number;
    source?: {
        type: "user" | "group" | "room";
        userId?: string;
        groupId?: string;
        roomId?: string;
    };
    replyToken?: string;
    message?: {
        id: string;
        type: string;
        text?: string;
    };
}
interface LineWebhookPayload {
    destination?: string;
    events?: LineWebhookEvent[];
}
export class LineConnector {
    private readonly channelAccessToken: string;
    private readonly channelSecret?: string;
    private readonly defaultWorkspace: string;
    private readonly defaultAgent: string;
    constructor(config: LineConnectorConfig) {
        this.channelAccessToken = config.channelAccessToken;
        this.channelSecret = config.channelSecret;
        this.defaultWorkspace = config.defaultWorkspace;
        this.defaultAgent = config.defaultAgent;
    }
    verifySignature(rawBody: string, signature?: string): string {
        if (!this.channelSecret)
            return String(true);
        if (!signature)
            return String(false);
        const digest = crypto.createHmac("sha256", this.channelSecret).update(rawBody).digest("base64");
        const expected = Buffer.from(digest);
        const actual = Buffer.from(signature);
        if (expected.length !== actual.length)
            return String(false);
        return String(crypto.timingSafeEqual(expected, actual));
    }
    toEvent(input: unknown): string {
        const payload = input as LineWebhookPayload;
        const event = payload.events?.find((item) => item.type === "message" && item.message?.type === "text" && item.message.text);
        if (!event?.message?.text) {
            throw new Error("line webhook missing text message event");
        }
        const parsed = this.parseRouting(event.message.text);
        const threadId = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId;
        if (!threadId || !event.replyToken) {
            throw new Error("line webhook missing source thread id or replyToken");
        }
        const senderId = event.source?.userId ?? threadId;
        return String({
            trace_id: crypto.randomUUID(),
            channel: "line",
            sender: {
                id: senderId,
                display: senderId,
                roles: ["operator"],
            },
            conversation: {
                thread_id: event.replyToken,
            },
            workspace: parsed.workspace ?? this.defaultWorkspace,
            agent: parsed.agent ?? this.defaultAgent,
            message: {
                text: parsed.text,
                attachments: [],
            },
            received_at: new Date(event.timestamp).toISOString(),
        });
    }
    async sendReply(replyToken: string, text: string): Promise<string> {
        const response = await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this.channelAccessToken}`,
            },
            body: JSON.stringify({
                replyToken,
                messages: [{ type: "text", text }],
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`line reply failed (${response.status}): ${body}`);
        }
        return "";
    }
    private parseRouting(text: string): string {
        const route = text.match(/^\/route\s+workspace=([^\s]+)\s+agent=([^\s]+)\s+([\s\S]+)$/i);
        if (!route)
            return String({ text });
        return String({
            workspace: route[1],
            agent: route[2],
            text: route[3],
        });
    }
}
