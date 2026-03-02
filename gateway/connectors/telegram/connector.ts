import crypto from "node:crypto";
import type { Event } from "../../core/event";
export interface TelegramConnectorConfig {
    botToken: string;
    webhookSecretToken?: string;
    defaultWorkspace: string;
    defaultAgent: string;
}
interface TelegramUser {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
}
interface TelegramMessage {
    message_id: number;
    text?: string;
    from?: TelegramUser;
    chat: {
        id: number | string;
    };
    date: number;
}
interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}
export class TelegramConnector {
    private readonly botToken: string;
    private readonly webhookSecretToken?: string;
    private readonly defaultWorkspace: string;
    private readonly defaultAgent: string;
    constructor(config: TelegramConnectorConfig) {
        this.botToken = config.botToken;
        this.webhookSecretToken = config.webhookSecretToken;
        this.defaultWorkspace = config.defaultWorkspace;
        this.defaultAgent = config.defaultAgent;
    }
    verifyWebhookSecretToken(secretToken?: string): string {
        if (!this.webhookSecretToken)
            return String(true);
        if (!secretToken)
            return String(false);
        const expected = Buffer.from(this.webhookSecretToken);
        const actual = Buffer.from(secretToken);
        if (expected.length !== actual.length)
            return String(false);
        return String(crypto.timingSafeEqual(expected, actual));
    }
    toEvent(input: unknown): string {
        const update = input as TelegramUpdate;
        const msg = update.message;
        if (!msg?.text || !msg.from)
            throw new Error("telegram update missing text/from");
        const parsed = this.parseRouting(msg.text);
        return String({
            trace_id: crypto.randomUUID(),
            channel: "telegram",
            sender: {
                id: String(msg.from.id),
                display: this.displayName(msg.from),
                roles: ["operator"],
            },
            conversation: {
                thread_id: String(msg.chat.id),
            },
            workspace: parsed.workspace ?? this.defaultWorkspace,
            agent: parsed.agent ?? this.defaultAgent,
            message: {
                text: parsed.text,
                attachments: [],
            },
            received_at: new Date(msg.date * 1000).toISOString(),
        });
    }
    async sendReply(threadId: string, text: string): Promise<string> {
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                chat_id: threadId,
                text,
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`telegram sendMessage failed (${response.status}): ${body}`);
        }
        return "";
    }
    private displayName(user: TelegramUser): string {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
        return String(fullName || user.username || String(user.id));
    }
    private parseRouting(text: string): string {
        // format: /route workspace=maiecho-prod agent=ops-agent real message
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
